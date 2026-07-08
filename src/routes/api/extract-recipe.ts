import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  extractRecipeFromText,
  RecipeExtractionError,
} from "@/lib/recipe-extraction.server";
import { getClientIp, rateLimit } from "@/lib/rate-limit.server";

const HOUR_MS = 60 * 60 * 1000;

export const Route = createFileRoute("/api/extract-recipe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const ip = getClientIp(request);
          if (!rateLimit(`text:${ip}`, 10, HOUR_MS)) {
            return Response.json(
              { error: "Muitas requisições. Tente novamente mais tarde." },
              { status: 429 },
            );
          }

          const body = await request.json().catch(() => null);
          const parsed = z
            .object({
              caption: z
                .string()
                .max(8000, "Legenda muito longa (máx. 8000 caracteres)."),
              sourceUrl: z.string().optional(),
            })
            .safeParse(body);
          if (!parsed.success) {
            const msg = parsed.error.issues[0]?.message ?? "Legenda inválida.";
            return Response.json({ error: msg }, { status: 400 });
          }

          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) {
            return Response.json(
              { error: "IA não configurada. Contate o administrador." },
              { status: 500 },
            );
          }

          try {
            const clean = await extractRecipeFromText(
              `Extraia e organize a receita a seguir. Texto original:\n\n${parsed.data.caption}`,
              apiKey,
            );
            if (
              !clean.title ||
              /não foi possível identificar/i.test(clean.title) ||
              clean.ingredients.length === 0
            ) {
              return Response.json(
                {
                  error:
                    "Não encontrei uma receita nesse texto. Confira se colou a legenda certa.",
                },
                { status: 422 },
              );
            }
            return Response.json(clean);
          } catch (err) {
            if (err instanceof RecipeExtractionError) {
              console.error("[extract-recipe]", err.code, err.message, err.detail);
              const message =
                err.code === "not_recipe"
                  ? "Não encontrei uma receita nesse texto. Confira se colou a legenda certa."
                  : err.code === "invalid_json" || err.code === "empty" || err.code === "gateway"
                    ? "A IA não devolveu uma receita válida. Tente ajustar o texto."
                    : err.message;
              return Response.json({ error: message }, { status: err.status });
            }
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[extract-recipe]", msg);
            return Response.json({ error: msg }, { status: 500 });
          }
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Erro no servidor." }, { status: 500 });
        }
      },
    },
  },
});
