"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlaybookSummary } from "@ownmyownai/protocol";
import type { RelayClient } from "@/lib/relay-client";
import { Button } from "@/components/ui/button";

interface PlaybookPickerProps {
  relay: RelayClient | null;
  connected: boolean;
  model: string;
  contextIds: string[];
  disabled?: boolean;
  onRun: (playbook: PlaybookSummary) => void;
}

export function PlaybookPicker({
  relay,
  connected,
  model,
  contextIds,
  disabled,
  onRun,
}: PlaybookPickerProps) {
  const [playbooks, setPlaybooks] = useState<PlaybookSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!relay || !connected) return;
    setLoading(true);
    setError(null);
    try {
      const items = await relay.listPlaybooks();
      setPlaybooks(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur playbooks");
    } finally {
      setLoading(false);
    }
  }, [relay, connected]);

  useEffect(() => {
    if (open && playbooks.length === 0) {
      void load();
    }
  }, [open, playbooks.length, load]);

  function handleSelect(playbook: PlaybookSummary) {
    setOpen(false);
    onRun(playbook);
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        disabled={disabled || !connected}
        onClick={() => setOpen((v) => !v)}
      >
        Playbooks
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 shadow-lg">
          {loading && (
            <p className="px-2 py-1 text-xs text-[var(--muted)]">Chargement…</p>
          )}
          {error && <p className="px-2 py-1 text-xs text-red-400">{error}</p>}
          {!loading && playbooks.length === 0 && !error && (
            <p className="px-2 py-1 text-xs text-[var(--muted)]">Aucun playbook</p>
          )}
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {playbooks.map((pb) => (
              <li key={pb.id}>
                <button
                  type="button"
                  className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-white/5"
                  onClick={() => handleSelect(pb)}
                >
                  <span className="font-medium">{pb.name}</span>
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    {pb.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {playbooks.some((p) => p.requiresLink) && contextIds.length === 0 && (
            <p className="mt-2 border-t border-[var(--border)] px-2 pt-2 text-xs text-amber-400">
              Activez une base de contexte avec dossier lié pour « Résumer dossier ».
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function runPlaybookViaRelay(
  relay: RelayClient,
  playbook: PlaybookSummary,
  model: string,
  contextIds: string[],
): string | undefined {
  return relay.sendPlaybookRun(playbook.id, { model, contextIds });
}
