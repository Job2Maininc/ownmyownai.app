import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ReviewIcon, type ReviewIconId } from "./Icons";
import { EmptyStatePanel } from "./EmptyState";

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

type ReviewMode = "unstaged" | "staged" | "head" | "github-pr";

const REVIEW_OPTIONS: {
  id: ReviewMode;
  title: string;
  hint: string;
  iconId: ReviewIconId;
  gitMode?: string;
}[] = [
  {
    id: "unstaged",
    title: "Modifications en cours",
    hint: "Fichiers modifiés mais pas encore ajoutés au commit",
    iconId: "unstaged",
    gitMode: "unstaged",
  },
  {
    id: "staged",
    title: "Prêt à committer",
    hint: "Ce qui sera inclus dans votre prochain commit",
    iconId: "staged",
    gitMode: "staged",
  },
  {
    id: "head",
    title: "Dernier commit",
    hint: "Revoir les changements du commit le plus récent",
    iconId: "head",
    gitMode: "head",
  },
  {
    id: "github-pr",
    title: "Pull Request GitHub",
    hint: "Analyser une PR avec la commande gh (si installée)",
    iconId: "github-pr",
  },
];

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
  const [showDiff, setShowDiff] = useState(false);
  const [pendingGhReview, setPendingGhReview] = useState(false);

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
      setError("Choisissez d'abord un dépôt.");
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const text = await invoke<string>("collect_git_diff", {
        repoPath: selectedRepo,
        mode,
      });
      setDiff(text);
      return text;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function loadGhPr() {
    if (!selectedRepo || !prNumber.trim()) {
      setError("Indiquez le numéro de la Pull Request (ex. 42).");
      return null;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const text = await invoke<string>("collect_gh_pr_diff", {
        repoPath: selectedRepo,
        prNumber: Number.parseInt(prNumber, 10),
      });
      setDiff(text);
      return text;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function runReview(diffText?: string) {
    const content = (diffText ?? diff).trim();
    if (!content) {
      setError("Aucun changement à analyser. Essayez une autre source.");
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const review = await invoke<PrReviewResult>("review_git_diff", {
        input: {
          diff: content,
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

  async function handleReviewChoice(option: (typeof REVIEW_OPTIONS)[number]) {
    if (!selectedRepo) {
      setError("Liez d'abord un dépôt Git dans l'onglet Base de données IA.");
      return;
    }

    if (option.id === "github-pr") {
      if (!ghAvailable) {
        setError(
          "GitHub CLI (gh) n'est pas installé. Installez-le ou choisissez une autre option.",
        );
        return;
      }
      setPendingGhReview(true);
      return;
    }

    setPendingGhReview(false);
    const loaded = await loadDiff(option.gitMode!);
    if (loaded?.trim()) {
      await runReview(loaded);
    }
  }

  async function confirmGhReview() {
    const loaded = await loadGhPr();
    setPendingGhReview(false);
    if (loaded?.trim()) {
      await runReview(loaded);
    }
  }

  const visibleOptions = REVIEW_OPTIONS.filter(
    (o) => o.id !== "github-pr" || ghAvailable,
  );

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>Revue de code</h2>
        <button type="button" className="btn-ghost" onClick={() => void refreshRepos()}>
          Actualiser
        </button>
      </div>

      <div className="review-intro">
        <p className="review-intro__lead">
          <strong>À quoi ça sert ?</strong> Avant de committer ou d&apos;ouvrir une Pull Request,
          l&apos;IA locale relit vos changements comme un collègue développeur : bugs possibles,
          risques de sécurité, qualité du code.
        </p>
        <ul className="review-intro__points muted">
          <li>Tout reste sur votre PC — le diff n&apos;est pas envoyé au cloud</li>
          <li>Fonctionne sur vos dépôts Git déjà liés dans Base de données IA</li>
          <li>Résultat en français : résumé, sécurité, recommandations</li>
        </ul>
      </div>

      {repos.length === 0 ? (
        <EmptyStatePanel
          icon="git-branch"
          title="Aucun dépôt Git détecté"
          description="Dans l'onglet Contexte, liez un dossier de projet contenant un dossier .git via la carte « Dépôt Git »."
        />
      ) : (
        <>
          <label className="field-label">Projet à analyser</label>
          <select
            className="field__input"
            value={selectedRepo}
            onChange={(e) => {
              setSelectedRepo(e.target.value);
              setResult(null);
              setDiff("");
            }}
            style={{ marginBottom: 16 }}
          >
            {repos.map((r) => (
              <option key={r.linkId} value={r.path}>
                {truncatePath(r.path)}
              </option>
            ))}
          </select>

          <div className="source-picker">
            <h3>Que voulez-vous faire relire ?</h3>
            <p className="muted source-picker__lead">
              Choisissez une source — l&apos;analyse démarre automatiquement.
            </p>
            <div className="source-picker__grid">
              {visibleOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="source-card"
                  disabled={loading}
                  onClick={() => void handleReviewChoice(option)}
                >
                  <span className="source-card__icon" aria-hidden>
                    <ReviewIcon id={option.iconId} size={20} />
                  </span>
                  <strong>{option.title}</strong>
                  <span className="muted">{option.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {pendingGhReview && (
            <div className="drive-picker">
              <h4>Numéro de Pull Request</h4>
              <div className="context-create">
                <input
                  value={prNumber}
                  onChange={(e) => setPrNumber(e.target.value)}
                  placeholder="Ex. 42"
                  style={{ maxWidth: 120 }}
                />
                <button
                  type="button"
                  className="btn-primary"
                  disabled={loading || !prNumber.trim()}
                  onClick={() => void confirmGhReview()}
                >
                  Analyser la PR
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setPendingGhReview(false)}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {loading && (
            <p className="muted" style={{ marginTop: 12 }}>
              Lecture du diff et analyse par l&apos;IA locale…
            </p>
          )}

          <button
            type="button"
            className="btn-ghost context-advanced-toggle"
            onClick={() => setShowDiff((v) => !v)}
          >
            {showDiff ? "Masquer le diff brut" : "Voir ou coller un diff manuellement"}
          </button>

          {showDiff && (
            <div className="context-advanced">
              <p className="muted">
                Pour une review hors Git : collez un diff unified (format patch) puis lancez
                l&apos;analyse.
              </p>
              <textarea
                className="context-instruction"
                rows={8}
                value={diff}
                onChange={(e) => setDiff(e.target.value)}
                placeholder="Collez un diff ici…"
              />
              <button
                type="button"
                className="btn-secondary"
                disabled={loading || !diff.trim()}
                onClick={() => void runReview()}
              >
                Analyser ce diff
              </button>
            </div>
          )}
        </>
      )}

      {error ? (
        <p className="error-banner" role="alert" style={{ marginTop: "1rem" }}>
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="review-result">
          <h3>Résultat de la revue</h3>
          <p className="muted panel__meta">
            {result.diffStats.filesChanged} fichier(s) · +{result.diffStats.linesAdded} / −
            {result.diffStats.linesRemoved} · modèle {result.model}
          </p>
          {result.securityFindings.length > 0 ? (
            <div className="review-result__alerts">
              <h4>Alertes détectées ({result.securityFindings.length})</h4>
              <ul className="session-list">
                {result.securityFindings.map((f, i) => (
                  <li key={`${f.category}-${i}`} className="session-item">
                    <strong>[{f.severity}]</strong> {f.category}
                    {f.file ? ` — ${f.file}` : ""} : {f.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="muted">Aucune alerte sécurité automatique sur ce diff.</p>
          )}
          <pre className="review-result__body">{result.aiReview}</pre>
        </div>
      ) : null}
    </section>
  );
}
