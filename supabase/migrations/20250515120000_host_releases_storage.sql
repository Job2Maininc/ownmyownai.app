-- Bucket public pour héberger le ZIP portable du host (téléchargement direct depuis le site)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'host-releases',
  'host-releases',
  true,
  524288000,
  ARRAY['application/zip', 'application/octet-stream', 'application/x-zip-compressed']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read host releases" ON storage.objects;
CREATE POLICY "Public read host releases"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'host-releases');
