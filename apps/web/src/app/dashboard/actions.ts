"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Host } from "@ownmyownai/supabase-types";

async function restHeaders() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return {
    Authorization: `Bearer ${token}`,
    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    "Content-Type": "application/json",
  };
}

export async function renameHost(hostId: string, name: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/hosts?id=eq.${encodeURIComponent(hostId)}`,
    {
      method: "PATCH",
      headers: { ...(await restHeaders()), Prefer: "return=minimal" },
      body: JSON.stringify({ name }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    return { error: text || "Échec du renommage" };
  }

  revalidatePath("/dashboard");
  return { error: null };
}

export async function deleteHost(hostId: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/hosts?id=eq.${encodeURIComponent(hostId)}`,
    {
      method: "DELETE",
      headers: await restHeaders(),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    return { error: text || "Échec de la suppression" };
  }

  revalidatePath("/dashboard");
  return { error: null };
}

export async function deleteOfflineHostsOlderThan(days: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié", deleted: 0 };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const { data: hosts, error: fetchError } = await supabase
    .from("hosts")
    .select("id, status, last_seen_at")
    .eq("user_id", user.id)
    .eq("status", "offline");

  if (fetchError) return { error: fetchError.message, deleted: 0 };

  const rows = (hosts ?? []) as Pick<Host, "id" | "status" | "last_seen_at">[];
  const stale = rows.filter((h) => {
    if (!h.last_seen_at) return true;
    return new Date(h.last_seen_at) < cutoff;
  });

  if (stale.length === 0) return { error: null, deleted: 0 };

  const ids = stale.map((h) => h.id);
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/hosts?id=in.(${ids.join(",")})`,
    { method: "DELETE", headers: await restHeaders() },
  );

  if (!res.ok) {
    return { error: await res.text(), deleted: 0 };
  }

  revalidatePath("/dashboard");
  return { error: null, deleted: ids.length };
}

export async function deleteDuplicateHosts() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié", deleted: 0 };

  const { data: hosts, error: fetchError } = await supabase
    .from("hosts")
    .select("id, name, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (fetchError) return { error: fetchError.message, deleted: 0 };

  const seen = new Map<string, string>();
  const toDelete: string[] = [];
  const hostRows = (hosts ?? []) as Pick<Host, "id" | "name" | "created_at">[];
  for (const host of hostRows) {
    const key = host.name.trim().toLowerCase();
    if (seen.has(key)) {
      toDelete.push(host.id);
    } else {
      seen.set(key, host.id);
    }
  }

  if (toDelete.length === 0) return { error: null, deleted: 0 };

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/hosts?id=in.(${toDelete.join(",")})`,
    { method: "DELETE", headers: await restHeaders() },
  );

  if (!res.ok) {
    return { error: await res.text(), deleted: 0 };
  }

  revalidatePath("/dashboard");
  return { error: null, deleted: toDelete.length };
}

export async function updateDefaultModel(hostId: string, defaultModel: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/hosts?id=eq.${encodeURIComponent(hostId)}`,
    {
      method: "PATCH",
      headers: { ...(await restHeaders()), Prefer: "return=minimal" },
      body: JSON.stringify({ default_model: defaultModel }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    return { error: text || "Échec de la mise à jour du modèle" };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/chat/${hostId}`);
  return { error: null };
}
