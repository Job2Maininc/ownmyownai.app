"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Host } from "@ownmyownai/supabase-types";
import { deleteHost, renameHost } from "@/app/dashboard/actions";
import {
  getHostDisplayStatus,
  hostStatusClassName,
  hostStatusLabel,
} from "@/lib/host-status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface HostCardProps {
  host: Host;
}

export function HostCard({ host: initialHost }: HostCardProps) {
  const router = useRouter();
  const [host, setHost] = useState(initialHost);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(host.name);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const displayStatus = getHostDisplayStatus(host);
  const chatDisabled = displayStatus === "offline" || displayStatus === "busy";
  const chatTitle =
    displayStatus === "offline"
      ? "Host hors ligne"
      : displayStatus === "busy"
        ? "Host occupé — chat en cours"
        : undefined;

  async function handleRename() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === host.name) {
      setEditing(false);
      setName(host.name);
      return;
    }
    setSaving(true);
    const { error: renameError } = await renameHost(host.id, trimmed);
    setSaving(false);
    if (renameError) return;
    setHost({ ...host, name: trimmed });
    setEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm(`Supprimer « ${host.name} » ? Cette action est irréversible.`)) {
      return;
    }
    setDeleting(true);
    const { error: deleteError } = await deleteHost(host.id);
    setDeleting(false);
    if (deleteError) return;
    router.refresh();
  }

  return (
    <Card className="flex items-center justify-between gap-4">
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
              className="flex-1 rounded border border-[var(--border)] bg-black/30 px-2 py-1 text-sm outline-none focus:border-brand-500"
              autoFocus
              disabled={saving}
            />
            <Button type="submit" variant="ghost" disabled={saving}>
              OK
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
            className="font-medium hover:text-brand-400"
            title="Renommer"
            onClick={() => setEditing(true)}
          >
            {host.name}
          </button>
        )}
        <p className="text-sm text-[var(--muted)]">
          {host.default_model} ·{" "}
          <span className={hostStatusClassName(displayStatus)}>
            {hostStatusLabel(displayStatus)}
          </span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
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
    </Card>
  );
}
