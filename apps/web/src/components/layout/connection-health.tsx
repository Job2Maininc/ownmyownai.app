"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getHostDisplayStatus } from "@/lib/host-status";
import type { Host } from "@ownmyownai/supabase-types";

type HealthState = "ok" | "warn" | "off" | "loading";

function healthLabel(state: HealthState, detail: string): string {
  switch (state) {
    case "ok":
      return `Connecté · ${detail}`;
    case "warn":
      return `Partiel · ${detail}`;
    case "off":
      return `Hors ligne · ${detail}`;
    default:
      return "Vérification…";
  }
}

export function ConnectionHealth() {
  const pathname = usePathname();
  const [state, setState] = useState<HealthState>("loading");
  const [detail, setDetail] = useState("");

  const showOnRoute = useMemo(() => {
    if (!pathname) return false;
    return pathname === "/dashboard" || pathname.startsWith("/chat/");
  }, [pathname]);

  const chatHostId = useMemo(() => {
    if (!pathname?.startsWith("/chat/")) return null;
    const parts = pathname.split("/");
    return parts[2] ?? null;
  }, [pathname]);

  useEffect(() => {
    if (!showOnRoute) return;

    const supabase = createClient();
    let cancelled = false;

    async function refresh() {
      const { data } = await supabase.from("hosts").select("*").order("last_seen_at", {
        ascending: false,
      });
      if (cancelled) return;

      const hosts = (data ?? []) as Host[];
      if (hosts.length === 0) {
        setState("off");
        setDetail("aucun PC lié");
        return;
      }

      const target = chatHostId
        ? hosts.find((h) => h.id === chatHostId) ?? hosts[0]
        : hosts[0];

      const status = getHostDisplayStatus(target);
      const onlineCount = hosts.filter((h) => getHostDisplayStatus(h) !== "offline").length;

      if (chatHostId) {
        if (status === "online") {
          setState("ok");
          setDetail(target.name);
        } else if (status === "busy") {
          setState("warn");
          setDetail(`${target.name} occupé`);
        } else {
          setState("off");
          setDetail(`${target.name} hors ligne`);
        }
      } else {
        if (onlineCount === hosts.length) {
          setState("ok");
          setDetail(`${onlineCount} PC en ligne`);
        } else if (onlineCount > 0) {
          setState("warn");
          setDetail(`${onlineCount}/${hosts.length} en ligne`);
        } else {
          setState("off");
          setDetail("tous hors ligne");
        }
      }
    }

    void refresh();
    const interval = window.setInterval(() => void refresh(), 12_000);

    const channel = supabase
      .channel("connection-health")
      .on("postgres_changes", { event: "*", schema: "public", table: "hosts" }, () => {
        void refresh();
      })
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [showOnRoute, chatHostId]);

  if (!showOnRoute) return null;

  const href = chatHostId ? `/chat/${chatHostId}` : "/dashboard";

  return (
    <Link
      href={href}
      className={`connection-health connection-health--${state}`}
      title={healthLabel(state, detail)}
    >
      <span className="connection-health__dot" aria-hidden />
      <span className="connection-health__label hidden sm:inline">
        {healthLabel(state, detail)}
      </span>
    </Link>
  );
}
