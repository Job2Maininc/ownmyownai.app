export type DashboardTab =
  | "status"
  | "chat"
  | "models"
  | "cursor"
  | "image"
  | "context"
  | "review"
  | "projects"
  | "mcp"
  | "memory"
  | "settings"
  | "audit";

export interface DashboardNavItem {
  id: DashboardTab;
  label: string;
}

export const DASHBOARD_NAV: DashboardNavItem[] = [
  { id: "status", label: "État" },
  { id: "chat", label: "Chat local" },
  { id: "models", label: "Modèles" },
  { id: "cursor", label: "Cursor" },
  { id: "image", label: "Images" },
  { id: "context", label: "Contexte" },
  { id: "review", label: "Revue code" },
  { id: "projects", label: "Projets" },
  { id: "mcp", label: "MCP" },
  { id: "memory", label: "Mémoire" },
  { id: "settings", label: "Paramètres" },
  { id: "audit", label: "Journal" },
];

export function getNavLabel(tab: DashboardTab): string {
  return DASHBOARD_NAV.find((item) => item.id === tab)?.label ?? tab;
}
