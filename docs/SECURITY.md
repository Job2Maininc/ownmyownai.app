# Sécurité OwnMyOwnAI

## Auth Supabase

### `handle_new_user`

La fonction `public.handle_new_user()` est déclenchée automatiquement par le trigger `on_auth_user_created` sur `auth.users`. Elle s'exécute en `SECURITY DEFINER`.

**Mesure appliquée** : `REVOKE EXECUTE` pour `PUBLIC`, `anon` et `authenticated`. Les clients ne peuvent plus appeler cette fonction via RPC ; seul le trigger système l'invoque.

### Protection mots de passe compromis (leaked password protection)

Supabase Auth peut refuser les mots de passe présents dans des bases de fuites (Have I Been Pwned).

**Configuration manuelle** (Dashboard Supabase → Authentication → Settings → Password Security) :

1. Activer **Leaked password protection**
2. Vérifier que la politique de complexité correspond à vos exigences

Cette option n'est pas activable via migration SQL ; documentez son état dans votre checklist de déploiement.

## `host_credentials`

La table `host_credentials` **n'a pas de politique RLS client**. C'est intentionnel :

- Les secrets device ne doivent jamais être lisibles depuis le navigateur
- Seules les Edge Functions (rôle `service_role`) y accèdent (`complete-pairing`, `runner-heartbeat`, etc.)

Ne pas ajouter de policy `SELECT` pour `authenticated`.

## Storage `host-releases`

Le bucket reste public pour le téléchargement direct du ZIP portable, mais le listing du bucket est restreint : seul l'objet `latest/OwnMyOwnAI-Host-portable-x64.zip` est lisible anonymement.

## Chat et données sensibles

- Les messages de chat ne sont **pas** stockés dans Supabase
- Le contexte RAG (documents, chunks) reste **local** sur le PC hôte

## Sources de contexte liées (Host v0.2.0)

- Les chemins liés (fichier, dossier, disque) sont configurés **uniquement** depuis l'app Host via le sélecteur natif Tauri
- Les fichiers sources ne sont **pas** recopiés : `documents.filepath` pointe vers le chemin réel (Google Drive local, etc.)
- Supprimer un lien ou un document indexé **ne supprime jamais** le fichier source sur le disque
- Le panneau web affiche le statut en lecture seule ; aucun accès direct du navigateur aux chemins locaux
- Le scan de disque entier est limité (500 fichiers, profondeur 8, exclusions dossiers système Windows)

## Relay JWT

`RELAY_JWT_SECRET` doit être identique entre Supabase Edge Functions et le worker Cloudflare Relay. Utilisez une chaîne aléatoire d'au moins 32 caractères.
