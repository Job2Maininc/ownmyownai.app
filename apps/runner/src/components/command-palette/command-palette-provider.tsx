import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useKeyboardShortcut } from "../../hooks/use-keyboard-shortcut";
import { formatShortcutLabel } from "../../lib/keyboard-shortcuts";
import { CommandPalette } from "./command-palette";

export interface PaletteCommand {
  id: string;
  label: string;
  keywords?: string;
  group?: string;
  shortcut?: string;
  disabled?: boolean;
  onSelect: () => void;
}

interface CommandPaletteContextValue {
  register: (commands: PaletteCommand[]) => () => void;
  open: () => void;
  close: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export const PALETTE_SHORTCUT_LABEL = formatShortcutLabel({ key: "k", mod: true });

interface CommandPaletteProviderProps {
  children: ReactNode;
  defaultCommands?: PaletteCommand[];
}

export function CommandPaletteProvider({
  children,
  defaultCommands = [],
}: CommandPaletteProviderProps) {
  const [open, setOpen] = useState(false);
  const [pageCommands, setPageCommands] = useState<PaletteCommand[]>([]);

  const register = useCallback((commands: PaletteCommand[]) => {
    setPageCommands(commands);
    return () => setPageCommands([]);
  }, []);

  const commands = useMemo(
    () => [...defaultCommands, ...pageCommands],
    [defaultCommands, pageCommands],
  );

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  useKeyboardShortcut({
    key: "k",
    mod: true,
    onTrigger: handleOpen,
    allowInEditable: true,
  });

  return (
    <CommandPaletteContext.Provider
      value={{ register, open: handleOpen, close: handleClose }}
    >
      {children}
      <CommandPalette open={open} commands={commands} onClose={handleClose} />
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette() {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  }
  return context;
}

export function useRegisterPaletteCommands(commands: PaletteCommand[]) {
  const { register } = useCommandPalette();

  useEffect(() => {
    return register(commands);
  }, [commands, register]);
}
