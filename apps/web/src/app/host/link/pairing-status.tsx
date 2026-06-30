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
    <div className="pairing-success">
      <p className="pairing-success__message">PC lié avec succès ! Prochaine étape : connecter Cursor (optionnel).</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href={`/onboarding/cursor?host=${hostId}`}>
          <Button>Connecter Cursor</Button>
        </Link>
        <Link href={`/chat/${hostId}`}>
          <Button variant="secondary">Passer au chat</Button>
        </Link>
        <Link href="/dashboard">
          <Button variant="ghost">Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
