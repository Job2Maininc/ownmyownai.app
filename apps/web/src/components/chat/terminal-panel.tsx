"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TerminalOutputPayload } from "@ownmyownai/protocol";
import type { RelayClient } from "@/lib/relay-client";
import { Button } from "@/components/ui/button";

/** Binaires allowlistés côté Host (`apps/runner/src-tauri/src/process.rs`). */
export const ALLOWED_TERMINAL_PROGRAMS = [
  "git",
  "cargo",
  "npm",
  "npx",
  "node",
  "rg",
  "dir",
  "type",
  "where",
  "echo",
  "python",
  "py",
] as const;

interface OutputLine {
  stream: TerminalOutputPayload["stream"];
  data: string;
}

interface TerminalPanelProps {
  relay: RelayClient | null;
  connected: boolean;
}

function parseArgs(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  return trimmed.split(/\s+/);
}

export function TerminalPanel({ relay, connected }: TerminalPanelProps) {
  const [program, setProgram] = useState<string>(ALLOWED_TERMINAL_PROGRAMS[0]);
  const [argsInput, setArgsInput] = useState("");
  const [cwd, setCwd] = useState("");
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [running, setRunning] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const appendOutput = useCallback((output: TerminalOutputPayload) => {
    setLines((prev) => [...prev, { stream: output.stream, data: output.data }]);
  }, []);

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: "smooth" });
  }, [lines, running]);

  async function handleRun() {
    if (!relay || !connected || running || !program.trim()) return;

    setRunning(true);
    setError(null);
    setExitCode(null);
    setLines([]);

    const args = parseArgs(argsInput);
    const commandLabel = `${program}${args.length > 0 ? ` ${args.join(" ")}` : ""}`;
    setLines([{ stream: "stdout", data: `$ ${commandLabel}\n` }]);

    try {
      const code = await relay.execTerminal(
        {
          program: program.trim(),
          args,
          cwd: cwd.trim() || undefined,
          timeoutSecs: 120,
        },
        appendOutput,
      );
      setExitCode(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  function handleClear() {
    if (running) return;
    setLines([]);
    setExitCode(null);
    setError(null);
  }

  const disabled = !relay || !connected || running;

  return (
    <aside className="terminal-panel" aria-label="Terminal intégré">
      <h2 className="terminal-panel__title">Terminal</h2>
      <p className="text-xs text-[var(--muted)]">
        Commandes allowlistées exécutées sur votre PC via le Host — sortie streamée en direct.
      </p>

      {!connected && (
        <p className="mt-2 text-xs text-[var(--warn)]">
          Connectez-vous au relay pour exécuter des commandes.
        </p>
      )}

      <div className="terminal-panel__form mt-3 space-y-2">
        <label className="block text-xs">
          Programme
          <select
            value={program}
            onChange={(e) => setProgram(e.target.value)}
            disabled={disabled}
            className="mt-1 w-full rounded border border-[var(--border)] bg-white px-2 py-1.5 text-xs"
          >
            {ALLOWED_TERMINAL_PROGRAMS.map((bin) => (
              <option key={bin} value={bin}>
                {bin}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs">
          Arguments
          <input
            value={argsInput}
            onChange={(e) => setArgsInput(e.target.value)}
            placeholder="ex. status, --version, run build"
            disabled={disabled}
            className="mt-1 w-full rounded border border-[var(--border)] bg-white px-2 py-1.5 font-mono text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleRun();
              }
            }}
          />
        </label>

        <label className="block text-xs">
          Répertoire de travail (optionnel)
          <input
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            placeholder="C:\projets\mon-repo"
            disabled={disabled}
            className="mt-1 w-full rounded border border-[var(--border)] bg-white px-2 py-1.5 font-mono text-xs"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" disabled={disabled} onClick={() => void handleRun()}>
          {running ? "Exécution…" : "Exécuter"}
        </Button>
        <Button type="button" variant="secondary" disabled={running || lines.length === 0} onClick={handleClear}>
          Effacer
        </Button>
      </div>

      <div ref={outputRef} className="terminal-panel__output mt-3" role="log" aria-live="polite">
        {lines.length === 0 && !running && (
          <p className="text-xs text-[var(--muted)]">
            Choisissez un programme et lancez une commande — par ex. git status.
          </p>
        )}
        {lines.map((line, i) => (
          <span
            key={i}
            className={
              line.stream === "stderr" ? "terminal-panel__line--stderr" : "terminal-panel__line--stdout"
            }
          >
            {line.data}
          </span>
        ))}
        {running && <span className="terminal-panel__line--stdout terminal-panel__cursor">▌</span>}
      </div>

      {exitCode !== null && !running && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          Code de sortie :{" "}
          <span className={exitCode === 0 ? "text-[var(--success)]" : "text-[var(--error)]"}>
            {exitCode}
          </span>
        </p>
      )}
      {error && <p className="mt-2 text-xs text-[var(--error)]">{error}</p>}
    </aside>
  );
}
