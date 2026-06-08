"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PaletteCommand } from "./command-palette-provider";

interface CommandPaletteProps {
  open: boolean;
  commands: PaletteCommand[];
  onClose: () => void;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    const available = commands.filter((command) => !command.disabled);
    if (!q) return available;

    return available.filter((command) => {
      const haystack = normalize(`${command.label} ${command.keywords ?? ""} ${command.group ?? ""}`);
      return haystack.includes(q);
    });
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % Math.max(filtered.length, 1));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) =>
          index <= 0 ? Math.max(filtered.length - 1, 0) : index - 1,
        );
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filtered.length, onClose, open]);

  useEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, filtered.length]);

  if (!open) return null;

  function runCommand(command: PaletteCommand) {
    onClose();
    command.onSelect();
  }

  const grouped = filtered.reduce<Record<string, PaletteCommand[]>>((acc, command) => {
    const group = command.group ?? "Actions";
    acc[group] ??= [];
    acc[group].push(command);
    return acc;
  }, {});

  let flatIndex = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Palette de commandes"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl"
      >
        <div className="border-b border-[var(--border)] px-4 py-3">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && filtered[activeIndex]) {
                event.preventDefault();
                runCommand(filtered[activeIndex]);
              }
            }}
            placeholder="Rechercher une commande…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
            aria-label="Rechercher une commande"
          />
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">
              Aucune commande trouvée.
            </p>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="px-2">
                <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  {group}
                </p>
                <ul>
                  {items.map((command) => {
                    flatIndex += 1;
                    const index = flatIndex;
                    const active = index === activeIndex;

                    return (
                      <li key={command.id}>
                        <button
                          type="button"
                          data-index={index}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => runCommand(command)}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                            active ? "bg-brand-600/20 text-white" : "hover:bg-white/5"
                          }`}
                        >
                          <span>{command.label}</span>
                          {command.shortcut ? (
                            <kbd className="rounded border border-[var(--border)] bg-black/30 px-1.5 py-0.5 text-xs text-[var(--muted)]">
                              {command.shortcut}
                            </kbd>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--muted)]">
          ↑↓ naviguer · Entrée sélectionner · Échap fermer
        </div>
      </div>
    </div>
  );
}
