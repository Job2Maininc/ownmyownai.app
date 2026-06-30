# Génération média — prérequis, modèles et limites

Guide utilisateur pour la génération d'images, voix, musique et vidéo dans OwnMyOwnAI. Ce document décrit l'état **actuel (V1)** et la cible **post-V1 (P2/P3)** telle que planifiée dans [ROADMAP.md](./ROADMAP.md).

## État actuel (V1)

| Capacité | Disponible ? | Détail |
|----------|--------------|--------|
| **Analyse d'images** (vision RAG) | Oui | Modèles vision Ollama (`llava`, `moondream`, etc.) — description et indexation de `.png` / `.jpg` liés |
| **Génération d'images** | Non | Prévu P2 |
| **Synthèse vocale (TTS)** | Non | Prévu P2 |
| **Reconnaissance vocale (STT)** | Non | Prévu P2 |
| **Musique** | Non | Prévu P3 |
| **Vidéo** | Non | Prévu P3 |
| **Artefacts markdown** | Oui | Tableaux et documents texte — voir [ARTIFACTS.md](./ARTIFACTS.md) |

L'inférence reste **100 % locale via le Host** (Tauri + Ollama). Le relay et le web ne font que transporter les résultats ; aucune clé API ni fichier média n'est stocké dans Supabase.

## Architecture cible

```
Web chat  →  Relay WS  →  Host (media/mod.rs)
                              ├─ image   (ComfyUI / Flux Ollama / DALL·E cloud)
                              ├─ voice   (Piper / edge-tts / OpenAI TTS)
                              ├─ music   (MusicGen / AudioCraft)
                              └─ video   (images → FFmpeg + piste TTS)
                              ↓
                         creatives/  (PNG, MP3, WAV + .meta.json)
```

Messages WebSocket prévus : `media.generate`, `media.progress`, `media.done` (`packages/protocol`).

---

## Détection matérielle (Host)

Le Host expose `get_hardware_info` (`hardware.rs`) dans l'onglet **Modèles** :

| Champ | Usage |
|-------|--------|
| `totalRamGb` / `availableRamGb` | Compatibilité modèles chat et vision |
| `gpus[]` | Nom, VRAM estimée, type (`integrated` / `discrete`) |
| `hasDiscreteGpu` | Badge « GPU dédié » dans l'UI |
| `cpuCores` | Indication charge CPU (TTS, FFmpeg) |

**Windows** : détection GPU via WMI (`Win32_VideoController`). Sur macOS/Linux (futur), la liste GPU peut être vide — se fier à la RAM système et aux tests manuels.

Le conseiller de quantification (Q4 / Q8) s'applique aux **modèles texte** Ollama, pas encore aux pipelines média.

---

## Prérequis GPU et RAM par type de média

Les valeurs ci-dessous sont des **recommandations indicatives** pour un usage confortable en local. Un matériel inférieur peut fonctionner (plus lent, résolution réduite, ou bascule CPU).

### Image (génération)

| Option locale | VRAM minimale | RAM système | Notes |
|---------------|---------------|-------------|-------|
| **SD 1.5** (ComfyUI / A1111) | 4 Go | 8 Go | 512×512 ; qualité correcte sur GPU milieu de gamme |
| **SDXL** | 8 Go | 16 Go | 1024×1024 ; préférer GPU dédié récent |
| **Flux** (`ollama run flux` ou ComfyUI) | 12 Go | 16 Go | Meilleure fidélité ; 24 Go+ recommandé pour lots rapides |
| **Flux (CPU uniquement)** | — | 32 Go+ | Possible mais très lent (plusieurs minutes par image) |

| Option cloud | Prérequis Host | Limites typiques |
|--------------|----------------|------------------|
| **OpenAI DALL·E** | Clé API dans le keyring Host (`cloud_keys.rs`) | Quotas et tarification du compte OpenAI ; résolutions imposées par l'API |

**Sans GPU dédié** : privilégier le cloud (clé OpenAI) ou des modèles légers ; la génération locale reste possible sur iGPU Intel/AMD avec patience et résolution basse.

### Vision (analyse — déjà disponible)

| Modèle Ollama | RAM recommandée | GPU |
|---------------|-----------------|-----|
| `moondream:1.8b` | 8 Go | Optionnel |
| `llava:7b`, `bakllava:7b` | 16 Go | Recommandé |
| `llava:13b` | 24 Go | Recommandé |

La vision **ne génère pas** d'images : elle décrit et indexe des fichiers déjà présents dans le contexte lié.

### Voix — TTS / STT (P2)

| Option | GPU | RAM | Notes |
|--------|-----|-----|-------|
| **Piper TTS** | Non | 4 Go | CPU suffit ; voix offline, faible latence |
| **edge-tts** | Non | 4 Go | Nécessite connexion Microsoft ; pas de modèle local lourd |
| **Whisper.cpp (STT)** | Optionnel | 8 Go | GPU accélère les fichiers longs |
| **OpenAI TTS** | Non (cloud) | — | Qualité élevée ; facturation à l'usage |

### Musique (P3)

