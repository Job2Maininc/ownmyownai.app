import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CloudProviderStatus, HostSettings } from "../types";

const PROVIDER_LABELS: Record<CloudProviderStatus["id"], string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
};

interface CloudProvidersPanelProps {
  onChanged?: () => void;
}

export default function CloudProvidersPanel({ onChanged }: CloudProvidersPanelProps) {
  const [providers, setProviders] = useState<CloudProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    try {
      const status = await invoke<CloudProviderStatus[]>("get_cloud_providers_status");
      setProviders(status);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveKey(providerId: CloudProviderStatus["id"]) {
    const apiKey = draftKeys[providerId]?.trim();
    if (!apiKey) {
      setError("Saisissez une clé API avant d'enregistrer.");
      return;
    }

    setSavingId(providerId);
    setError(null);
    try {
      await invoke("save_cloud_provider_key", { providerId, apiKey });
      setDraftKeys((prev) => ({ ...prev, [providerId]: "" }));

      const settings = await invoke<HostSettings>("get_host_settings");
      const cloudProviders = settings.cloudProviders ?? {
        openai: { enabled: false },
        anthropic: { enabled: false },
      };
      const next = {
        ...settings,
        cloudProviders: {
          ...cloudProviders,
          [providerId]: { enabled: true },
        },
      };
      await invoke("save_host_settings", { settings: next });
      await refresh();
      onChanged?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingId(null);
    }
  }

  async function deleteKey(providerId: CloudProviderStatus["id"]) {
    if (
      !window.confirm(
        `Supprimer la clé API ${PROVIDER_LABELS[providerId]} ? Les modèles cloud associés ne seront plus disponibles.`,
      )
    ) {
      return;
    }

    setDeletingId(providerId);
    setError(null);
    try {
      await invoke("delete_cloud_provider_key", { providerId });

      const settings = await invoke<HostSettings>("get_host_settings");
      const cloudProviders = settings.cloudProviders ?? {
        openai: { enabled: false },
        anthropic: { enabled: false },
      };
      await invoke("save_host_settings", {
        settings: {
          ...settings,
          cloudProviders: {
            ...cloudProviders,
            [providerId]: { enabled: false },
          },
        },
      });
      await refresh();
      onChanged?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleEnabled(provider: CloudProviderStatus, enabled: boolean) {
    if (enabled && !provider.configured) {
      setError(`Configurez d'abord une clé API pour ${PROVIDER_LABELS[provider.id]}.`);
      return;
    }

    setTogglingId(provider.id);
    setError(null);
    try {
      const settings = await invoke<HostSettings>("get_host_settings");
      const cloudProviders = settings.cloudProviders ?? {
        openai: { enabled: false },
        anthropic: { enabled: false },
      };
      await invoke("save_host_settings", {
        settings: {
          ...settings,
          cloudProviders: {
            ...cloudProviders,
            [provider.id]: { enabled },
          },
        },
      });
      await refresh();
      onChanged?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <section className="panel cloud-providers-panel" aria-label="Fournisseurs cloud">
      <div className="panel__head">
        <h2>Fournisseurs cloud</h2>
        <button type="button" className="btn-ghost" onClick={() => void refresh()} disabled={loading}>
          {loading ? "…" : "Actualiser"}
        </button>
      </div>
      <p className="muted panel__meta">
        Clés API stockées dans le keyring Host — jamais envoyées au web ni au relay.
        Modèles préfixés <code className="inline-code">openai:</code> ou{" "}
        <code className="inline-code">anthropic:</code>.
      </p>

      {providers.map((provider) => {
        const label = PROVIDER_LABELS[provider.id];
        const busy =
          savingId === provider.id || deletingId === provider.id || togglingId === provider.id;
        const active = provider.configured && provider.enabled;

        return (
          <article key={provider.id} className="cloud-provider-card">
            <div className="cloud-provider-card__head">
              <div>
                <strong>{label}</strong>
                <span
                  className={`cloud-provider-card__badge ${
                    active
                      ? "cloud-provider-card__badge--on"
                      : provider.configured
                        ? "cloud-provider-card__badge--ready"
                        : ""
                  }`}
                >
                  {active
                    ? "Actif"
                    : provider.configured
                      ? "Clé enregistrée"
                      : "Non configuré"}
                </span>
              </div>
              <label className="filter-toggle cloud-provider-card__toggle">
                <input
                  type="checkbox"
                  checked={provider.enabled}
                  disabled={busy || !provider.configured}
                  onChange={(e) => void toggleEnabled(provider, e.target.checked)}
                />
                Activé
              </label>
            </div>

            <div className="cloud-provider-card__key-row">
              <input
                type="password"
                className="model-search"
                placeholder={provider.configured ? "Nouvelle clé API (optionnel)" : "Clé API"}
                value={draftKeys[provider.id] ?? ""}
                autoComplete="off"
                disabled={busy}
                onChange={(e) =>
                  setDraftKeys((prev) => ({ ...prev, [provider.id]: e.target.value }))
                }
              />
              <button
                type="button"
                className="btn-secondary"
                disabled={busy || !(draftKeys[provider.id]?.trim())}
                onClick={() => void saveKey(provider.id)}
              >
                {savingId === provider.id ? "…" : "Enregistrer"}
              </button>
              {provider.configured ? (
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() => void deleteKey(provider.id)}
                >
                  {deletingId === provider.id ? "…" : "Supprimer"}
                </button>
              ) : null}
            </div>

            {provider.models.length > 0 && (
              <ul className="cloud-provider-card__models">
                {provider.models.map((model) => (
                  <li key={model}>
                    <code className="inline-code">{model}</code>
                    {active ? (
                      <span className="model-chip__tag">disponible</span>
                    ) : (
                      <span className="muted">nécessite clé + activation</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </article>
        );
      })}

      {error ? <p className="error-line">{error}</p> : null}
    </section>
  );
}
