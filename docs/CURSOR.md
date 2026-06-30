# Intégration Cursor IDE

Connecter **Cursor** au Host **OwnMyOwnAI** pour l'inférence locale (0 crédit Cursor), avec RAG, mémoire utilisateur et règles projet quand vous passez par la passerelle Host.

**Références produit :** page marketing [`/cursor`](https://ownmyownai.app/cursor) · panneau Host `CursorIntegration.tsx` · roadmap [ROADMAP.md](./ROADMAP.md).

---

## Vue d'ensemble — trois chemins

| # | Chemin | URL / transport | RAG & règles OMOA | Quand l'utiliser |
|---|--------|-----------------|-------------------|------------------|
| **1** | Ollama direct | `http://127.0.0.1:11434/v1` | Non | Démarrer en ~2 min sans configurer le Host |
| **2** | Passerelle Host (recommandé) | `http://127.0.0.1:8765/v1` | Oui — pipeline chat complet | Contexte indexé, `.cursorrules`, mémoire |
| **3** | Serveur MCP OMOA | stdio `packages/omoa-mcp-server` | Complément (outils contexte) | Agent Cursor qui lit / cherche dans vos bases |

Les chemins **1** et **2** couvrent l'**inférence** (chat, complétion). Le chemin **3** expose des **outils** (recherche RAG, lecture de fichiers) — à combiner avec 1 ou 2.

---

## Prérequis communs

- **Cursor** installé (Paramètres → Models).
- **Ollama** installé et accessible sur `127.0.0.1:11434` (seul ou via le Host).
- Au moins **un modèle** tiré (`ollama list` ou onglet **Modèles** du Host).

---

## Chemin 1 — Ollama direct

Le plus rapide : Cursor parle directement à Ollama, sans passer par le Host. Vous conservez 0 crédit cloud, mais **sans** RAG ni injection des règles Host.

### Configuration pas à pas

1. Vérifiez qu'Ollama tourne :
   ```powershell
   curl http://127.0.0.1:11434/api/tags
   ```
   Si la commande échoue, lancez Ollama ou démarrez le Host (il peut démarrer Ollama automatiquement).

2. Listez les modèles disponibles :
   ```powershell
   ollama list
   ```
   Notez un identifiant (ex. `qwen2.5:7b`, `llama3.2:3b`).

3. Dans **Cursor** : `Ctrl+,` → **Cursor Settings** → **Models**.

4. Activez **Override OpenAI Base URL** et saisissez :
   ```
   http://127.0.0.1:11434/v1
   ```
   > Incluez `/v1`, sans slash final.

5. Dans **OpenAI API Key**, saisissez une valeur arbitraire (ex. `ollama`). Ollama n'en a pas besoin, mais Cursor l'exige.

6. Cliquez **Verify**. Si la vérification réussit, sélectionnez le modèle noté à l'étape 2.

7. Testez dans le chat Cursor : une réponse locale confirme la configuration.

### Snippet de référence

```json
{
  "overrideOpenAiBaseUrl": "http://127.0.0.1:11434/v1",
  "openAiApiKey": "ollama",
  "model": "qwen2.5:7b"
}
```

> Cursor stocke clé et URL dans un coffre interne — ce JSON sert de référence, pas de fichier à importer tel quel.

---

## Chemin 2 — Passerelle Host (gateway OpenAI)

Cursor utilise l'API OpenAI-compatible exposée par le Host (`openai_gateway.rs`). Même pipeline que le chat web : RAG, règles projet (`.cursorrules` / `.ownmyownai/rules.md`), mémoire utilisateur, file d'attente partagée.

### Configuration pas à pas

1. **Installez et liez le Host** Windows (pairing compte OwnMyOwnAI).

2. **Démarrez le Host** — la passerelle écoute sur `127.0.0.1:8765` au lancement.

3. Dans le Host, ouvrez l'onglet **Cursor** (`CursorIntegration`).

4. Cochez **Passerelle OpenAI locale active** (`cursorGatewayEnabled` dans `settings.json`).

5. Copiez depuis le panneau :
   - **URL de base** — ex. `http://127.0.0.1:8765/v1`
   - **Token API (Bearer)** — ex. `omoa_a1b2c3…` (généré au pairing, stocké dans le keyring Host)

6. Dans **Cursor** → **Settings** → **Models** :
   - Activez **Override OpenAI Base URL** → collez l'URL de base.
   - **OpenAI API Key** → collez le token Bearer du Host.
   - Cliquez **Verify**, puis choisissez le **modèle par défaut** affiché dans le panneau Host.

7. *(Optionnel)* Ciblez un projet précis en ajoutant l'en-tête HTTP `X-Project-Id: <id-projet>` (via un proxy local ou configuration avancée). Sans en-tête, le Host utilise le **projet actif**.

8. Vérifiez la santé du gateway :
   ```powershell
   curl http://127.0.0.1:8765/health
   curl http://127.0.0.1:8765/v1/models
   ```

### Snippet JSON (panneau Host)

Le bouton **Copier config Cursor** génère un JSON au format Cursor Settings :

```json
{
  "openai.apiKey": "omoa_<uuid>",
  "openai.baseUrl": "http://127.0.0.1:8765/v1",
  "cursor.general.openAiKey": "omoa_<uuid>",
  "cursor.general.openAiBaseUrl": "http://127.0.0.1:8765/v1",
  "cursor.model": "qwen2.5:7b",
  "model": "qwen2.5:7b"
}
```

| Champ | Valeur | Où le coller dans Cursor |
|-------|--------|-------------------------|
| Base URL | `http://127.0.0.1:8765/v1` | **Override OpenAI Base URL** |
| API Key | token `omoa_…` du Host | **OpenAI API Key** |
| `model` / `cursor.model` | modèle par défaut Host | Sélecteur de modèle Cursor |

### Port personnalisé

Par défaut : port **8765** (`cursorGatewayPort` dans `settings.json`). Après changement, redémarrez le Host et mettez à jour l'URL dans Cursor.

---

## Chemin 3 — Serveur MCP OMOA

Expose le contexte local à l'agent Cursor via le protocole MCP : recherche FTS dans les bases indexées, lecture et listing de fichiers sandboxés. **Complément** des chemins 1 ou 2 — ne remplace pas l'inférence.

### Configuration pas à pas

1. **Liez vos dossiers** ou dépôts Git dans le Host (contexte RAG) et laissez le Host tourner au moins une fois (déchiffrement `context.db` via DPAPI Windows).

2. **Compilez le package MCP** :
   ```powershell
   npm run build --workspace=@ownmyownai/omoa-mcp-server
   ```

3. Créez ou éditez `.cursor/mcp.json` à la racine de votre workspace Cursor :

   ```json
   {
     "mcpServers": {
       "omoa": {
         "command": "node",
         "args": ["C:/chemin/vers/ownmyownai.app/packages/omoa-mcp-server/dist/index.js"],
         "env": {
           "OMOA_DATA_DIR": "C:/Users/<vous>/AppData/Local/OwnMyOwnAI"
         }
       }
     }
   }
   ```

4. Redémarrez Cursor ou rechargez les serveurs MCP (Settings → MCP).

5. Vérifiez que les outils apparaissent : `search_chunks`, `read_file`, `list_dir`.

6. Combinez avec le **chemin 1** (Ollama) ou **2** (gateway) pour inférence + outils contexte.

### Variables d'environnement MCP

| Variable | Défaut | Rôle |
|----------|--------|------|
| `OMOA_CONTEXT_DB` | `{dataDir}/context.db` | Base SQLite déchiffrée |
| `OMOA_DATA_DIR` | `%LOCALAPPDATA%\OwnMyOwnAI` | Racine données Host |
| `OMOA_CONTEXT_IDS` | toutes les KB | IDs de bases (virgules) |
| `OMOA_RAG_TOP_K` | `8` | Nombre max de chunks retournés |

Voir aussi [packages/omoa-mcp-server/README.md](../packages/omoa-mcp-server/README.md).

---

## Quel chemin choisir ?

| Critère | Ollama direct | Gateway Host | MCP |
|---------|---------------|--------------|-----|
| Temps de setup | ~2 min | Host + pairing | Config MCP + build |
| 0 crédit Cursor | Oui | Oui | — (complément) |
| RAG local | Non | Oui | Oui (outils) |
| `.cursorrules` Host | Non | Oui (injectées) | Via contexte indexé |
| Mémoire utilisateur | Non | Oui | Non |

**Recommandation :** chemin **1** pour tester tout de suite · chemin **2** pour le workflow complet · chemin **3** en plus si l'agent doit interroger vos bases depuis l'IDE.

---

## Dépannage

### Chemin 1 — Ollama direct

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| **Verify** échoue | Ollama arrêté | `ollama serve` ou démarrer le Host |
| Liste de modèles vide | Aucun modèle installé | `ollama pull qwen2.5:7b` ou tirer depuis le Host |
| Erreur réseau / timeout | Incompatibilité HTTP Cursor | Settings → Network → **HTTP Compatibility Mode** → **HTTP/1.1** |
| Modèle introuvable | Nom incorrect | Reprendre l'identifiant exact de `ollama list` |

### Chemin 2 — Passerelle Host

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| Panneau Cursor vide | PC non lié | Terminer le pairing Host |
| `Token Cursor introuvable` | Credentials incomplets | Relier le PC (génère `cursorApiToken`) |
| `curl /health` échoue | Host arrêté ou port occupé | Relancer le Host ; vérifier `cursorGatewayPort` (défaut 8765) |
| **Verify** OK mais réponses vides | Modèle absent côté Ollama | Installer le modèle par défaut Host |
| Erreur « modèle non disponible » | Modèle cloud Anthropic | Gateway : modèles `anthropic:*` non exposés — utiliser Ollama ou OpenAI cloud |
| Pas de contexte RAG | Bases non liées | Lier dossiers dans le Host, réindexer, vérifier projet actif |
| Mauvais contexte projet | Projet inactif | Activer le projet dans le Host ou envoyer `X-Project-Id` |

### Chemin 3 — MCP

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| Serveur MCP rouge dans Cursor | Chemin `dist/index.js` invalide | Rebuild `npm run build --workspace=@ownmyownai/omoa-mcp-server` |
| `search_chunks` vide | Aucune base indexée | Lier et indexer des sources dans le Host |
| Erreur lecture DB | `context.db` chiffré | Lancer le Host une fois (DPAPI déchiffre la base) |
| `read_file` refusé | Chemin hors sandbox | Fichier doit être sous une source liée au Host |
| Outils absents | MCP non rechargé | Redémarrer Cursor après édition de `mcp.json` |

### Diagnostic rapide (tous chemins)

```powershell
# Ollama
curl http://127.0.0.1:11434/api/tags

# Gateway Host
curl http://127.0.0.1:8765/health
curl http://127.0.0.1:8765/v1/models
```

---

## Voir aussi

- [ROADMAP.md](./ROADMAP.md) — jalons P0/P1/P2 intégration Cursor
- [packages/omoa-mcp-server/README.md](../packages/omoa-mcp-server/README.md) — outils MCP et variables d'env
- `apps/runner/src/components/CursorIntegration.tsx` — UI Host
- `apps/runner/src-tauri/src/openai_gateway.rs` — implémentation gateway
