"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { McpServerSummary, McpToolDescriptor } from "@ownmyownai/protocol";
import type { RelayClient } from "@/lib/relay-client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorAlert } from "@/components/ui/error-alert";
import { formatApiError, type UserError } from "@/lib/user-errors";

interface McpToolsPanelProps {
  relay: RelayClient | null;
  connected: boolean;
}

function serverKindLabel(kind: McpServerSummary["kind"]): string {
  return kind === "builtin" ? "intégré" : "externe";
}

export function McpToolsPanel({ relay, connected }: McpToolsPanelProps) {
  const [servers, setServers] = useState<McpServerSummary[]>([]);
  const [tools, setTools] = useState<McpToolDescriptor[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UserError | null>(null);

  const refresh = useCallback(async () => {
    if (!relay || !connected) return;
    setLoading(true);
    setError(null);
    try {
      const [nextServers, nextTools] = await Promise.all([
        relay.listMcpServers(),
        relay.listMcpTools(),
      ]);
      setServers(nextServers);
      setTools(nextTools);
      setSelectedServerId((current) => {
        if (current && nextServers.some((s) => s.id === current)) return current;
        return nextServers[0]?.id ?? null;
      });
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [relay, connected]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toolsByServer = useMemo(() => {
    const map = new Map<string, McpToolDescriptor[]>();
    for (const tool of tools) {
      const list = map.get(tool.serverId) ?? [];
      list.push(tool);
      map.set(tool.serverId, list);
    }
    return map;
  }, [tools]);

  const selectedServer = servers.find((s) => s.id === selectedServerId) ?? null;
  const visibleTools = selectedServerId
    ? (toolsByServer.get(selectedServerId) ?? [])
    : tools;

  if (!connected) {
    return (
      <aside className="context-panel" aria-label="Outils MCP">
        <h2 className="context-panel__title">Outils MCP</h2>
        <EmptyState
          icon="link"
          title="Host hors ligne"
          description="Connectez le Host pour lister les serveurs et outils MCP distants."
        />
      </aside>
    );
  }

  return (
    <aside className="context-panel" aria-label="Outils MCP">
      <div className="mt-3 flex items-center justify-between gap-2">
        <h2 className="context-panel__title" style={{ margin: 0 }}>
          Outils MCP
        </h2>
        <Button type="button" variant="ghost" disabled={loading} onClick={() => void refresh()}>
          {loading ? "…" : "Actualiser"}
        </Button>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Lecture seule — outils exposés par le Host via le relay (mode agent).
      </p>

      {error ? <ErrorAlert {...error} /> : null}

      {loading && servers.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Chargement…</p>
      ) : null}

      {!loading && servers.length === 0 && !error ? (
        <EmptyState
          icon="link"
          title="Aucun serveur MCP"
          description="Configurez des serveurs MCP dans l'application Host."
        />
      ) : null}

      {servers.length > 0 ? (
        <ul className="mt-3 space-y-2" role="list">
          {servers.map((server) => {
            const count = toolsByServer.get(server.id)?.length ?? server.toolCount;
            const active = selectedServerId === server.id;
            return (
              <li key={server.id}>
                <button
                  type="button"
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                    active
                      ? "border-[var(--link)] bg-[var(--link)]/10"
                      : "border-[var(--border)] hover:bg-white/5"
                  }`}
                  onClick={() => setSelectedServerId(server.id)}
                >
                  <span className="block text-sm font-medium">{server.name}</span>
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    <code>{server.id}</code>
                    {" · "}
                    {serverKindLabel(server.kind)}
                    {" · "}
                    {server.enabled ? `${count} outil(s)` : "désactivé"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {selectedServer ? (
        <section className="mt-4 border-t border-[var(--border)] pt-4">
          <h3 className="text-sm font-medium">{selectedServer.name}</h3>
          {selectedServer.command ? (
            <p className="mt-1 break-all text-xs text-[var(--muted)]">
              {selectedServer.command}
              {selectedServer.args.length > 0 ? ` ${selectedServer.args.join(" ")}` : ""}
            </p>
          ) : null}

          {visibleTools.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">
              {selectedServer.enabled
                ? "Aucun outil détecté sur ce serveur."
                : "Serveur désactivé — activez-le dans le Host pour lister les outils."}
            </p>
          ) : (
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto" role="list">
              {visibleTools.map((tool) => (
                <li
                  key={tool.qualifiedName}
                  className="rounded-lg border border-[var(--border)] px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium">{tool.name}</span>
                    <code className="shrink-0 text-[10px] text-[var(--muted)]">
                      {tool.qualifiedName}
                    </code>
                  </div>
                  {tool.description ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">{tool.description}</p>
                  ) : null}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-[var(--link)]">
                      Schéma d&apos;entrée
                    </summary>
                    <pre className="mt-1 overflow-x-auto rounded bg-black/20 p-2 text-[10px] leading-relaxed">
                      {JSON.stringify(tool.inputSchema, null, 2)}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </aside>
  );
}
