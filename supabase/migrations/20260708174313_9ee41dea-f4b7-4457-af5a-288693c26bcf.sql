
CREATE TABLE public.catalog_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  emoji text,
  servings int NOT NULL DEFAULT 4,
  total_minutes int NOT NULL DEFAULT 30,
  tags text[] NOT NULL DEFAULT '{}',
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  steps text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.catalog_recipes TO anon;
GRANT SELECT ON public.catalog_recipes TO authenticated;
GRANT ALL ON public.catalog_recipes TO service_role;

ALTER TABLE public.catalog_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Catalog recipes are readable by everyone"
  ON public.catalog_recipes
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX catalog_recipes_created_at_idx ON public.catalog_recipes (created_at DESC);
