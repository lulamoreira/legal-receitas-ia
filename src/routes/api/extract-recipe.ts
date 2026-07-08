import { createFileRoute } from "@tanstack/react-router";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { AISLES } from "@/lib/types";

const aisleEnum = z.enum(AISLES);

const ingredientSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
  note: z.string().optional(),
  emoji: z.string(),
  aisle: aisleEnum,
});

const recipeSchema = z.object({
  title: z.string(),
  description: z.string(),
  emoji: z.string(),
  servings: z.number(),
  totalMinutes: z.number(),
  tags: z.array(z.string()),
  ingredients: z.array(ingredientSchema),
  steps: z.array(z.string()),
});

const SYSTEM_PROMPT = `Você é um chef assistente que organiza receitas caóticas de redes sociais em receitas estruturadas em português do Brasil.

Regras obrigatórias:
- SEMPRE responda em português do Brasil, mesmo se o texto original estiver em inglês ou outro idioma.
- Ignore completamente hashtags (#), menções (@), autopromoção ("me segue", "link na bio", "curta", "salva esse post"), pedidos de engajamento e emojis decorativos que não sejam do prato.
- Converta frações em decimais: 1/2 = 0.5, 1/4 = 0.25, 1/3 ≈ 0.33, 3/4 = 0.75.
- Converta medidas americanas para as brasileiras:
  * cup / xícara americana → "xícara"
  * tbsp / tablespoon → "colher de sopa"
  * tsp / teaspoon → "colher de chá"
  * oz → aproxime para "g" quando for ingrediente seco/sólido
  * lb → "kg" ou "g"
  * fahrenheit em passos → converta para celsius
- Escolha UM emoji que represente o prato final (ex: 🍝, 🍰, 🥗, 🍲).
- Para CADA ingrediente escolha um emoji apropriado e classifique em UMA destas categorias (use exatamente esta grafia):
  Hortifrúti, Açougue e Peixaria, Laticínios e Ovos, Padaria, Mercearia, Congelados, Bebidas, Temperos e Condimentos, Outros.
- Gere 2 a 4 tags curtas em minúsculas (ex: "rápido", "vegetariano", "sobremesa", "jantar").
- description: uma frase curta e apetitosa (máx ~120 caracteres).
- totalMinutes: número inteiro em minutos.
- servings: número inteiro de porções (assuma 4 se não informado).
- steps: passos numerados claros, sem repetir "Passo 1:" no texto.
- Se o texto claramente não for uma receita, retorne uma receita mínima com título "Não foi possível identificar uma receita" e listas vazias.`;

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

            // Clamp/sanitize
            const clean = {
              ...output,
              servings: Math.max(1, Math.min(50, Math.round(output.servings || 4))),
              totalMinutes: Math.max(1, Math.min(1440, Math.round(output.totalMinutes || 30))),
              tags: (output.tags || []).slice(0, 4),
              ingredients: (output.ingredients || []).map((i: z.infer<typeof ingredientSchema>) => ({
                ...i,
                quantity: Number.isFinite(i.quantity) ? Math.max(0, i.quantity) : 0,
              })),
            };

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
