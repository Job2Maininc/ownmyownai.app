import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";

type Step = "welcome" | "ollama" | "pairing" | "online";

interface OllamaStatus {
  installed: boolean;
  running: boolean;
  models: string[];
}

interface StoredCredentials {
  host_id: string;
  device_secret: string;
}

export default function App() {
  const [step, setStep] = useState<Step>("welcome");
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [pullProgress, setPullProgress] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<StoredCredentials | null>(null);
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
      /* no creds yet */
    }
  }, []);

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  async function handleWelcomeNext() {
    setStep("ollama");
    setError(null);
    const status = await checkOllama();
    if (!status?.running) {
      try {
        await invoke("ensure_ollama_running");
        await checkOllama();
      } catch (e) {
        setError(String(e));
        return;
      }
    }
    if (!status?.models?.includes("llama3.2:3b")) {
      setPullProgress("Téléchargement du modèle llama3.2:3b…");
      try {
        await invoke("pull_model", { model: "llama3.2:3b" });
        setPullProgress("Modèle prêt !");
        await checkOllama();
      } catch (e) {
        setError(String(e));
        return;
      }
    }
    setStep("pairing");
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

  return (
    <main style={{ padding: 32, minHeight: "100vh" }}>
      <div className="steps">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`step ${i <= stepIndex ? "active" : ""}`} />
        ))}
      </div>

      <div className="card">
        {step === "welcome" && (
          <>
            <h1>OwnMyOwnAI Host</h1>
            <p style={{ color: "var(--muted)" }}>
              Votre IA tournera sur ce PC. Assurez-vous d&apos;avoir au moins 8 Go de RAM.
            </p>
            <button className="btn-primary" style={{ width: "100%", marginTop: 16 }} onClick={handleWelcomeNext}>
              Commencer
            </button>
          </>
        )}

        {step === "ollama" && (
          <>
            <h1>Préparation d&apos;Ollama</h1>
            {pullProgress && <p>{pullProgress}</p>}
            {ollamaStatus && (
              <p style={{ color: "var(--muted)", fontSize: 14 }}>
                {ollamaStatus.running ? "Ollama actif" : "Démarrage…"}
                {ollamaStatus.models.length > 0 && ` · ${ollamaStatus.models.length} modèle(s)`}
              </p>
            )}
            <div className="progress">
              <div className="progress-bar" style={{ width: pullProgress ? "100%" : "30%" }} />
            </div>
          </>
        )}

        {step === "pairing" && (
          <>
            <h1>Lier votre compte</h1>
            <p style={{ color: "var(--muted)", fontSize: 14 }}>
              1. Ouvrez le site et connectez-vous
              <br />
              2. Générez un code de pairing
              <br />
              3. Entrez le code ci-dessous
            </p>
            <button className="btn-secondary" style={{ width: "100%", margin: "12px 0" }} onClick={openPairingPage}>
              Ouvrir le site web
            </button>
            <label style={{ fontSize: 12, color: "var(--muted)" }}>Nom du PC</label>
            <input value={hostName} onChange={(e) => setHostName(e.target.value)} style={{ marginBottom: 8 }} />
            <label style={{ fontSize: 12, color: "var(--muted)" }}>Code de pairing</label>
            <input
              value={pairingCode}
              onChange={(e) => setPairingCode(e.target.value)}
              placeholder="ABCD-1234"
              style={{ marginBottom: 12 }}
            />
            <button className="btn-primary" style={{ width: "100%" }} onClick={handlePairing} disabled={!pairingCode.trim()}>
              Lier ce PC
            </button>
          </>
        )}

        {step === "online" && (
          <>
            <h1>En ligne</h1>
            <p style={{ color: "var(--accent)" }}>
              Votre host est connecté. Discutez depuis le navigateur.
            </p>
            {credentials && (
              <p style={{ fontSize: 12, color: "var(--muted)" }}>
                Host ID : {credentials.host_id.slice(0, 8)}…
              </p>
            )}
            <button
              className="btn-primary"
              style={{ width: "100%", marginTop: 16 }}
              onClick={() => open(`${appUrl}/dashboard`)}
            >
              Ouvrir le chat web
            </button>
          </>
        )}

        {error && <p style={{ color: "#f87171", fontSize: 14, marginTop: 12 }}>{error}</p>}
      </div>
    </main>
  );
}
