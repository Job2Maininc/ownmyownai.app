# Roadmap post-V1

## Modèles cloud (optionnels)

OpenAI et Anthropic sont **optionnels** — routage depuis le Host uniquement :

- Clés API stockées en keyring Host (`cloud_keys.rs`), repli fichier local chiffré DPAPI si keyring indisponible
- Modèles préfixés `openai:` / `anthropic:` ; activation par fournisseur dans `settings.json`
- Le relay transporte le chat mais **jamais** les clés API vers le cloud OwnMyOwnAI
- Commandes Tauri : `get_cloud_providers_status`, `save_cloud_provider_key`, `delete_cloud_provider_key`

**Statut** : implémenté côté Host (v0.3).

## Fonctionnalités minimales livrées (P4)

| Fonctionnalité | Statut |
|----------------|--------|
| Sessions simultanées + file d'attente FIFO (`chat_queue.rs`) | Toujours actif — plusieurs PC/onglets, une génération Ollama à la fois |
| Routage multi-modèle par tâche (`modelRouting` dans `settings.json`) | Petit modèle résumé, gros rédaction — intent + fallback |
| Historique conversations | Host SQLite + sync WS ; métadonnées locales en secours |
| Branches de conversation | Fork depuis message N ; arbre local (Host + localStorage) |
| RAG amélioré | Chunking ~tokens + `ragTopK` / `ragChunkTokens` dans settings |
| DOCX | Non supporté — message d'erreur explicite |

## Pistes futures

- MCP servers côté Host (`mcp.*` WS + builtin filesystem + serveurs externes via stdio) — implémenté v0.3
- Terminal intégré (allowlist Host + streaming WS `terminal.*`) — implémenté v0.3
- Historique complet runner (SQLite optionnel)
- Extraction PDF robuste (crate dédiée ou OCR)
- Tests E2E pairing avec mock Supabase
- ~~Session partagée multi-onglets (Web Locks API)~~ — remplacé par file d'attente Host + onglets indépendants
