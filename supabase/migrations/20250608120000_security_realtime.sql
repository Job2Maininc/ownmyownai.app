-- Sécurité : empêcher l'appel direct de handle_new_user (le trigger auth reste actif)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- Realtime : publier les changements sur hosts pour le dashboard web
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'hosts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hosts;
  END IF;
END $$;

-- Storage host-releases : lecture directe du ZIP latest uniquement (pas de listing bucket)
DROP POLICY IF EXISTS "Public read host releases" ON storage.objects;
CREATE POLICY "Public read latest host release zip"
ON storage.objects FOR SELECT
TO public
USING (
  bucket_id = 'host-releases'
  AND name = 'latest/OwnMyOwnAI-Host-portable-x64.zip'
);
