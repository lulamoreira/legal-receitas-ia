import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getClientIp, rateLimit } from "@/lib/rate-limit.server";
import {
  recipeSchema,
  sanitizeExtracted,
  SYSTEM_PROMPT,
  JSON_INSTRUCTION,
  AI_MODEL,
  RecipeExtractionError,
} from "@/lib/recipe-extraction.server";
import { enrichRecipeWithImages } from "@/lib/image-generation.server";

const HOUR_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 800 * 1024;
const AI_WEB_DEADLINE_MS = 12_000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const TRUSTED_DOMAINS = [
  "tudogostoso.com.br",
  "panelinha.com.br",
  "receitasnestle.com.br",
  "guiadacozinha.com.br",
  "receitas.globo.com",
];

const bodySchema = z.object({
  dishName: z.string().min(1).max(120),
  fridge: z.string().max(600).default(""),
  timeMinutes: z.number().int().min(1).max(600),
  people: z.number().int().min(1).max(20),
  restrictions: z.array(z.string()).max(10).default([]),
});

type SourceRef = { title: string; url: string };

function extractJson(s: string): string {
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) return s.slice(first, last + 1);
  return s.trim();
}

function extractJsonArray(s: string): string {
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const first = s.indexOf("[");
  const last = s.lastIndexOf("]");
  if (first >= 0 && last > first) return s.slice(first, last + 1);
  return s.trim();
}

async function fetchHtml(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      redirect: "follow",
    });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: false });
    let received = 0;
    let text = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if (received >= MAX_BYTES) {
        try { await reader.cancel(); } catch {}
        break;
      }
    }
    text += decoder.decode();
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function extractOgTitle(html: string): string | null {
  const m = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (m) return decodeEntities(m[1]).trim();
  const t = html.match(/<title>([\s\S]*?)<\/title>/i);
  return t ? decodeEntities(t[1]).trim() : null;
}

async function findRecipeUrlsViaAi(apiKey: string, dishName: string): Promise<string[]> {
  const domains = TRUSTED_DOMAINS.join(", ");
  const prompt = `Busque na internet e liste 3 URLs reais e acessíveis de receitas do prato "${dishName}" em qualquer um destes sites brasileiros: ${domains}. Responda APENAS com um array JSON de strings (URLs), sem texto adicional.`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        plugins: [{ id: "web" }],
        messages: [
          { role: "system", content: "Só responde JSON array de URLs, nada mais." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) return [];
    const payload = (await res.json().catch(() => null)) as
      | { choices?: Array<{ message?: { content?: string } }> } | null;
    const content = payload?.choices?.[0]?.message?.content ?? "";
    if (!content) return [];
    let arr: unknown;
    try { arr = JSON.parse(extractJsonArray(content)); } catch { return []; }
    if (!Array.isArray(arr)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const it of arr) {
      if (typeof it !== "string") continue;
      let u: URL;
      try { u = new URL(it); } catch { continue; }
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      const host = u.hostname.toLowerCase();
      if (!TRUSTED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) continue;
      const clean = u.toString();
      if (seen.has(clean)) continue;
      seen.add(clean);
      out.push(clean);
      if (out.length >= 3) break;
    }
    return out;
  } catch (e) {
    console.error("[dish-details] findRecipeUrlsViaAi", e);
    return [];
  }
}

async function fetchSourcesWithDeadline(apiKey: string, dishName: string): Promise<SourceRef[]> {
  const collected: SourceRef[] = [];
  const work = (async () => {
    const urls = await findRecipeUrlsViaAi(apiKey, dishName);
    await Promise.all(
      urls.map(async (u) => {
        const html = await fetchHtml(u);
        if (!html) return;
        const title = extractOgTitle(html);
        if (title) collected.push({ title, url: u });
      }),
    );
    return collected;
  })();
  const timeout = new Promise<SourceRef[]>((resolve) =>
    setTimeout(() => resolve(collected.slice()), AI_WEB_DEADLINE_MS),
  );
  const res = await Promise.race([work, timeout]);
  return res;
}

const extendedRecipeSchema = recipeSchema.extend({
  difficulty: z.enum(["fácil", "média", "elaborada"]).nullish(),
  nutritionPerServing: z
    .object({
      kcal: z.number().nullish(),
      proteinG: z.number().nullish(),
      carbsG: z.number().nullish(),
      fatG: z.number().nullish(),
    })
    .nullish(),
  substitutions: z
    .array(
      z.object({
        ingredient: z.string(),
        alternatives: z.array(z.string()).default([]),
      }),
    )
    .nullish(),
  drinkPairings: z.array(z.string()).nullish(),
});

const NUTRITION_INSTRUCTION = `\n\nAlém dos campos acima, INCLUA no mesmo JSON:
- "difficulty": "fácil" | "média" | "elaborada"
- "nutritionPerServing": { "kcal": int, "proteinG": int, "carbsG": int, "fatG": int } (estimativas por porção)
- "substitutions": [{ "ingredient": string, "alternatives": string[] }] (2 a 5 itens, foque nos ingredientes que a pessoa pode não ter)
- "drinkPairings": string[] (2 a 3 sugestões de bebida, SEMPRE incluindo pelo menos uma sem álcool)`;

