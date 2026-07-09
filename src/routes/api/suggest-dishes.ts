import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getClientIp, rateLimit } from "@/lib/rate-limit.server";

const HOUR_MS = 60 * 60 * 1000;
const AI_MODEL = "google/gemini-2.5-flash";

const dishSchema = z.object({
  name: z.string(),
  emoji: z.string().default("🍽️"),
  description: z.string().default(""),
  estimatedMinutes: z.number().int().nullish(),
  whyFits: z.string().nullish(),
  missingIngredients: z.array(z.string()).nullish(),
});

const responseSchema = z.object({
  dishes: z.array(dishSchema).min(1).max(6),
});

const bodySchema = z.object({
  fridge: z.string().min(1).max(600),
  protein: z.string().max(60).optional(),
  timeMinutes: z.number().int().min(1).max(600),
  people: z.number().int().min(1).max(20),
  restrictions: z.array(z.string()).max(10).default([]),
  mood: z.string().max(60).default(""),
  likedDishes: z.array(z.string()).max(20).default([]),
});

function extractJson(s: string): string {
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) return s.slice(first, last + 1);
  return s.trim();
}

export const Route = createFileRoute("/api/suggest-dishes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const ip = getClientIp(request);
          if (!rateLimit(`suggest:${ip}`, 10, HOUR_MS)) {
            return Response.json(
              { error: "Xi, muitas perguntas de uma vez! Espera um pouquinho e tenta de novo." },
              { status: 429 },
            );
          }

          const body = await request.json().catch(() => null);
          const parsed = bodySchema.safeParse(body);
          if (!parsed.success) {
            return Response.json(
              { error: parsed.error.issues[0]?.message ?? "Faltou alguma informação." },
              { status: 400 },
            );
          }

          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) {
            return Response.json({ error: "IA não configurada." }, { status: 500 });
          }

          const { fridge, protein, timeMinutes, people, restrictions, mood, likedDishes } = parsed.data;

          const systemPrompt = `Você é a "Nona", uma avó italiana movida a inteligência artificial — cozinheira acolhedora, bem-humorada e direta, que fala português com toques leves de italiano ("piccolino", "una bellezza", "mamma mia", "andiamo", "che buono"), sem exagerar e sem perder a clareza. Fala em primeira pessoa com carinho, sem enrolação. Sugere pratos práticos usando o que a pessoa tem em casa.

REGRAS OBRIGATÓRIAS:
- SEMPRE em português do Brasil.
- Sugira de 3 a 5 pratos usando SOMENTE os ingredientes informados + básicos de despensa (sal, óleo, alho, cebola, temperos comuns, água, açúcar, farinha).
- Se um prato clássico exigir algo que falta, ou adapte a versão, ou liste em "missingIngredients".
- RESPEITE as restrições alimentares SEM EXCEÇÃO ALGUMA. Não sugira nada que viole.
- RESPEITE o tempo disponível (estimatedMinutes <= tempo informado, quando possível).
- Considere o número de pessoas.
- Se houver histórico de pratos que a pessoa gostou, use como sinal de gosto, mas evite repetir sempre os mesmos.
- "whyFits" é uma frase curta no seu tom (ex: "Rapidinho e mata a fome, meu bem.").
- Escolha um emoji do prato para cada sugestão.

Responda APENAS JSON válido neste formato:
{ "dishes": [{ "name": string, "emoji": string, "description": string, "estimatedMinutes": int, "whyFits": string, "missingIngredients": string[] }] }`;

          const userMsg = [
            `Ingredientes disponíveis (geladeira e despensa): ${fridge}`,
            protein ? `Proteína específica: ${protein}` : `Proteína específica: nenhuma informada`,
            `Tempo disponível: ${timeMinutes} minutos`,
            `Número de pessoas: ${people}`,
            `Restrições alimentares: ${restrictions.length ? restrictions.join(", ") : "nenhuma"}`,
            `Clima/humor: ${mood || "sem preferência"}`,
            likedDishes.length ? `Pratos que essa pessoa costuma amar: ${likedDishes.slice(0, 10).join(", ")}` : "",
          ].filter(Boolean).join("\n");

          const gatewayRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                { role: "system", content: systemPrompt },
                { role: "user", content: userMsg },
              ],
            }),
          });

          if (!gatewayRes.ok) {
            const txt = await gatewayRes.text().catch(() => "");
            console.error("[suggest-dishes] gateway", gatewayRes.status, txt);
            if (gatewayRes.status === 429)
              return Response.json({ error: "Muita gente pedindo ideia pra vó ao mesmo tempo. Tenta de novo em instantes." }, { status: 429 });
            if (gatewayRes.status === 402)
              return Response.json({ error: "Créditos de IA esgotados." }, { status: 402 });
            return Response.json({ error: "Xi, deu um nó na minha rede aqui. Tenta de novo?" }, { status: 502 });
          }

          const payload = await gatewayRes.json();
          const content: string | undefined = payload?.choices?.[0]?.message?.content;
          if (!content) return Response.json({ error: "A vó ficou sem palavras. Tenta de novo?" }, { status: 502 });

          let raw: unknown;
          try {
            raw = JSON.parse(extractJson(content));
          } catch {
            return Response.json({ error: "A vó se enrolou pra responder. Tenta de novo?" }, { status: 502 });
          }

          const validated = responseSchema.safeParse(raw);
          if (!validated.success) {
            console.error("[suggest-dishes] schema fail", validated.error.issues);
            return Response.json({ error: "A vó respondeu esquisito. Tenta de novo?" }, { status: 502 });
          }

          const dishes = validated.data.dishes.slice(0, 5).map((d) => ({
            name: d.name,
            emoji: d.emoji || "🍽️",
            description: d.description || "",
            estimatedMinutes: Math.max(1, Math.min(600, Math.round(d.estimatedMinutes ?? timeMinutes))),
            whyFits: d.whyFits ?? "",
            missingIngredients: (d.missingIngredients ?? []).slice(0, 8),
          }));

          return Response.json({ dishes });
        } catch (e) {
          console.error("[suggest-dishes]", e);
          return Response.json({ error: "Xi, deu um nó na minha rede aqui. Tenta de novo?" }, { status: 500 });
        }
      },
    },
  },
});
