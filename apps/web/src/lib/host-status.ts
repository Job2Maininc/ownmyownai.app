import type { HostStatus } from "@ownmyownai/protocol";
import type { Host, HostIndexingProgress } from "@ownmyownai/supabase-types";

export type HostDisplayStatus = "online" | "busy" | "offline";

export type CloudHostSnapshot = Pick<Host, "status" | "last_seen_at">;

/** Heartbeat runner toutes les 15 s — au-delà, le host est considéré éteint. */
export const HOST_STALE_MS = 90_000;

export function isHostHeartbeatFresh(lastSeenAt: string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  const lastSeen = new Date(lastSeenAt).getTime();
  return !Number.isNaN(lastSeen) && Date.now() - lastSeen < HOST_STALE_MS;
}

export function getHostIndexingProgress(host: Host): HostIndexingProgress | null {
  const ip = host.indexing_progress;
  if (!ip?.active) return null;
  return {
    active: true,
    progress: Math.min(100, Math.max(0, Math.round(ip.progress))),
    message: ip.message ?? "",
    kind: ip.kind,
  };
}

export function isHostIndexing(host: Host): boolean {
  return getHostIndexingProgress(host) !== null;
}

export function getHostDisplayStatus(host: Host): HostDisplayStatus {
  if (!isHostHeartbeatFresh(host.last_seen_at)) {
    return "offline";
  }
  if (host.status === "busy") return "busy";
  if (host.status === "online") return "online";
  return "offline";
}

/** Statut affiché dans le chat : heartbeat cloud + état relay en temps réel. */
export function resolveChatHostStatus(input: {
  relayConnected: boolean;
  relayHostStatus: HostStatus;
  cloudHost: CloudHostSnapshot | null;
}): HostStatus {
  if (!isHostHeartbeatFresh(input.cloudHost?.last_seen_at)) {
    return "offline";
  }

  const cloudStatus = input.cloudHost
    ? getHostDisplayStatus(input.cloudHost as Host)
    : "offline";

  if (!input.relayConnected) {
    return cloudStatus;
  }

  if (input.relayHostStatus === "offline") {
    return "offline";
  }

  if (input.relayHostStatus === "busy") {
    return "busy";
  }

  return cloudStatus === "offline" ? "offline" : "online";
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
      return "text-[var(--link)]";
    case "busy":
      return "text-[var(--warn)]";
    case "offline":
      return "text-[var(--muted)]";
  }
}

export type HostStatusPillVariant = "online" | "offline" | "pairing" | "warn";

export function hostStatusPillVariant(status: HostDisplayStatus): HostStatusPillVariant {
  switch (status) {
    case "online":
      return "online";
    case "busy":
      return "warn";
    case "offline":
      return "offline";
  }
}
