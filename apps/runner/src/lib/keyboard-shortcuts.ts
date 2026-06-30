export interface ShortcutBinding {
  key: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export function matchesShortcut(event: KeyboardEvent, binding: ShortcutBinding): boolean {
  const key = binding.key.toLowerCase();
  const eventKey = event.key.toLowerCase();

  if (eventKey !== key) return false;
  if (binding.mod && !(event.ctrlKey || event.metaKey)) return false;
  if (!binding.mod && (event.ctrlKey || event.metaKey)) return false;
  if (binding.shift && !event.shiftKey) return false;
  if (!binding.shift && event.shiftKey) return false;
  if (binding.alt && !event.altKey) return false;
  if (!binding.alt && event.altKey) return false;

  return true;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function formatShortcutLabel(binding: ShortcutBinding): string {
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const parts: string[] = [];

  if (binding.mod) parts.push(isMac ? "⌘" : "Ctrl");
  if (binding.shift) parts.push(isMac ? "⇧" : "Shift");
  if (binding.alt) parts.push(isMac ? "⌥" : "Alt");
  parts.push(binding.key.length === 1 ? binding.key.toUpperCase() : binding.key);

  return parts.join(isMac ? "" : "+");
}
