"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Host } from "@ownmyownai/supabase-types";
import { deleteHost, renameHost, updateDefaultModel } from "@/app/dashboard/actions";
import {
  getHostDisplayStatus,
  getHostIndexingProgress,
  hostStatusLabel,
  hostStatusPillVariant,
} from "@/lib/host-status";
import {
  formatLatency,
  formatTokensPerSecond,
  parseHostLastMetrics,
} from "@/lib/host-metrics";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { IndexingProgressBar } from "@/components/chat/indexing-progress-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/error-alert";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { ModelPullPanel } from "./model-pull-panel";

interface HostCardProps {
  host: Host;
}

export function HostCard({ host: initialHost }: HostCardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [host, setHost] = useState(initialHost);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(host.name);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingModel, setUpdatingModel] = useState(false);
  const [showPull, setShowPull] = useState(false);

  const installedModels = Array.isArray(host.installed_models) ? host.installed_models : [];
  const displayStatus = getHostDisplayStatus(host);
  const indexing = getHostIndexingProgress(host);
  const chatDisabled = displayStatus === "offline";
  const chatTitle = displayStatus === "offline" ? "Host hors ligne" : undefined;
  const lastMetrics =
    displayStatus !== "offline" ? parseHostLastMetrics(host.last_metrics) : null;

  async function handleRename() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === host.name) {
      setEditing(false);
      setName(host.name);
      return;
    }
    setSaving(true);
    setActionError(null);
    const { error: renameError } = await renameHost(host.id, trimmed);
    setSaving(false);
    if (renameError) {
      setActionError(renameError);
      return;
    }
    setHost({ ...host, name: trimmed });
    setEditing(false);
    toast(`« ${trimmed} » renommé`);
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm(`Supprimer « ${host.name} » ? Cette action est irréversible.`)) {
      return;
    }
    setDeleting(true);
    setActionError(null);
    const { error: deleteError } = await deleteHost(host.id);
    setDeleting(false);
    if (deleteError) {
      setActionError(deleteError);
      return;
    }
    toast(`« ${host.name} » supprimé`);
    router.refresh();
  }

  async function handleDefaultModelChange(model: string) {
    setUpdatingModel(true);
    setActionError(null);
    const { error } = await updateDefaultModel(host.id, model);
    setUpdatingModel(false);
    if (error) {
      setActionError(error);
      return;
    }
    setHost({ ...host, default_model: model });
    toast(`Modèle par défaut : ${model}`);
    router.refresh();
  }

  return (
    <Card interactive className="flex flex-col gap-3 transition-shadow duration-fast">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void handleRename();
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field flex-1 !px-2 !py-1 text-sm"
                autoFocus
                disabled={saving}
              />
              <Button type="submit" variant="ghost" disabled={saving}>
                {saving ? "…" : "OK"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setName(host.name);
                }}
              >
                Annuler
              </Button>
            </form>
          ) : (
            <button
              type="button"
              className="font-medium hover:text-[var(--link)]"
              title="Renommer"
              onClick={() => setEditing(true)}
            >
              {host.name}
            </button>
          )}
          <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
            <StatusPill
              variant={hostStatusPillVariant(displayStatus)}
              label={hostStatusLabel(displayStatus)}
            />
            <span title="Dernière activité">Vu {formatRelativeTime(host.last_seen_at)}</span>
            {host.disk_free_gb != null && <span>{host.disk_free_gb} Go libres</span>}
            {lastMetrics && (
              <>
                <span>{formatTokensPerSecond(lastMetrics.tokensPerSecond)} tokens/s</span>
                <span>{formatLatency(lastMetrics.latencyMs)} latence</span>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Link href={`/onboarding/cursor?host=${host.id}`}>
            <Button variant="ghost" className="text-xs" title="Configurer Cursor IDE">
              Cursor
            </Button>
          </Link>
          <Button
            variant="ghost"
            onClick={handleDelete}
            disabled={deleting}
            title="Supprimer ce PC"
          >
            {deleting ? "…" : "Supprimer"}
          </Button>
          {chatDisabled ? (
            <Button variant="secondary" disabled title={chatTitle}>
              Chat
            </Button>
          ) : (
            <Link href={`/chat/${host.id}`}>
              <Button variant="primary">Chat</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[var(--muted)]">Modèle par défaut :</span>
        {installedModels.length > 0 ? (
          <select
            value={host.default_model}
            disabled={updatingModel}
            onChange={(e) => void handleDefaultModelChange(e.target.value)}
            className="input-field !w-auto !px-2 !py-1 text-sm"
          >
            {installedModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <code className="text-xs">{host.default_model}</code>
        )}
      </div>

      {installedModels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {installedModels.map((m) => (
            <span
              key={m}
              className={`rounded-full border px-2.5 py-0.5 font-mono text-xs transition-colors duration-fast ${
                m === host.default_model
                  ? "border-[color-mix(in_srgb,var(--link)_30%,var(--border))] bg-[var(--accent-dim)] font-medium"
                  : "border-[var(--border)] bg-[var(--surface)]"
              }`}
            >
              {m}
            </span>
          ))}
        </div>
      )}

      {indexing && (
        <IndexingProgressBar progress={indexing.progress} message={indexing.message} />
      )}

      {(displayStatus === "online" || displayStatus === "busy") && (
        <div>
          <Button
            type="button"
            variant="ghost"
            className="text-xs"
            onClick={() => setShowPull((v) => !v)}
          >
            {showPull ? "Masquer téléchargement modèle" : "Télécharger un modèle"}
          </Button>
          {showPull && (
            <div className="mt-2">
              <ModelPullPanel hostId={host.id} onDone={() => router.refresh()} />
            </div>
          )}
        </div>
      )}

      {actionError && (
        <ErrorAlert message={actionError} onAction={() => setActionError(null)} actionLabel="Fermer" />
      )}
    </Card>
  );
}
