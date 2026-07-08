import { createFileRoute } from "@tanstack/react-router";
import {
  generateRecipeImage,
  getOrCreateIngredientImage,
} from "@/lib/image-generation.server";

// Endpoint temporário — protegido por token fixo. Remover após uso.
const TOKEN = "cvo-backfill-2026-07-08";

type Row = {
  id: string;
  title: string;
  description: string | null;
  ingredients: unknown;
};

export const Route = createFileRoute("/api/public/backfill-images")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("token") !== TOKEN) {
          return new Response("forbidden", { status: 403 });
        }
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return Response.json({ error: "no api key" }, { status: 500 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: rows, error } = await supabaseAdmin
          .from("catalog_recipes")
          .select("id, title, description, ingredients")
          .is("image_url", null);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const results: Array<{ id: string; imageUrl: string | null; ingredientCount: number }> = [];
        for (const row of (rows ?? []) as Row[]) {
          const recipeUrl = await generateRecipeImage(row.title, row.description ?? "", apiKey);
          if (recipeUrl) {
            await supabaseAdmin
              .from("catalog_recipes")
              .update({ image_url: recipeUrl })
              .eq("id", row.id);
          }
          const ings = Array.isArray(row.ingredients) ? row.ingredients : [];
          const names = ings
            .map((i) => (i && typeof i === "object" ? String((i as { name?: unknown }).name ?? "") : ""))
            .filter(Boolean);
          await Promise.allSettled(
            names.map((n) => getOrCreateIngredientImage(n, apiKey)),
          );
          results.push({ id: row.id, imageUrl: recipeUrl, ingredientCount: names.length });
        }

        return Response.json({ processed: results.length, results });
      },
    },
  },
});
