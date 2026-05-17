import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-shell";
import Dashboard from "./components/Dashboard";
import type { OllamaStatus, StoredCredentials } from "./types";

type Step = "welcome" | "ollama" | "pairing" | "online";

const DEFAULT_MODEL = "llama3.2:3b";

export default function App() {
  const [step, setStep] = useState<Step>("welcome");
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [pullProgress, setPullProgress] = useState("");
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
    const unlisten = listen<string>("ollama-setup-progress", (event) => {
      setPullProgress(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  async function handleWelcomeNext() {
    setStep("ollama");
    setError(null);
    setPullProgress("Préparation de l'IA locale…");

    try {
      await invoke("ensure_ollama_running");
      let status = await checkOllama();

      const hasModel =
        status?.models?.some(
          (m) => m === DEFAULT_MODEL || m.startsWith(`${DEFAULT_MODEL}:`),
        ) ?? false;

      if (!hasModel) {
        await invoke("pull_model", { model: DEFAULT_MODEL });
        status = await checkOllama();
      }

      if (!status?.running) {
        setError("Ollama n'est pas démarré. Réessayez.");
        return;
      }

      setPullProgress("Prêt !");
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
      await invoke("start_background_services");
      setStep("online");
    } catch (e) {
      setError(String(e));
    }
  }

  async function openPairingPage() {
    await open(`${appUrl}/host/link`);
  }

  const stepIndex = { welcome: 0, ollama: 1, pairing: 2, online: 3 }[step];
  const progressWidth = pullProgress.includes("Prêt")
    ? "100%"
    : pullProgress
      ? "60%"
      : "20%";

  const showSteps = step !== "online";

  return (
    <main className={`app ${step === "online" ? "app--dashboard" : ""}`}>
      {showSteps && (
        <div className="steps">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`step ${i <= stepIndex ? "active" : ""}`} />
          ))}
        </div>
      )}

      <div className={step === "online" ? "card card--wide" : "card"}>
        {step === "welcome" && (
          <>
            <h1>OwnMyOwnAI Host</h1>
            <p className="muted">
              Tout s&apos;installe automatiquement : Ollama, le modèle IA, puis la liaison avec votre compte.
              Prévoyez ~8 Go de RAM et ~10 Go d&apos;espace disque.
            </p>
            <button
              type="button"
              className="btn-primary"
              style={{ width: "100%", marginTop: 16 }}
              onClick={handleWelcomeNext}
            >
              Commencer
            </button>
          </>
        )}

        {step === "ollama" && (
          <>
            <h1>Préparation de l&apos;IA</h1>
            {pullProgress && <p>{pullProgress}</p>}
            {ollamaStatus && (
              <p className="muted" style={{ fontSize: 14 }}>
                {ollamaStatus.running ? "Moteur IA actif" : "Installation ou démarrage…"}
                {ollamaStatus.models.length > 0 &&
                  ` · ${ollamaStatus.models.length} modèle(s)`}
              </p>
            )}
            <div className="progress">
              <div className="progress-bar" style={{ width: progressWidth }} />
            </div>
          </>
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

        {step === "online" && <Dashboard appUrl={appUrl} />}

        {error && step !== "online" && (
          <p className="error-banner">{error}</p>
        )}
      </div>
    </main>
  );
}
