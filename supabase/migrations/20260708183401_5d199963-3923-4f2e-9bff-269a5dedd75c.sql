CREATE POLICY "Public read of generated-images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'generated-images');