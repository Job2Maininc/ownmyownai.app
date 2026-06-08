"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Host } from "@ownmyownai/supabase-types";
import { HostCard } from "./host-card";
import { HostListSkeleton } from "./host-list-skeleton";

interface HostListProps {
  initialHosts: Host[];
}

export function HostList({ initialHosts }: HostListProps) {
  const [hosts, setHosts] = useState(initialHosts);
  const [loading, setLoading] = useState(false);

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

  if (loading && hosts.length === 0) {
    return <HostListSkeleton />;
  }

  return (
    <ul className="space-y-3">
      {hosts.map((host) => (
        <li key={host.id}>
          <HostCard host={host} />
        </li>
      ))}
    </ul>
  );
}
