# Roadmap post-V1

## Modèles cloud (hors scope V1)

Les modèles hébergés (OpenAI, Anthropic, etc.) ne sont **pas** implémentés en V1. Architecture prévue :

- Le runner reste le point d'exécution pour Ollama local
- Une future couche « provider » pourrait router vers des API cloud avec clés utilisateur stockées localement (keyring)
- Le relay ne transporterait jamais les clés API vers le cloud OwnMyOwnAI

**Statut** : documenté uniquement — aucune implémentation avant validation produit.

## Fonctionnalités minimales livrées (P4)

| Fonctionnalité | Statut |
|----------------|--------|
| Multi-session (`allowMultiSession` dans `settings.json`) | Feature flag runner |
| Historique conversations | Métadonnées locales (`localStorage`) côté web |
| RAG amélioré | Chunking ~tokens + `ragTopK` / `ragChunkTokens` dans settings |
| DOCX | Non supporté — message d'erreur explicite |

## Pistes futures

- Historique complet runner (SQLite optionnel)
- Extraction PDF robuste (crate dédiée ou OCR)
- Tests E2E pairing avec mock Supabase
- Session partagée multi-onglets (Web Locks API)