| Option | VRAM | RAM | Notes |
|--------|------|-----|-------|
| **MusicGen small** | 6 Go | 16 Go | Extraits courts (~30 s) |
| **MusicGen medium/large** | 12–16 Go | 32 Go | Meilleure qualité, génération plus lente |

Pas d'option cloud prévue en première itération — musique strictement locale ou reportée.

### Vidéo (P3)

| Étape | GPU | RAM | Notes |
|-------|-----|-----|-------|
| Images sources | Voir section Image | — | Slideshow à partir de frames générées |
| **FFmpeg** (assemblage) | Non | 8 Go | CPU ; dépend du nombre de frames et de la résolution |
| Piste audio TTS | Non | — | Réutilise le pipeline voix |

La vidéo cible est un **diaporama + narration**, pas de diffusion vidéo type Sora en local.

---

## Modèles recommandés et limites

### Catalogue Host (vision — V1)

Modèles listés dans `apps/runner/src/data/models.ts`, catégorie **Vision** :

| ID Ollama | Taille disque ~ | RAM ~ | Cas d'usage |
|-----------|-----------------|-------|-------------|
| `moondream:1.8b` | 1,7 Go | 8 Go | Description rapide, PC modeste |
| `llava:7b` | 4,7 Go | 16 Go | OCR simple, diagrammes |
| `bakllava:7b` | 4,7 Go | 16 Go | Vision Mistral |
| `llava:13b` | 8 Go | 24 Go | Documents scannés, analyse fine |

Compatibilité affichée dans l'UI : `compatible` / `limited` / `not_recommended` selon le rapport RAM modèle / RAM système (`hardware.rs` → `compatibility_for_ram`).

### Modèles image (cible P2)

| Backend | Modèle / tag | Résolution typique | Limite pratique |
|---------|--------------|-------------------|-----------------|
| Ollama | `flux` | 1024×1024 | Une génération à la fois ; file d'attente Host |
| ComfyUI | Workflow SDXL / Flux | Configurable | Dépend du workflow et de la VRAM |
| OpenAI | `dall-e-3` | 1024×1024, 1792×1024, etc. | Limites API + politique de contenu OpenAI |

### Contraintes système OwnMyOwnAI

| Limite | Comportement |
|--------|--------------|
| **Une inférence Ollama à la fois** | File FIFO (`chat_queue.rs`) — chat et (à terme) média partagent le même worker |
| **Stockage local** | `%LOCALAPPDATA%\OwnMyOwnAI\<data>\creatives\` — pas de quota cloud |
| **Secrets** | Clés cloud uniquement dans le keyring Host ; jamais exposées au navigateur ni au relay |
| **Taille disque** | Prévoir 1,2× la taille du modèle + espace pour les exports (PNG, WAV, MP4) |
| **Formats export** | Cible : PNG, MP3, WAV + `.meta.json` par création |

---

## Configuration prévue (P2)

Paramètres Host (`settings.json`) — jalons roadmap :

| Clé (indicative) | Description |
|------------------|-------------|
| `media.image.backend` | `ollama` \| `comfyui` \| `openai` |
| `media.image.endpoint` | URL ComfyUI ou tag Ollama (`flux`) |
| `media.voice.ttsEngine` | `piper` \| `edge-tts` \| `openai` |
| `media.voice.sttEngine` | `whisper.cpp` (fichiers audio liés) |

L'UI `MediaGalleryPanel.tsx` permettra aperçu, téléchargement et suppression dans `creatives/`.

---

## Choisir son profil matériel

| Profil | RAM | GPU | Recommandation |
|--------|-----|-----|----------------|
| **Minimal** | 8 Go | iGPU ou aucun | Vision `moondream` ; pas de génération image locale ; TTS Piper ; cloud image optionnel |
| **Standard** | 16 Go | 6–8 Go VRAM | `llava:7b` ; SD 1.5 / Flux lent ; Piper + Whisper CPU |
| **Confort** | 32 Go | 12+ Go VRAM | Flux, SDXL, MusicGen small ; file d'attente acceptable |
| **Station** | 48+ Go | 24+ Go VRAM | Flux rapide, LLaVA 13B, MusicGen medium, vidéo slideshow |

---

## Dépannage

| Symptôme | Piste |
|----------|-------|
| GPU non affiché dans l'Host | Windows uniquement pour l'instant ; vérifier pilotes ; relancer le Host |
| VRAM affichée incorrecte | WMI peut arrondir ou omettre la VRAM sur certains pilotes — se fier aux tests réels |
| OOM (out of memory) à la génération | Réduire résolution ; passer en Q4 ; fermer autres apps GPU ; utiliser un modèle plus petit |
| Génération très lente sans GPU | Normal en CPU — envisager cloud ou matériel dédié |
| File d'attente longue | Une seule génération Ollama active ; attendre la fin du chat en cours |

---

## Voir aussi

| Document | Contenu |
|----------|---------|
| [ROADMAP.md](./ROADMAP.md) | Jalons P2/P3 génération média |
| [ARTIFACTS.md](./ARTIFACTS.md) | Artefacts markdown (V1) |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Couches relay / Host / web |
| Onglet **Modèles** (Host) | RAM, GPU, conseil Q4/Q8, catalogue Ollama |
