import { z } from "zod";
import { AISLES } from "./types";

const aisleEnum = z.enum(AISLES);

export const ingredientSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
  note: z.string().nullish(),
  emoji: z.string(),
  aisle: z.string(),
});


export const recipeSchema = z.object({
  title: z.string(),
  description: z.string(),
  emoji: z.string(),
  servings: z.number(),
  totalMinutes: z.number(),
  tags: z.array(z.string()),
  ingredients: z.array(ingredientSchema),
  steps: z.array(z.string()),
});

export type Ingr = z.infer<typeof ingredientSchema>;

export const SYSTEM_PROMPT = `Você é um chef assistente que organiza receitas caóticas de redes sociais em receitas estruturadas em português do Brasil.

Regras obrigatórias:
- SEMPRE responda em português do Brasil, mesmo se o texto original estiver em inglês ou outro idioma.
- Ignore hashtags (#), menções (@), autopromoção ("me segue", "link na bio", "curta", "salva esse post") e emojis decorativos que não sejam do prato.
- Converta frações em decimais: 1/2 = 0.5, 1/4 = 0.25, 1/3 ≈ 0.33, 3/4 = 0.75.
- Converta medidas americanas para as brasileiras:
  * cup / xícara americana → "xícara"
  * tbsp / tablespoon → "colher de sopa"
  * tsp / teaspoon → "colher de chá"
  * oz → aproxime para "g" quando for ingrediente seco/sólido
  * lb → "kg" ou "g"
- Escolha UM emoji que represente o prato final (ex: 🍝, 🍰, 🥗, 🍲).
- Para CADA ingrediente escolha um emoji apropriado e classifique em UMA destas categorias (use exatamente esta grafia):
  Hortifrúti, Açougue e Peixaria, Laticínios e Ovos, Padaria, Mercearia, Congelados, Bebidas, Temperos e Condimentos, Outros.
- Gere 2 a 4 tags curtas em minúsculas (ex: "rápido", "vegetariano", "sobremesa", "jantar").
- description: uma frase curta e apetitosa (máx ~120 caracteres).
- totalMinutes: número inteiro em minutos.
- servings: número inteiro de porções (assuma 4 se não informado).
- steps: passos numerados claros, sem repetir "Passo 1:" no texto.
- Se o conteúdo claramente NÃO for uma receita de comida, retorne title = "Não foi possível identificar uma receita", ingredients = [] e steps = [].`;

export const VIDEO_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

Contexto: você recebeu um VÍDEO curto de receita.
- TRANSCREVA o que é falado (áudio) e considere as legendas/textos que aparecem na tela.
- OBSERVE os ingredientes mostrados e as etapas visuais (o que é adicionado, misturado, cozido).
- Combine áudio + imagem + texto na tela para reconstruir a receita mais completa possível.
- Se algum ingrediente aparecer sem quantidade explícita, estime uma quantidade razoável e coloque um note tipo "a gosto" ou "aprox.".`;

const jsonSchemaText = `{
  "title": string,
  "description": string,
  "emoji": string,
  "servings": integer,
  "totalMinutes": integer,
  "tags": string[],
  "ingredients": [{ "name": string, "quantity": number, "unit": string, "note": string|null, "emoji": string, "aisle": "Hortifrúti"|"Açougue e Peixaria"|"Laticínios e Ovos"|"Padaria"|"Mercearia"|"Congelados"|"Bebidas"|"Temperos e Condimentos"|"Outros" }],
  "steps": string[]
}`;

export const JSON_INSTRUCTION = `Responda APENAS com JSON válido (nada além de JSON) neste formato exato:\n${jsonSchemaText}`;

export function sanitizeExtracted(output: z.infer<typeof recipeSchema>) {
  const validAisles = AISLES as readonly string[];
  return {
    ...output,
    servings: Math.max(1, Math.min(50, Math.round(output.servings || 4))),
    totalMinutes: Math.max(1, Math.min(1440, Math.round(output.totalMinutes || 30))),
    tags: (output.tags || []).slice(0, 4),
    ingredients: (output.ingredients || []).map((i) => ({
      ...i,
      quantity: Number.isFinite(i.quantity) ? Math.max(0, i.quantity) : 0,
      aisle: (validAisles.includes(i.aisle) ? i.aisle : "Outros") as (typeof AISLES)[number],
      note: i.note ?? undefined,
    })),
  };
}


export const AI_MODEL = "google/gemini-2.5-flash";

function extractJson(s: string): string {
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) return s.slice(first, last + 1);
  return s.trim();
}

export type ExtractError = {
  code: "rate_limit" | "credits" | "gateway" | "empty" | "invalid_json" | "not_recipe";
  message: string;
  status: number;
  detail?: unknown;
};

export class RecipeExtractionError extends Error {
  code: ExtractError["code"];
  status: number;
  detail?: unknown;
  constructor(e: ExtractError) {
    super(e.message);
    this.code = e.code;
    this.status = e.status;
    this.detail = e.detail;
  }
}

export async function extractRecipeFromText(text: string, apiKey: string) {
  const gatewayRes = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "raw",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${SYSTEM_PROMPT}\n\n${JSON_INSTRUCTION}` },
          { role: "user", content: text },
        ],
      }),
    },
  );

  if (!gatewayRes.ok) {
    const txt = await gatewayRes.text().catch(() => "");
    console.error("[extractRecipeFromText] gateway", gatewayRes.status, txt);
    if (gatewayRes.status === 429)
      throw new RecipeExtractionError({
        code: "rate_limit",
        message: "Muitas requisições. Tente novamente em instantes.",
        status: 429,
      });
    if (gatewayRes.status === 402)
      throw new RecipeExtractionError({
        code: "credits",
        message: "Créditos de IA esgotados.",
        status: 402,
      });
    throw new RecipeExtractionError({
      code: "gateway",
      message: "A IA não conseguiu processar a receita.",
      status: 502,
      detail: txt,
    });
  }

  const payload = await gatewayRes.json();
  const content: string | undefined = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new RecipeExtractionError({
      code: "empty",
      message: "Resposta vazia da IA.",
      status: 502,
    });
  }

  const jsonText = extractJson(content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    console.error("[extractRecipeFromText] invalid JSON", content.slice(0, 500));
    throw new RecipeExtractionError({
      code: "invalid_json",
      message: "A IA não devolveu um JSON válido. Tente novamente.",
      status: 502,
    });
  }

  const validated = recipeSchema.safeParse(parsed);
  if (!validated.success) {
    console.error("[extractRecipeFromText] schema fail", validated.error.issues);
    throw new RecipeExtractionError({
      code: "not_recipe",
      message: "Não consegui identificar uma receita.",
      status: 422,
    });
  }

  return sanitizeExtracted(validated.data);
}

