"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Host } from "@ownmyownai/supabase-types";
import { deleteDuplicateHosts, deleteOfflineHostsOlderThan } from "@/app/dashboard/actions";
import { getHostDisplayStatus } from "@/lib/host-status";
import { Button } from "@/components/ui/button";
import { HostCard } from "./host-card";
import { HostListSkeleton } from "./host-list-skeleton";

type HostFilter = "all" | "online" | "hide_stale_offline";

interface HostListProps {
  initialHosts: Host[];
}

const STALE_OFFLINE_DAYS = 30;

export function HostList({ initialHosts }: HostListProps) {
  const [hosts, setHosts] = useState(initialHosts);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<HostFilter>("all");
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);

  useEffect(() => {
    setHosts(initialHosts);
  }, [initialHosts]);

  useEffect(() => {
    const supabase = createClient();
    const interval = window.setInterval(async () => {
      setLoading(true);
      const { data } = await supabase
        .from("hosts")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) setHosts(data as Host[]);
      setLoading(false);
    }, 10_000);

    const channel = supabase
      .channel("hosts-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "hosts" },
        async () => {
          const { data } = await supabase.from("hosts").select("*").order("created_at", { ascending: false });
          if (data) setHosts(data as Host[]);
        },
      )
      .subscribe();

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, []);

  const visibleHosts = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - STALE_OFFLINE_DAYS);
    return hosts.filter((host) => {
      const status = getHostDisplayStatus(host);
      if (filter === "online") return status === "online" || status === "busy";
      if (filter === "hide_stale_offline") {
        if (status !== "offline") return true;
        if (!host.last_seen_at) return false;
        return new Date(host.last_seen_at) >= cutoff;
      }
      return true;
    });
  }, [hosts, filter]);

  async function handleCleanupStale() {
    setCleanupBusy(true);
    setCleanupMessage(null);
    const { error, deleted } = await deleteOfflineHostsOlderThan(STALE_OFFLINE_DAYS);
    setCleanupBusy(false);
    if (error) {
      setCleanupMessage(error);
      return;
    }
    setCleanupMessage(
      deleted > 0
        ? `${deleted} host(s) hors ligne supprimé(s).`
        : "Aucun host hors ligne ancien à supprimer.",
    );
  }

  async function handleCleanupDuplicates() {
    setCleanupBusy(true);
    setCleanupMessage(null);
    const { error, deleted } = await deleteDuplicateHosts();
    setCleanupBusy(false);
    if (error) {
      setCleanupMessage(error);
      return;
    }
    setCleanupMessage(
      deleted > 0
        ? `${deleted} doublon(s) supprimé(s).`
        : "Aucun doublon détecté.",
    );
  }

  if (loading && hosts.length === 0) {
    return <HostListSkeleton />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[var(--muted)]">Filtre :</span>
        {(
          [
            ["all", "Tous"],
            ["online", "En ligne"],
            ["hide_stale_offline", "Masquer offline > 30 j"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`rounded px-2 py-1 text-xs ${
              filter === id ? "bg-brand-600/30" : "bg-black/30"
            }`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
        <Button
          type="button"
          variant="ghost"
          disabled={cleanupBusy}
          onClick={() => void handleCleanupStale()}
        >
          Nettoyer offline anciens
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={cleanupBusy}
          onClick={() => void handleCleanupDuplicates()}
        >
          Supprimer doublons
        </Button>
      </div>
      {cleanupMessage && <p className="text-sm text-[var(--muted)]">{cleanupMessage}</p>}
      <ul className="space-y-3">
        {visibleHosts.map((host) => (
          <li key={host.id}>
            <HostCard host={host} />
          </li>
        ))}
      </ul>
      {visibleHosts.length === 0 && (
        <p className="text-sm text-[var(--muted)]">Aucun host pour ce filtre.</p>
      )}
    </div>
  );
}
