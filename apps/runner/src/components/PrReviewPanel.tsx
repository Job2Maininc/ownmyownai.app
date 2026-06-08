import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface GitRepoInfo {
  linkId: string;
  path: string;
  knowledgeBaseId: string;
  hasGh: boolean;
}

interface SecurityFinding {
  severity: string;
  category: string;
  file?: string | null;
  lineHint?: string | null;
  message: string;
}

interface PrReviewResult {
  repoPath?: string | null;
  diffStats: {
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
    bytes: number;
  };
  filesTouched: string[];
  securityFindings: SecurityFinding[];
  staticChecklist: string;
  aiReview: string;
  model: string;
}

function truncatePath(path: string, max = 52) {
  if (path.length <= max) return path;
  return `…${path.slice(-max + 1)}`;
}

export default function PrReviewPanel() {
  const [repos, setRepos] = useState<GitRepoInfo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [diff, setDiff] = useState("");
  const [prNumber, setPrNumber] = useState("");
  const [ghAvailable, setGhAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PrReviewResult | null>(null);

  const refreshRepos = useCallback(async () => {
    try {
      const list = await invoke<GitRepoInfo[]>("list_git_repos");
      setRepos(list);
      if (list.length > 0 && !selectedRepo) {
        setSelectedRepo(list[0].path);
      }
    } catch (e) {
      setError(String(e));
    }
  }, [selectedRepo]);

  useEffect(() => {
    void refreshRepos();
    void invoke<boolean>("is_gh_available").then(setGhAvailable).catch(() => setGhAvailable(false));
  }, [refreshRepos]);

  async function loadDiff(mode: string) {
    if (!selectedRepo) {
      setError("Sélectionnez un dépôt lié.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const text = await invoke<string>("collect_git_diff", {
        repoPath: selectedRepo,
        mode,
      });
      setDiff(text);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadGhPr() {
    if (!selectedRepo || !prNumber.trim()) {
      setError("Numéro de PR requis.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const text = await invoke<string>("collect_gh_pr_diff", {
        repoPath: selectedRepo,
        prNumber: Number.parseInt(prNumber, 10),
      });
      setDiff(text);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function runReview() {
    if (!diff.trim()) {
      setError("Collez ou chargez un diff avant de lancer la review.");
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const review = await invoke<PrReviewResult>("review_git_diff", {
        input: {
          diff,
          repoPath: selectedRepo || null,
        },
      });
      setResult(review);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>Review PR locale</h2>
        <button type="button" className="btn-ghost" onClick={() => void refreshRepos()}>
          Actualiser
        </button>
      </div>
      <p className="muted panel__meta">
        Analyse un diff git sur ce PC (Ollama) avec checklist sécurité — aucune donnée envoyée au cloud.
      </p>

      {repos.length === 0 ? (
        <p className="panel__empty">
          Aucun dépôt Git lié. Liez un dossier contenant un repo dans l&apos;onglet Contexte.
        </p>
      ) : (
        <label className="field">
          <span className="field__label">Dépôt lié</span>
          <select
            className="field__input"
            value={selectedRepo}
            onChange={(e) => setSelectedRepo(e.target.value)}
          >
            {repos.map((r) => (
              <option key={r.linkId} value={r.path}>
                {truncatePath(r.path)}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="btn-row" style={{ marginTop: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <button type="button" className="btn-secondary" disabled={loading} onClick={() => void loadDiff("head")}>
          Diff HEAD
        </button>
        <button type="button" className="btn-secondary" disabled={loading} onClick={() => void loadDiff("staged")}>
          Diff indexé
        </button>
        <button type="button" className="btn-secondary" disabled={loading} onClick={() => void loadDiff("unstaged")}>
          Non commité
        </button>
        {ghAvailable ? (
          <>
            <input
              className="field__input"
              style={{ width: "5rem" }}
              placeholder="PR #"
              value={prNumber}
              onChange={(e) => setPrNumber(e.target.value)}
            />
            <button type="button" className="btn-secondary" disabled={loading} onClick={() => void loadGhPr()}>
              gh pr diff
            </button>
          </>
        ) : null}
      </div>

      <label className="field" style={{ marginTop: "1rem" }}>
        <span className="field__label">Diff (collé ou chargé)</span>
        <textarea
          className="field__input"
          rows={10}
          value={diff}
          onChange={(e) => setDiff(e.target.value)}
          placeholder="Collez un unified diff ou chargez-le depuis git / gh…"
        />
      </label>

      <button
        type="button"
        className="btn-primary"
        style={{ marginTop: "0.75rem" }}
        disabled={loading || !diff.trim()}
        onClick={() => void runReview()}
      >
        {loading ? "Analyse en cours…" : "Lancer la review"}
      </button>

      {error ? (
        <p className="error-banner" role="alert" style={{ marginTop: "1rem" }}>
          {error}
        </p>
      ) : null}

      {result ? (
        <div style={{ marginTop: "1.25rem" }}>
          <p className="muted panel__meta">
            {result.diffStats.filesChanged} fichier(s) · +{result.diffStats.linesAdded} / −
            {result.diffStats.linesRemoved} · modèle {result.model}
          </p>
          {result.securityFindings.length > 0 ? (
            <div className="panel panel--compact" style={{ marginTop: "0.75rem" }}>
              <h3>Signaux sécurité ({result.securityFindings.length})</h3>
              <ul className="session-list">
                {result.securityFindings.map((f, i) => (
                  <li key={`${f.category}-${i}`} className="session-item">
                    <strong>[{f.severity}]</strong> {f.category}
                    {f.file ? ` — ${f.file}` : ""} : {f.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <pre
            className="host-id"
            style={{
              marginTop: "0.75rem",
              whiteSpace: "pre-wrap",
              maxHeight: "24rem",
              overflow: "auto",
            }}
          >
            {result.aiReview}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