export const Route = createFileRoute("/api/dish-details")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const ip = getClientIp(request);
          if (!rateLimit(`dish:${ip}`, 6, HOUR_MS)) {
            return Response.json(
              { error: "Xi, muitas receitas de uma vez. Espera um pouquinho." },
              { status: 429 },
            );
          }

          const body = await request.json().catch(() => null);
          const parsed = bodySchema.safeParse(body);
          if (!parsed.success) {
            return Response.json(
              { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
              { status: 400 },
            );
          }

          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) {
            return Response.json({ error: "IA não configurada." }, { status: 500 });
          }

          const { dishName, fridge, timeMinutes, people, restrictions } = parsed.data;

          // Etapa A — versões reais da internet (paralelo com a IA principal? melhor sequencial pra passar referência)
          const sources = await fetchSourcesWithDeadline(apiKey, dishName);

          // Etapa B — receita unificada
          const refText = sources.length
            ? `\n\nReferências reais encontradas na internet (use como inspiração, adaptando ao que a pessoa TEM em casa):\n${sources.map((s) => `- ${s.title} (${s.url})`).join("\n")}`
            : "";

          const userPrompt = `Prato: ${dishName}
Ingredientes que a pessoa TEM em casa: ${fridge || "(não informado, use o essencial)"}
Restrições alimentares (respeite SEM EXCEÇÃO): ${restrictions.length ? restrictions.join(", ") : "nenhuma"}
Porções desejadas: ${people}
Tempo disponível: ${timeMinutes} minutos${refText}

Monte a receita completa deste prato, no tom acolhedor da Vó (primeira pessoa, carinho e humor, sem perder objetividade). Se algum ingrediente importante faltar em casa, use algo que faça sentido ou inclua nas substitutions.`;

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
                {
                  role: "system",
                  content: `${SYSTEM_PROMPT}\n\nContexto: você é a Vó (cozinheira brasileira acolhedora). Fale em primeira pessoa nos steps, com carinho e objetividade.\n\n${JSON_INSTRUCTION}${NUTRITION_INSTRUCTION}`,
                },
                { role: "user", content: userPrompt },
              ],
            }),
          });

          if (!gatewayRes.ok) {
            const txt = await gatewayRes.text().catch(() => "");
            console.error("[dish-details] gateway", gatewayRes.status, txt);
            if (gatewayRes.status === 429)
              return Response.json({ error: "Muita gente na cozinha! Espera um instante." }, { status: 429 });
            if (gatewayRes.status === 402)
              return Response.json({ error: "Créditos de IA esgotados." }, { status: 402 });
            return Response.json({ error: "Xi, deu um nó na minha rede. Tenta de novo?" }, { status: 502 });
          }

          const payload = await gatewayRes.json();
          const content: string | undefined = payload?.choices?.[0]?.message?.content;
          if (!content) throw new RecipeExtractionError({ code: "empty", message: "Vazia", status: 502 });

          let raw: unknown;
          try { raw = JSON.parse(extractJson(content)); } catch {
            return Response.json({ error: "A vó se enrolou. Tenta de novo?" }, { status: 502 });
          }

          const validated = extendedRecipeSchema.safeParse(raw);
          if (!validated.success) {
            console.error("[dish-details] schema fail", validated.error.issues);
            return Response.json({ error: "A vó respondeu esquisito. Tenta de novo?" }, { status: 502 });
          }

          const base = sanitizeExtracted(validated.data);
          const clamp = (n: number | null | undefined, min: number, max: number, fallback = 0) => {
            const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
            return Math.max(min, Math.min(max, v));
          };
          const nutrition = validated.data.nutritionPerServing;
          const finalRecipe = {
            ...base,
            difficulty: validated.data.difficulty ?? "média",
            nutritionPerServing: {
              kcal: clamp(nutrition?.kcal, 1, 3000, 400),
              proteinG: clamp(nutrition?.proteinG, 0, 300, 15),
              carbsG: clamp(nutrition?.carbsG, 0, 300, 40),
              fatG: clamp(nutrition?.fatG, 0, 300, 15),
            },
            substitutions: (validated.data.substitutions ?? [])
              .filter((s) => s.ingredient && s.alternatives.length)
              .slice(0, 6),
            drinkPairings: (validated.data.drinkPairings ?? []).filter(Boolean).slice(0, 4),
            sourcesConsulted: sources,
          };

          // Etapa C — imagens (não-bloqueante mas com deadline interno)
          try { await enrichRecipeWithImages(finalRecipe as never, apiKey); } catch (e) {
            console.error("[dish-details] enrich", e);
          }

          return Response.json(finalRecipe);
        } catch (e) {
          console.error("[dish-details]", e);
          return Response.json({ error: "Xi, deu um nó na minha rede. Tenta de novo?" }, { status: 500 });
        }
      },
    },
  },
});
