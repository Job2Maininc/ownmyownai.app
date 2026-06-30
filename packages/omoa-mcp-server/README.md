# @ownmyownai/omoa-mcp-server

Serveur MCP stdio pour exposer le contexte OwnMyOwnAI à **Cursor** (chemin 3 de la roadmap) : recherche RAG, lecture et listing de fichiers sous les sources liées.

## Outils exposés

| Outil | Description |
|-------|-------------|
| `search_chunks` | Recherche FTS5 dans `chunks_fts` (même logique que le Host) |
| `read_file` | Lecture paginée d'un fichier texte (sandbox) |
| `list_dir` | Listing d'un dossier (sandbox) |

## Variables d'environnement

| Variable | Défaut | Rôle |
|----------|--------|------|
| `OMOA_CONTEXT_DB` | `{dataDir}/context.db` | Chemin vers la base SQLite déchiffrée |
| `OMOA_DATA_DIR` | `settings.json` ou `%LOCALAPPDATA%\OwnMyOwnAI` | Racine données Host |
| `OMOA_CONTEXT_IDS` | toutes les KB | IDs de bases de contexte (séparés par virgule) |
| `OMOA_RAG_TOP_K` | `settings.json` ou `8` | Nombre max de chunks retournés |

> Le Host doit avoir tourné au moins une fois pour déchiffrer `context.db` (DPAPI Windows).

## Configuration Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "omoa": {
      "command": "node",
      "args": ["F:/code/code/ownmyownai.app/packages/omoa-mcp-server/dist/index.js"]
    }
  }
}
```

Depuis le monorepo après build :

```bash
npm run build --workspace=@ownmyownai/omoa-mcp-server
```

## Développement

```bash
npm install
npm run build --workspace=@ownmyownai/omoa-mcp-server
npm test --workspace=@ownmyownai/omoa-mcp-server
```
