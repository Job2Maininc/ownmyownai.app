-- Progression d'indexation contexte (heartbeat Host) — n'affecte pas le statut online/busy.
ALTER TABLE public.hosts
  ADD COLUMN IF NOT EXISTS indexing_progress JSONB;
