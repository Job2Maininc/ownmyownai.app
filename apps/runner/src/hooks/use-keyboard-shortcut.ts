import { useEffect } from "react";
import {
  isEditableTarget,
  matchesShortcut,
  type ShortcutBinding,
} from "../lib/keyboard-shortcuts";

interface UseKeyboardShortcutOptions extends ShortcutBinding {
  onTrigger: (event: KeyboardEvent) => void;
  enabled?: boolean;
  allowInEditable?: boolean;
}

export function useKeyboardShortcut({
  onTrigger,
  enabled = true,
  allowInEditable = false,
  ...binding
}: UseKeyboardShortcutOptions) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (!allowInEditable && isEditableTarget(event.target)) return;
      if (!matchesShortcut(event, binding)) return;

      event.preventDefault();
      onTrigger(event);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allowInEditable, binding.alt, binding.key, binding.mod, binding.shift, enabled, onTrigger]);
}
