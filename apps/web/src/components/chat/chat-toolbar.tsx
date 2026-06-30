"use client";

import Link from "next/link";
import type { PlaybookSummary } from "@ownmyownai/protocol";
import type { RelayClient } from "@/lib/relay-client";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { PlaybookPicker } from "./playbook-picker";

interface BranchOption {
  id: string;
  label: string;
  count: number;
}

interface ChatToolbarProps {
  headerStatus: { label: string; className: string };
  model: string;
  defaultModel: string;
  modelSearch: string;
  onModelSearchChange: (value: string) => void;
  onModelChange: (value: string) => void;
  filteredModels: string[];
  thinkingMode: boolean;
  onThinkingModeChange: (value: boolean) => void;
  agentMode: boolean;
  onAgentModeChange: (value: boolean) => void;
  streaming: boolean;
  showSidebar: boolean;
  onToggleSidebar: () => void;
  onNewConversation: () => void;
  onExport: () => void;
  onShare: () => void;
  messagesCount: number;
  branchOptions: BranchOption[];
  activeBranchId: string;
  onSwitchBranch: (id: string) => void;
  relay: RelayClient | null;
  connected: boolean;
  canSend: boolean;
  contextIds: string[];
  onPlaybookRun: (playbook: PlaybookSummary) => void;
}

export function ChatToolbar({
  headerStatus,
  model,
  defaultModel,
  modelSearch,
  onModelSearchChange,
  onModelChange,
  filteredModels,
  thinkingMode,
  onThinkingModeChange,
  agentMode,
  onAgentModeChange,
  streaming,
  showSidebar,
  onToggleSidebar,
  onNewConversation,
  onExport,
  onShare,
  messagesCount,
  branchOptions,
  activeBranchId,
  onSwitchBranch,
  relay,
  connected,
  canSend,
  contextIds,
  onPlaybookRun,
}: ChatToolbarProps) {
  return (
    <header className="chat-toolbar">
      <div className="chat-toolbar__left">
        <Link
          href="/dashboard"
          className="chat-toolbar__back"
          title="Retour au tableau de bord"
          aria-label="Retour au tableau de bord"
        >
          <Icon name="arrow-left" size={18} />
        </Link>
      </div>

      <div className="chat-toolbar__center">
        <label className="sr-only" htmlFor="chat-model-select">
          Modèle
        </label>
        <select
          id="chat-model-select"
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={streaming}
          className="chat-toolbar__model"
        >
          {filteredModels.map((m) => (
            <option key={m} value={m}>
              {m}
              {m === defaultModel ? " (défaut)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="chat-toolbar__right">
        <span className={`chat-toolbar__status ${headerStatus.className}`}>
          {headerStatus.label}
        </span>
        <details className="chat-toolbar__menu">
          <summary aria-label="Actions du chat">
            <Icon name="more-horizontal" size={18} />
          </summary>
          <div className="chat-toolbar__menu-panel">
            <input
              type="search"
              placeholder="Filtrer les modèles…"
              value={modelSearch}
              onChange={(e) => onModelSearchChange(e.target.value)}
              disabled={streaming}
              className="chat-toolbar__search"
            />
            <label className="chat-toolbar__mode">
              Mode
              <select
                value={thinkingMode ? "reflection" : "normal"}
                onChange={(e) => onThinkingModeChange(e.target.value === "reflection")}
                disabled={streaming}
              >
                <option value="normal">Normal</option>
                <option value="reflection">Réflexion</option>
              </select>
            </label>
            <label className="chat-toolbar__mode chat-toolbar__mode--toggle">
              <input
                type="checkbox"
                checked={agentMode}
                onChange={(e) => onAgentModeChange(e.target.checked)}
                disabled={streaming}
              />
              Mode agent
            </label>
            <PlaybookPicker
              relay={relay}
              connected={connected}
              model={model}
              contextIds={contextIds}
              disabled={!canSend || streaming}
              onRun={onPlaybookRun}
            />
            <Button type="button" variant="ghost" onClick={onToggleSidebar}>
              {showSidebar ? "Masquer panneau" : "Panneau latéral"}
            </Button>
            <Button type="button" variant="ghost" onClick={onNewConversation} disabled={streaming}>
              Nouvelle conversation
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={messagesCount === 0 || streaming}
              onClick={onExport}
            >
              Exporter .md
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={messagesCount === 0 || streaming}
              onClick={onShare}
            >
              Partager
            </Button>
            {branchOptions.length > 1 && (
              <label className="chat-toolbar__branch">
                Branche
                <select
                  value={activeBranchId}
                  onChange={(e) => onSwitchBranch(e.target.value)}
                  disabled={streaming}
                >
                  {branchOptions.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.label} ({branch.count})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </details>
      </div>
    </header>
  );
}
