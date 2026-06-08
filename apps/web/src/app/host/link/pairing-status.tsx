"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

interface PairingStatusProps {
  code: string | null;
}

export function PairingStatus({ code }: PairingStatusProps) {
  const [hostId, setHostId] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    const supabase = createClient();
    const interval = window.setInterval(async () => {
      const { data: row } = await supabase
        .from("pairing_requests")
        .select("consumed_at, host_id")
        .eq("code", code)
        .maybeSingle();
      const data = row as { consumed_at: string | null; host_id: string | null } | null;
      if (data?.consumed_at && data.host_id) {
        setHostId(data.host_id);
        window.clearInterval(interval);
      }
    }, 3000);
    return () => window.clearInterval(interval);
  }, [code]);

  if (!hostId) return null;

  return (
    <div className="mt-4 rounded-lg border border-brand-500/40 bg-brand-600/10 p-4 text-center">
      <p className="mb-2 text-sm text-brand-300">PC lié avec succès !</p>
      <Link href="/dashboard">
        <Button>Voir mon PC</Button>
      </Link>
      <Link href={`/chat/${hostId}`} className="ml-2 inline-block">
        <Button variant="secondary">Ouvrir le chat</Button>
      </Link>
    </div>
  );
}
