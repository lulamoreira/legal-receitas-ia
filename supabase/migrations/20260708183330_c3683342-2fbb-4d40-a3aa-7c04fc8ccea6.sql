ALTER TABLE public.catalog_recipes ADD COLUMN IF NOT EXISTS image_url text;

CREATE TABLE IF NOT EXISTS public.ingredient_images (
  name_normalized text PRIMARY KEY,
  image_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ingredient_images TO anon;
GRANT SELECT ON public.ingredient_images TO authenticated;
GRANT ALL ON public.ingredient_images TO service_role;

ALTER TABLE public.ingredient_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ingredient images are readable by everyone"
  ON public.ingredient_images FOR SELECT TO anon, authenticated USING (true);