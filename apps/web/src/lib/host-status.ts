import type { Host } from "@ownmyownai/supabase-types";

export type HostDisplayStatus = "online" | "busy" | "offline";

/** Heartbeat runner toutes les 15 s — au-delà, le host est considéré éteint. */
export const HOST_STALE_MS = 90_000;

export function isHostHeartbeatFresh(lastSeenAt: string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  const lastSeen = new Date(lastSeenAt).getTime();
  return !Number.isNaN(lastSeen) && Date.now() - lastSeen < HOST_STALE_MS;
}

export function getHostDisplayStatus(host: Host): HostDisplayStatus {
  if (!isHostHeartbeatFresh(host.last_seen_at)) {
    return "offline";
  }
  if (host.status === "busy") return "busy";
  if (host.status === "online") return "online";
  return "offline";
}

export function hostStatusLabel(status: HostDisplayStatus): string {
  switch (status) {
    case "online":
      return "En ligne";
    case "busy":
      return "Occupé";
    case "offline":
      return "Hors ligne";
  }
}

export function hostStatusClassName(status: HostDisplayStatus): string {
  switch (status) {
    case "online":
      return "text-brand-500";
    case "busy":
      return "text-amber-400";
    case "offline":
      return "text-red-400";
  }
}
