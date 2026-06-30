# Intégration Cursor IDE

Connecter Cursor au Host OwnMyOwnAI pour l'inférence locale (0 crédit Cursor) avec RAG, mémoire et règles projet.

## Chemins d'intégration

| Chemin | URL | RAG / règles OMOA |
|--------|-----|-------------------|
| **Ollama direct** | `http://127.0.0.1:11434/v1` | Non |
| **Gateway Host** (recommandé) | `http://127.0.0.1:8765/v1` | Oui |
| **MCP serveur** (P1) | stdio `packages/omoa-mcp-server` | Contexte en complément |

## Gateway Host — configuration Cursor

1. Démarrez le Host OwnMyOwnAI (le gateway écoute sur `127.0.0.1:8765`).
2. Dans l'app Host, onglet **Cursor** — copiez le snippet JSON.
3. Dans Cursor : **Paramètres** (`Ctrl+,`) → **Cursor Settings** → **Models**.
4. Collez la clé API et l'URL de base, activez **Override OpenAI Base URL**, puis **Verify**.
5. Sélectionnez le modèle indiqué dans le snippet.

### Snippet JSON de référence

```json
{
  "overrideOpenAiBaseUrl": "http://127.0.0.1:8765/v1",
  "openAiApiKey": "omoa-local",
  "model": "qwen2.5:7b"
}
```

| Champ | Valeur | Où le coller |
|-------|--------|--------------|
| `overrideOpenAiBaseUrl` | `http://127.0.0.1:8765/v1` | **Override OpenAI Base URL** (avec `/v1`, sans slash final) |
| `openAiApiKey` | `omoa-local` | **OpenAI API Key** (valeur locale arbitraire) |
| `model` | modèle Ollama installé sur le Host | Sélecteur de modèle Cursor |

> Cursor stocke la clé API et l'URL de base dans un stockage sécurisé interne — le snippet sert de référence, pas de fichier à importer tel quel.

### Alternative Ollama direct (sans RAG)

Si le gateway Host n'est pas encore disponible :

```json
{
  "overrideOpenAiBaseUrl": "http://127.0.0.1:11434/v1",
  "openAiApiKey": "ollama",
  "model": "qwen2.5:7b"
}
```

## Dépannage

- **Verify échoue** : vérifiez qu'Ollama tourne et qu'au moins un modèle est installé sur le Host.
- **Liste de modèles vide** : tirez un modèle depuis l'onglet Modèles du Host.
- **Erreur réseau** : essayez **Cursor Settings → Network → HTTP Compatibility Mode → HTTP/1.1**.
- **Port occupé** : le gateway utilise le port `8765` par défaut (`cursorGatewayPort` dans `settings.json`).

## Voir aussi

- [ROADMAP.md](./ROADMAP.md) — jalons P0/P1 intégration Cursor
- Panneau Host `apps/runner/src/components/CursorIntegration.tsx`
