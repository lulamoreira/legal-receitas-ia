import { createFileRoute } from "@tanstack/react-router";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import {
  SYSTEM_PROMPT,
  recipeSchema,
  sanitizeExtracted,
} from "@/lib/recipe-extraction.server";

export const Route = createFileRoute("/api/extract-recipe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => null);
          const parsed = z
            .object({ caption: z.string(), sourceUrl: z.string().optional() })
            .safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Legenda inválida." }, { status: 400 });
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
            return Response.json(sanitizeExtracted(output));
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
