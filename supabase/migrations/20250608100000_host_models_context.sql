-- Host model sync + context metadata (no document content)
ALTER TABLE public.hosts
  ADD COLUMN IF NOT EXISTS installed_models JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS disk_free_gb REAL,
  ADD COLUMN IF NOT EXISTS context_summary JSONB NOT NULL DEFAULT '[]'::jsonb;
