import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { BrandMark } from "./components/BrandMark";
import { ThemeToggle } from "./components/ThemeToggle";
import Dashboard from "./components/Dashboard";
import InstallProgress from "./components/InstallProgress";
import ModelSetup from "./components/ModelSetup";
import StorageSetup from "./components/StorageSetup";
import { formatInvokeError } from "./lib/tauri-errors";
import { ensureOllamaRunning } from "./lib/ollama-setup";
import type { HostSettings, OllamaStatus, SetupProgress, StoredCredentials } from "./types";

type Step = "welcome" | "storage" | "models" | "ollama" | "pairing" | "online";

function modelIsPresent(installed: string[], modelId: string): boolean {
  const base = modelId.split(":")[0];
  return installed.some(
    (m) => m === modelId || m.startsWith(`${modelId}:`) || m.startsWith(`${base}:`),
  );
}

export default function App() {
  const [step, setStep] = useState<Step>("welcome");
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [progress, setProgress] = useState<SetupProgress | null>(null);
  const [activityLog, setActivityLog] = useState<string[]>([]);
  const [hostSettings, setHostSettings] = useState<HostSettings | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, setCredentials] = useState<StoredCredentials | null>(null);
  const [hostName, setHostName] = useState("Mon PC");

  const appUrl = import.meta.env.VITE_APP_URL ?? "http://localhost:3000";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";

  const checkOllama = useCallback(async () => {
    try {
      const status = await invoke<OllamaStatus>("check_ollama");
      setOllamaStatus(status);
      return status;
    } catch (e) {
      setError(formatInvokeError(e));
      return null;
    }
  }, []);

  const loadCredentials = useCallback(async () => {
    try {
      const creds = await invoke<StoredCredentials | null>("get_credentials");
      if (creds) {
        setCredentials(creds);
        setStep("online");
        await invoke("start_background_services");
      }
    } catch {
      /* pas encore lié */
    }
  }, []);

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  useEffect(() => {
    const unlisten = listen<SetupProgress>("ollama-progress", (event) => {
      const payload = event.payload;
      setProgress(payload);
      if (payload.message) {
        setActivityLog((prev) => {
          const last = prev[prev.length - 1];
          if (last === payload.message) return prev;
          const next = [...prev, payload.message];
          return next.length > 80 ? next.slice(-80) : next;
        });
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  async function runInstallation(settings: HostSettings) {
    setStep("ollama");
    setError(null);
    setActivityLog([]);
    setProgress({
      phase: "ollama_start",
      message: "Préparation de l'IA locale…",
      percent: null,
      bytesDownloaded: null,
      bytesTotal: null,
      currentModel: null,
      modelIndex: null,
      modelCount: null,
    });

    try {
      await ensureOllamaRunning(settings.selectedModels);
      let status = await checkOllama();

      const missing = settings.selectedModels.filter(
        (model) => !modelIsPresent(status?.models ?? [], model),
      );

      if (missing.length > 0) {
        await invoke("pull_models", { models: missing });
        status = await checkOllama();
      }

      if (!status?.running) {
        setError("Ollama n'est pas démarré. Réessayez.");
        return;
      }

      setProgress({
        phase: "model_pull",
        message: "Prêt !",
        percent: 100,
        bytesDownloaded: null,
        bytesTotal: null,
        currentModel: null,
        modelIndex: null,
        modelCount: null,
      });
      setStep("pairing");
    } catch (e) {
      setError(formatInvokeError(e));
    }
  }

  async function handlePairing() {
    setError(null);
    try {
      const result = await invoke<StoredCredentials>("complete_pairing", {
        code: pairingCode.toUpperCase().trim(),
        name: hostName,
        supabaseUrl,
      });
      setCredentials(result);
      setStep("online");
    } catch (e) {
      setError(formatInvokeError(e));
    }
  }

  async function openPairingPage() {
    await invoke("open_url", { url: `${appUrl}/host/link` });
  }

  function handleUnpaired() {
    setCredentials(null);
    setPairingCode("");
    setError(null);
    setStep("pairing");
  }

  const stepIndex = { welcome: 0, storage: 1, models: 2, ollama: 3, pairing: 4, online: 5 }[step];
  const showSteps = step !== "online";

  return (
    <main className={`app ${step === "online" ? "app--dashboard" : ""}`}>
      {step !== "online" && (
        <div className="app__theme-toggle">
          <ThemeToggle />
        </div>
      )}
      {showSteps && (
        <div className="steps">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`step ${i <= stepIndex ? "active" : ""}`} />
          ))}
        </div>
      )}

      <div className={step === "online" ? "card card--wide" : "card card--setup"}>
        {step === "welcome" && (
          <div className="welcome">
            <BrandMark className="welcome__brand" />
            <h1 className="welcome__title">Bienvenue</h1>
            <p className="muted welcome__lead">
              Configurons votre IA locale en quelques minutes — stockage, modèles et liaison à
              votre compte.
            </p>
            <button
              type="button"
              className="btn-primary welcome__cta"
              onClick={() => {
                setError(null);
                setStep("storage");
              }}
            >
              Commencer
            </button>
          </div>
        )}

        {step === "storage" && (
          <StorageSetup
            error={error}
            onContinue={() => {
              setError(null);
              setStep("models");
            }}
          />
        )}

        {step === "models" && (
          <ModelSetup
            error={error}
            onContinue={(settings) => {
              setHostSettings(settings);
              void runInstallation(settings);
            }}
          />
        )}

        {step === "ollama" && (
          <InstallProgress
            progress={progress}
            ollamaStatus={ollamaStatus}
            activityLog={activityLog}
          />
        )}

        {step === "pairing" && (
          <>
            <h1>Lier votre compte</h1>
            <p className="muted type-small">
              1. Ouvrez le site et connectez-vous
              <br />
              2. Générez un code de pairing
              <br />
              3. Entrez le code ci-dessous
            </p>
            {hostSettings && (
              <p className="muted pairing-recap">
                Modèle par défaut :{" "}
                <code className="inline-code">{hostSettings.defaultModel}</code>
              </p>
            )}
            <button
              type="button"
              className="btn-secondary"
              style={{ width: "100%", margin: "12px 0" }}
              onClick={openPairingPage}
            >
              Ouvrir le site web
            </button>
            <label className="field-label">Nom du PC</label>
            <input
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <label className="field-label">Code de pairing</label>
            <input
              className="input-code"
              value={pairingCode}
              onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
              placeholder="ABCD-1234"
              style={{ marginBottom: 12 }}
            />
            <button
              type="button"
              className="btn-primary"
              style={{ width: "100%" }}
              onClick={handlePairing}
              disabled={!pairingCode.trim()}
            >
              Lier ce PC
            </button>
          </>
        )}

        {step === "online" && <Dashboard appUrl={appUrl} onUnpaired={handleUnpaired} />}

        {error && step !== "online" && step !== "models" && step !== "storage" && (
          <p className="error-banner">{error}</p>
        )}
      </div>
    </main>
  );
}
