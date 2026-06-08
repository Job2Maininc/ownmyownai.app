import type { Host } from "@ownmyownai/supabase-types";

export type HostDisplayStatus = "online" | "busy" | "offline";

export function getHostDisplayStatus(host: Host): HostDisplayStatus {
  if (host.status === "busy") return "busy";
  if (host.status === "online") return "online";
  if (host.last_seen_at) {
    const lastSeen = new Date(host.last_seen_at).getTime();
    if (Date.now() - lastSeen < 60_000 && host.status !== "offline") {
      return "online";
    }
  }
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
