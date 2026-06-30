import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { EmptyStatePanel } from "./EmptyState";
import { open } from "@tauri-apps/plugin-dialog";
import type { HostSettings, McpServerConfig, McpServerSummary } from "../types";

const ALLOWED_COMMANDS = ["npx", "node", "npm", "uv", "uvx", "python", "py"] as const;

const BUILTIN_FS_ID = "builtin-fs";

interface ServerDraft {
  id: string;
  name: string;
  command: string;
  argsText: string;
  envText: string;
  enabled: boolean;
}

function slugifyId(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base || "mcp-server";
}

function parseArgs(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) env[key] = value;
  }
  return env;
}

function formatArgs(args: string[]): string {
  return args.join("\n");
}

function formatEnv(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

function emptyDraft(): ServerDraft {
  return {
    id: "",
    name: "",
    command: "npx",
    argsText: "-y\n@modelcontextprotocol/server-filesystem",
    envText: "",
    enabled: true,
  };
}

function draftFromConfig(config: McpServerConfig): ServerDraft {
  return {
    id: config.id,
    name: config.name,
    command: config.command,
    argsText: formatArgs(config.args),
    envText: formatEnv(config.env ?? {}),
    enabled: config.enabled,
  };
}

function draftToConfig(draft: ServerDraft): McpServerConfig {
  return {
    id: draft.id.trim(),
    name: draft.name.trim(),
    command: draft.command.trim(),
    args: parseArgs(draft.argsText),
    env: parseEnv(draft.envText),
    enabled: draft.enabled,
    builtin: false,
  };
}

export default function McpServersManager() {
  const [servers, setServers] = useState<McpServerSummary[]>([]);
  const [configs, setConfigs] = useState<McpServerConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ServerDraft>(emptyDraft());
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [summary, settings] = await Promise.all([
        invoke<McpServerSummary[]>("list_mcp_servers"),
        invoke<HostSettings>("get_host_settings"),
      ]);
      setServers(summary);
      setConfigs(settings.mcpServers ?? []);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function persistServers(next: McpServerConfig[]) {
    setSaving(true);
    setError(null);
    try {
      const settings = await invoke<HostSettings>("get_host_settings");
      await invoke("save_host_settings", {
        settings: { ...settings, mcpServers: next },
      });
      setConfigs(next);
      await refresh();
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      setSaving(false);
    }
  }

  function startCreate() {
    setCreating(true);
    setEditingId(null);
    setSelectedId(null);
    setDraft(emptyDraft());
  }

  function startEdit(id: string) {
    const config = configs.find((c) => c.id === id);
    if (!config) return;
    setCreating(false);
    setEditingId(id);
    setSelectedId(id);
    setDraft(draftFromConfig(config));
  }

  function cancelForm() {
    setCreating(false);
    setEditingId(null);
    setDraft(emptyDraft());
  }

  async function handleSaveDraft() {
    const config = draftToConfig(draft);
    if (!config.name) {
      setError("Le nom est requis.");
      return;
    }
    if (!config.id) {
      config.id = slugifyId(config.name);
    }
    if (config.id === BUILTIN_FS_ID) {
      setError("Cet identifiant est réservé au serveur intégré.");
      return;
    }
    if (!config.command) {
      setError("La commande est requise.");
      return;
    }

    const next = [...configs];
    if (creating) {
      if (next.some((s) => s.id === config.id)) {
        setError(`L'identifiant « ${config.id} » existe déjà.`);
        return;
      }
      next.push(config);
    } else if (editingId) {
      const idx = next.findIndex((s) => s.id === editingId);
      if (idx < 0) return;
      if (editingId !== config.id && next.some((s) => s.id === config.id)) {
        setError(`L'identifiant « ${config.id} » existe déjà.`);
        return;
      }
      next[idx] = config;
    } else {
      return;
    }

    try {
      await persistServers(next);
      cancelForm();
      setSelectedId(config.id);
    } catch {
      /* error already set */
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Supprimer ce serveur MCP ?")) return;
    setError(null);
    try {
      await persistServers(configs.filter((s) => s.id !== id));
      if (selectedId === id) setSelectedId(null);
      if (editingId === id) cancelForm();
    } catch {
      /* error already set */
    }
  }

  async function handleToggleEnabled(id: string, enabled: boolean) {
    setError(null);
    try {
      const next = configs.map((s) => (s.id === id ? { ...s, enabled } : s));
      await persistServers(next);
    } catch {
      /* error already set */
    }
  }

  async function pickFilesystemRoot() {
    const path = await open({ directory: true, multiple: false });
    if (!path || typeof path !== "string") return;
    setDraft((d) => ({
      ...d,
      name: d.name || "Filesystem",
      command: "npx",
      argsText: `-y\n@modelcontextprotocol/server-filesystem\n${path}`,
    }));
  }

  const externalServers = servers.filter((s) => s.kind === "external");
  const builtin = servers.find((s) => s.kind === "builtin");

  return (
    <div className="context-manager">
      <h2>Serveurs MCP</h2>
      <p className="muted panel__meta">
        Configurez des serveurs MCP externes (stdio). Le serveur intégré{" "}
        <code>builtin-fs</code> reste toujours actif pour les liens de contexte.
        Commandes autorisées : {ALLOWED_COMMANDS.join(", ")}.
      </p>

      {builtin ? (
        <section className="context-base-item context-base-item--active" style={{ marginBottom: 12 }}>
          <div className="context-base-item__head">
            <span className="context-base-item__title">{builtin.name}</span>
            <span className="model-chip__tag">intégré</span>
          </div>
          <p className="muted">
            {builtin.toolCount} outil(s) · toujours actif · id <code>{builtin.id}</code>
          </p>
        </section>
      ) : null}

      <div className="context-create-row">
        <button type="button" className="btn-secondary" onClick={startCreate} disabled={creating || !!editingId}>
          Ajouter un serveur
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => void refresh()}
          disabled={saving}
        >
          Actualiser
        </button>
      </div>

      {(creating || editingId) && (
        <section className="panel" style={{ marginTop: 12 }}>
          <h3 className="type-small" style={{ margin: "0 0 10px" }}>
            {creating ? "Nouveau serveur MCP" : `Modifier « ${editingId} »`}
          </h3>
          <div className="field-row" style={{ marginBottom: 8 }}>
            <label className="field-label" htmlFor="mcp-name">
              Nom
            </label>
            <input
              id="mcp-name"
              className="context-input"
              value={draft.name}
              onChange={(e) => {
                const name = e.target.value;
                setDraft((d) => ({
                  ...d,
                  name,
                  id: creating && !d.id ? slugifyId(name) : d.id,
                }));
              }}
              placeholder="Ex. : Filesystem bureau"
            />
          </div>
          <div className="field-row" style={{ marginBottom: 8 }}>
            <label className="field-label" htmlFor="mcp-id">
              Identifiant
            </label>
            <input
              id="mcp-id"
              className="context-input"
              value={draft.id}
              onChange={(e) => setDraft((d) => ({ ...d, id: e.target.value }))}
              placeholder="filesystem-bureau"
            />
          </div>
          <div className="field-row" style={{ marginBottom: 8 }}>
            <label className="field-label" htmlFor="mcp-command">
              Commande
            </label>
            <select
              id="mcp-command"
              className="model-search"
              value={draft.command}
              onChange={(e) => setDraft((d) => ({ ...d, command: e.target.value }))}
            >
              {ALLOWED_COMMANDS.map((cmd) => (
                <option key={cmd} value={cmd}>
                  {cmd}
                </option>
              ))}
            </select>
          </div>
          <div className="field-row" style={{ marginBottom: 8 }}>
            <label className="field-label" htmlFor="mcp-args">
              Arguments (un par ligne)
            </label>
            <textarea
              id="mcp-args"
              className="context-instruction"
              rows={4}
              value={draft.argsText}
              onChange={(e) => setDraft((d) => ({ ...d, argsText: e.target.value }))}
              placeholder={"-y\n@modelcontextprotocol/server-filesystem\nC:\\Users\\…"}
            />
          </div>
          <button
            type="button"
            className="btn-ghost"
            style={{ marginBottom: 8 }}
            onClick={() => void pickFilesystemRoot()}
          >
            Modèle filesystem — choisir un dossier
          </button>
          <div className="field-row" style={{ marginBottom: 8 }}>
            <label className="field-label" htmlFor="mcp-env">
              Variables d&apos;environnement (KEY=VALUE)
            </label>
            <textarea
              id="mcp-env"
              className="context-instruction"
              rows={2}
              value={draft.envText}
              onChange={(e) => setDraft((d) => ({ ...d, envText: e.target.value }))}
              placeholder="API_KEY=…"
            />
          </div>
          <label className="field-row" style={{ marginBottom: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
            />
            <span className="field-label" style={{ margin: 0 }}>
              Activer ce serveur
            </span>
          </label>
          <div className="context-create-row">
            <button
              type="button"
              className="btn-primary"
              disabled={saving}
              onClick={() => void handleSaveDraft()}
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button type="button" className="btn-ghost" onClick={cancelForm} disabled={saving}>
              Annuler
            </button>
          </div>
        </section>
      )}

      {error ? (
        <p className="error-banner" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      ) : null}

      <ul className="context-base-list" style={{ marginTop: 12 }}>
        {externalServers.length === 0 ? (
          <li>
            <EmptyStatePanel
              icon="plug"
              title="Aucun serveur MCP"
              description="Ajoutez un serveur externe pour étendre les outils disponibles à l'agent."
            />
          </li>
        ) : (
          externalServers.map((server) => {
            const enabled = server.enabled;
            return (
              <li
                key={server.id}
                className={`context-base-item ${selectedId === server.id ? "context-base-item--active" : ""}`}
              >
                <div className="context-base-item__head">
                  <label className="field-row" style={{ margin: 0, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={saving}
                      onChange={(e) => void handleToggleEnabled(server.id, e.target.checked)}
                    />
                  </label>
                  <button
                    type="button"
                    className="context-base-item__title"
                    onClick={() => setSelectedId(selectedId === server.id ? null : server.id)}
                  >
                    {server.name}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => startEdit(server.id)}
                    disabled={creating || !!editingId}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-ghost--danger"
                    onClick={() => void handleDelete(server.id)}
                    disabled={saving}
                  >
                    ×
                  </button>
                </div>
                <p className="muted">
                  <code>{server.id}</code>
                  {" · "}
                  {server.command ?? "—"}
                  {server.args.length > 0 ? ` ${server.args.join(" ")}` : ""}
                  {" · "}
                  {enabled
                    ? `${server.toolCount} outil(s) détecté(s)`
                    : "désactivé"}
                </p>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
