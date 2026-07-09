
CREATE TABLE public.user_taste_profile (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  restrictions TEXT[] NOT NULL DEFAULT '{}',
  liked_dishes JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_taste_profile TO authenticated;
GRANT ALL ON public.user_taste_profile TO service_role;

ALTER TABLE public.user_taste_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own taste profile"
  ON public.user_taste_profile FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own taste profile"
  ON public.user_taste_profile FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own taste profile"
  ON public.user_taste_profile FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own taste profile"
  ON public.user_taste_profile FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
