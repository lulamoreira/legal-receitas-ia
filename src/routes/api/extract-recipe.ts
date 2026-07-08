import { createFileRoute } from "@tanstack/react-router";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import {
  SYSTEM_PROMPT,
  recipeSchema,
  sanitizeExtracted,
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
            const msg =
              parsed.error.issues[0]?.message ?? "Legenda inválida.";
            return Response.json({ error: msg }, { status: 400 });
          }

          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) {
            return Response.json(
              { error: "IA não configurada. Contate o administrador." },
              { status: 500 },
            );
          }

          const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
          const gateway = createLovableAiGatewayProvider(apiKey);
          const model = gateway("google/gemini-3-flash-preview");

          const prompt = `Extraia e organize a receita a seguir. Texto original:\n\n${parsed.data.caption}`;

          try {
            const { output } = await generateText({
              model,
              system: SYSTEM_PROMPT,
              prompt,
              output: Output.object({ schema: recipeSchema }),
            });
            const clean = sanitizeExtracted(output);
            if (
              !clean.title ||
              /não foi possível identificar/i.test(clean.title) ||
              clean.ingredients.length === 0
            ) {
              return Response.json(
                { error: "Não encontrei uma receita nesse texto. Confira se colou a legenda certa." },
                { status: 422 },
              );
            }
            return Response.json(clean);
          } catch (err) {
            if (NoObjectGeneratedError.isInstance(err)) {
              return Response.json(
                { error: "A IA não devolveu uma receita válida. Tente ajustar o texto." },
                { status: 502 },
              );
            }
            const msg = err instanceof Error ? err.message : String(err);
            const status = /429|rate/i.test(msg) ? 429 : /402|credit/i.test(msg) ? 402 : 500;
            console.error("[extract-recipe]", msg);
            return Response.json({ error: msg }, { status });
          }
        } catch (e) {
          console.error(e);
          return Response.json({ error: "Erro no servidor." }, { status: 500 });
        }
      },
    },
  },
});
