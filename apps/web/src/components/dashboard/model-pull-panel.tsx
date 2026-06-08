"use client";

import { useState } from "react";
import { mintRelayToken } from "@/lib/api";
import { RelayClient } from "@/lib/relay-client";
import { Button } from "@/components/ui/button";

interface ModelPullPanelProps {
  hostId: string;
  disabled?: boolean;
  onDone?: () => void;
}

export function ModelPullPanel({ hostId, disabled, onDone }: ModelPullPanelProps) {
  const [model, setModel] = useState("llama3.2:3b");
  const [pulling, setPulling] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePull() {
    const trimmed = model.trim();
    if (!trimmed) return;

    setPulling(true);
    setError(null);
    setProgress("Connexion au relais…");
    setPercent(null);

    const client = new RelayClient({
      mintToken: () => mintRelayToken(hostId),
      onError: (msg) => setError(msg),
    });

    try {
      await client.connect();
      await client.pullModel(trimmed, (p) => {
        setProgress(p.message ?? "Téléchargement…");
        setPercent(typeof p.percent === "number" ? p.percent : null);
      });
      setProgress("Modèle installé sur le PC.");
      setPercent(100);
      onDone?.();
    } catch (e) {
      setError(String(e));
    } finally {
      client.disconnect();
      setPulling(false);
    }
  }

  return (
    <div className="rounded border border-[var(--border)] bg-black/20 p-3 text-sm">
      <p className="mb-2 font-medium">Télécharger un modèle sur ce PC</p>
      <div className="flex flex-wrap gap-2">
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="ex. llama3.2:3b"
          disabled={pulling || disabled}
          className="min-w-0 flex-1 rounded border border-[var(--border)] bg-black/30 px-2 py-1 text-sm"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={pulling || disabled || !model.trim()}
          onClick={() => void handlePull()}
        >
          {pulling ? "Téléchargement…" : "Télécharger"}
        </Button>
      </div>
      {progress && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          {progress}
          {percent != null && ` (${Math.round(percent)} %)`}
        </p>
      )}
      {percent != null && (
        <div className="mt-1 h-1.5 overflow-hidden rounded bg-black/40">
          <div
            className="h-full bg-brand-500 transition-all"
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
