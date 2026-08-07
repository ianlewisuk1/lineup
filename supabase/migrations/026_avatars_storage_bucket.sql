-- 026_avatars_storage_bucket.sql
-- Create the `avatars` storage bucket and its RLS policies.
--
-- EditProfileModal.js uploads team avatars to storage.from('avatars'), but no
-- migration ever created the bucket. The live project had zero buckets, so
-- every upload returned:
--
--   {"statusCode":"404","error":"Bucket not found","code":"NoSuchBucket"}
--
-- storage-js surfaces that to the browser as `POST .../object/avatars/... 400`,
-- which is why the console shows a 400 rather than a 404.
--
-- The bucket is public: avatar URLs come from getPublicUrl() and are rendered
-- by UserAvatar/PlayoffBracket as plain <img src>, with no signed-URL path.
--
-- Path layout is {uid}/avatar.{ext} — the uid MUST be the first path segment,
-- because the write policies below key on (storage.foldername(name))[1].
-- The uploader previously prefixed the path with a redundant `avatars/` folder,
-- which would put the literal string 'avatars' in element 1 and fail the check;
-- that prefix is removed in the same change as this migration.

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- upsert:true in the client issues an INSERT and, when the object already
-- exists, an UPDATE. Both policies are required or a user's second upload 403s.

DROP POLICY IF EXISTS "Avatar insert own folder" ON storage.objects;
CREATE POLICY "Avatar insert own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Avatar update own folder" ON storage.objects;
CREATE POLICY "Avatar update own folder" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Avatar delete own folder" ON storage.objects;
CREATE POLICY "Avatar delete own folder" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- League members see each other's avatars, and the bucket is public, so reads
-- are open to anon as well as authenticated.
DROP POLICY IF EXISTS "Avatar public read" ON storage.objects;
CREATE POLICY "Avatar public read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

-- Verification:
--
-- SELECT id, public FROM storage.buckets WHERE id = 'avatars';
-- SELECT policyname, cmd FROM pg_policies
-- WHERE tablename = 'objects' AND policyname LIKE 'Avatar%';
