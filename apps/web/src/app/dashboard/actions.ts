"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
