# Démarrage rapide — 5 minutes

OwnMyOwnAI relie votre PC Windows (Host) à une interface web pour chatter avec une IA **100 % locale**.

## Prérequis

- Windows 10/11 (64 bits)
- Compte OwnMyOwnAI (magic link par e-mail)
- ~8 Go de RAM libre pour un modèle 7B

## Étapes

### 1. Créer un compte (1 min)

1. Ouvrez [l'application web](https://ownmyownai.app) (ou votre instance Vercel).
2. Cliquez **J'ai déjà un compte** → saisissez votre e-mail.
3. Validez le lien reçu par e-mail.

### 2. Installer le Host (2 min)

1. Allez sur **Télécharger** (`/download`).
2. Téléchargez le ZIP portable Windows et lancez `OwnMyOwnAI Host.exe`.
3. Suivez l'assistant : dossier de données → choix du modèle → installation Ollama.

### 3. Lier votre PC (1 min)

1. Sur le web : **Lier un PC** (`/host/link`) → générez un code.
2. Dans le Host : entrez le code et le nom de votre PC.
3. Le Host passe en ligne ; le dashboard web affiche votre machine.

### 4. Chatter (30 s)

1. Depuis le dashboard, cliquez **Chat** sur votre PC.
2. Envoyez un premier message — l'inférence tourne sur votre machine.

### 5. (Optionnel) Connecter Cursor

1. Dans le Host : onglet **Cursor** → activez la passerelle OpenAI.
2. Copiez l'URL (`http://127.0.0.1:8765/v1`) et le **token Bearer**.
3. Dans Cursor → Settings → Models : Override OpenAI Base URL + token + modèle.

Voir [CURSOR.md](./CURSOR.md) pour les trois chemins d'intégration.

## Dépannage rapide

| Problème | Solution |
|----------|----------|
| Host « hors ligne » sur le web | Vérifiez que le Host est ouvert et connecté à Internet (heartbeat) |
| Chat ne répond pas | Onglet **État** du Host : Ollama doit être vert |
| Cursor 401 | Token incorrect — recopiez depuis l'onglet Cursor du Host |
| Passerelle inactive | Activez **Passerelle OpenAI locale** dans le Host |

## Aller plus loin

- [README](../README.md) — architecture et déploiement
- [SECURITY.md](./SECURITY.md) — passerelle Cursor, Bearer, rate limiting
- [DEPLOYMENT.md](./DEPLOYMENT.md) — variables d'environnement Vercel / Supabase
