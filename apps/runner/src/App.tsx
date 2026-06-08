import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-shell";
import Dashboard from "./components/Dashboard";
import InstallProgress from "./components/InstallProgress";
import ModelSetup from "./components/ModelSetup";
import type { HostSettings, OllamaStatus, SetupProgress, StoredCredentials } from "./types";

type Step = "welcome" | "models" | "ollama" | "pairing" | "online";

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
      setError(String(e));
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
      setProgress(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  async function runInstallation(settings: HostSettings) {
    setStep("ollama");
    setError(null);
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
      await invoke("ensure_ollama_running");
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
      setError(String(e));
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
      setError(String(e));
    }
  }

  async function openPairingPage() {
    await open(`${appUrl}/host/link`);
  }

  function handleUnpaired() {
    setCredentials(null);
    setPairingCode("");
    setError(null);
    setStep("pairing");
  }

  const stepIndex = { welcome: 0, models: 1, ollama: 2, pairing: 3, online: 4 }[step];
  const showSteps = step !== "online";

  return (
    <main className={`app ${step === "online" ? "app--dashboard" : ""}`}>
      {showSteps && (
        <div className="steps">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={`step ${i <= stepIndex ? "active" : ""}`} />
          ))}
        </div>
      )}

      <div className={step === "online" ? "card card--wide" : "card card--setup"}>
        {step === "welcome" && (
          <>
            <h1>OwnMyOwnAI Host</h1>
            <p className="muted">
              Installez Ollama, choisissez vos modèles IA et liez ce PC à votre compte.
              Vous pourrez suivre la progression des téléchargements étape par étape.
            </p>
            <button
              type="button"
              className="btn-primary"
              style={{ width: "100%", marginTop: 16 }}
              onClick={() => {
                setError(null);
                setStep("models");
              }}
            >
              Commencer
            </button>
          </>
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
          <InstallProgress progress={progress} ollamaStatus={ollamaStatus} />
        )}

        {step === "pairing" && (
          <>
            <h1>Lier votre compte</h1>
            <p className="muted" style={{ fontSize: 14 }}>
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

        {error && step !== "online" && step !== "models" && (
          <p className="error-banner">{error}</p>
        )}
      </div>
    </main>
  );
}
