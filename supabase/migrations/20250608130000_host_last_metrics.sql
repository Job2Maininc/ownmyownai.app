-- Dernières métriques d'inférence locale (tokens/s, latence, RAM) — pas de contenu chat
ALTER TABLE public.hosts
  ADD COLUMN IF NOT EXISTS last_metrics JSONB;
