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
      const haystack = normalize(
        `${command.label} ${command.keywords ?? ""} ${command.group ?? ""}`,
      );
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
      className="cmd-palette-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Palette de commandes"
        className="cmd-palette"
      >
        <div className="cmd-palette__search">
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
            className="cmd-palette__input"
            aria-label="Rechercher une commande"
          />
        </div>

        <div ref={listRef} className="cmd-palette__list">
          {filtered.length === 0 ? (
            <p className="cmd-palette__empty">Aucune commande trouvée.</p>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="cmd-palette__group">
                <p className="cmd-palette__group-label">{group}</p>
                <ul className="cmd-palette__items">
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
                          className={`cmd-palette__item ${active ? "cmd-palette__item--active" : ""}`}
                        >
                          <span>{command.label}</span>
                          {command.shortcut ? (
                            <kbd className="cmd-palette__kbd">{command.shortcut}</kbd>
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

        <div className="cmd-palette__footer">
          ↑↓ naviguer · Entrée sélectionner · Échap fermer
        </div>
      </div>
    </div>
  );
}
