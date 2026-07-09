import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getClientIp, rateLimit } from "@/lib/rate-limit.server";

const HOUR_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 800 * 1024;
const AI_SITE_DEADLINE_MS = 12_000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

type Source =
  | "TudoGostoso"
  | "Guia da Cozinha"
  | "Fritadeira Sem Óleo"
  | "Panelinha"
  | "Receitas Nestlé"
  | "Receitas Globo";

type Result = {
  title: string;
  url: string;
  thumbnailUrl: string | null;
  source: Source;
};

async function fetchHtml(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      redirect: "follow",
    });
    console.error(`[search-recipes] fetchHtml ${url} -> status ${res.status}`);
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
        try {
          await reader.cancel();
        } catch {}
        break;
      }
    }
    text += decoder.decode();
    console.error(`[search-recipes] fetchHtml ${url} -> ${received} bytes`);
    return text;
  } catch (e) {
    console.error(`[search-recipes] fetchHtml ${url} -> error`, e);
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

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function absUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function parseTudoGostoso(html: string, ingredient: string): Result[] {
  const base = "https://www.tudogostoso.com.br";
  const out: Result[] = [];
  const seen = new Set<string>();
  const anchorRe = /<a\b[^>]*href=["']([^"']*\/receita\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html))) {
    const href = m[1];
    const inner = m[2];
    const anchorStart = m.index;
    const url = absUrl(href, base);
    if (!url) continue;
    if (seen.has(url)) continue;
    let thumb: string | null = null;
    const windowStart = Math.max(0, anchorStart - 1500);
    const before = html.slice(windowStart, anchorStart);
    const imgRe = /<img\b[^>]*?(?:src|data-src)=["']([^"']+)["'][^>]*>/gi;
    let imgMatch: RegExpExecArray | null;
    let lastSrc: string | null = null;
    while ((imgMatch = imgRe.exec(before))) {
      const src = imgMatch[1];
      if (/145-110/.test(src) && !/40x40/.test(src)) {
        lastSrc = src;
      }
    }
    if (lastSrc) thumb = lastSrc;

    let title = stripTags(inner);
    if (!title) {
      const altMatch = inner.match(/alt=["']([^"']+)["']/i);
      if (altMatch) title = altMatch[1];
    }
    if (!title || title.length < 3) continue;
    seen.add(url);
    out.push({ title, url, thumbnailUrl: thumb, source: "TudoGostoso" });
  }

  const needle = normalize(ingredient);
  return out.filter((r) => normalize(r.title).includes(needle));
}

function parseGuiaDaCozinha(html: string, ingredient: string): Result[] {
  const base = "https://guiadacozinha.com.br";
  const out: Result[] = [];
  const seen = new Set<string>();
  const anchorRe = /<a\b[^>]*href=["']([^"']*guiadacozinha\.com\.br\/receitas\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let matchCount = 0;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html))) {
    matchCount++;
    const href = m[1];
    const inner = m[2];
    const attrs = m[0];
    const url = absUrl(href, base);
    if (!url) continue;
    if (seen.has(url)) continue;
    if (!/\/receitas\//.test(new URL(url).pathname)) continue;

    let thumb: string | null = null;
    const imgMatch = inner.match(/<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["'][^>]*>/i);
    if (imgMatch) thumb = imgMatch[1];

    let title = stripTags(inner);
    if (!title) {
      const aria = attrs.match(/aria-label=["']([^"']+)["']/i);
      if (aria) title = aria[1];
    }
    if (!title || title.length < 3) continue;
    seen.add(url);
    out.push({ title, url, thumbnailUrl: thumb, source: "Guia da Cozinha" });
  }
  console.error(
    `[search-recipes] guiadacozinha html=${html.length} bytes, anchor matches=${matchCount}, pre-filter results=${out.length}`,
  );
  const needle = normalize(ingredient);
  return out.filter((r) => normalize(r.title).includes(needle));
}

function parseFritadeiraSemOleo(html: string, ingredient: string): Result[] {
  const base = "https://www.fritadeirasemoleo.com.br";
  const out: Result[] = [];
  const seen = new Set<string>();
  // <h3> ... <a href='...'>Título</a> ... </h3>  (Blogger usa aspas simples)
  const h3Re = /<h3\b[^>]*>([\s\S]*?)<\/h3>/gi;
  let h3m: RegExpExecArray | null;
  while ((h3m = h3Re.exec(html))) {
    const inner = h3m[1];
    const aRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let am: RegExpExecArray | null;
    while ((am = aRe.exec(inner))) {
      const href = am[1];
      const label = am[2];
      const abs = absUrl(href, base);
      if (!abs) continue;
      let host: string;
      try {
        host = new URL(abs).hostname.toLowerCase();
      } catch {
        continue;
      }
      if (host !== "www.fritadeirasemoleo.com.br" && host !== "fritadeirasemoleo.com.br") {
        continue;
      }
      if (seen.has(abs)) continue;
      const title = stripTags(label);
      if (!title || title.length < 3) continue;
      seen.add(abs);
      out.push({
        title,
        url: abs,
        thumbnailUrl: null,
        source: "Fritadeira Sem Óleo",
      });
    }
  }
  const needle = normalize(ingredient);
  return out.filter((r) => normalize(r.title).includes(needle));
}

/* ============================================================
 * IA + Web Search para sites com busca renderizada no JS
 * ============================================================ */

function extractJson(s: string): string {
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const first = s.indexOf("[");
  const last = s.lastIndexOf("]");
  if (first >= 0 && last > first) return s.slice(first, last + 1);
  return s.trim();
}

/**
 * Usa o Lovable AI Gateway com o plugin `web` (grounding via web search do OpenRouter,
 * confirmado na doc: https://openrouter.ai/docs/guides/features/plugins/web-search)
 * para descobrir URLs reais de receitas em um domínio específico.
 */
async function findRecipeUrlsViaAi(
  apiKey: string,
  domain: string,
  ingredient: string,
  minResults = 3,
): Promise<string[]> {
  const prompt = `Busque na internet e liste pelo menos ${minResults} URLs reais e acessíveis de receitas no site ${domain} que tenham ${ingredient} como ingrediente principal. Responda APENAS com um array JSON de strings (URLs), sem texto adicional, sem comentários, sem markdown.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      plugins: [{ id: "web" }],
      messages: [
        {
          role: "system",
          content:
            "Você recebe pedidos de descoberta de receitas em domínios específicos. Só responde JSON array de URLs, nada mais.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    console.error(
      `[search-recipes] ai web-search ${domain} -> status ${res.status}`,
    );
    return [];
  }
  const payload = (await res.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string } }> }
    | null;
  const content = payload?.choices?.[0]?.message?.content ?? "";
  if (!content) {
    console.error(`[search-recipes] ai ${domain} -> empty content`);
    return [];
  }

  let arr: unknown;
  try {
    arr = JSON.parse(extractJson(content));
  } catch {
    console.error(
      `[search-recipes] ai json parse failed for ${domain}. content preview: ${content.slice(0, 300)}`,
    );
    return [];
  }
  if (!Array.isArray(arr)) {
    console.error(
      `[search-recipes] ai ${domain} -> parsed but not array (type=${typeof arr})`,
    );
    return [];
  }

  const rawCount = arr.length;
  const rejected: string[] = [];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    if (typeof item !== "string") {
      rejected.push(`non-string:${typeof item}`);
      continue;
    }
    let u: URL;
    try {
      u = new URL(item);
    } catch {
      rejected.push(`invalid-url:${item.slice(0, 80)}`);
      continue;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      rejected.push(`bad-protocol:${u.protocol}`);
      continue;
    }
    const host = u.hostname.toLowerCase();
    // Validação de domínio: hostname deve terminar exatamente em `domain`
    if (host !== domain && !host.endsWith(`.${domain}`)) {
      rejected.push(`host-mismatch:${host}`);
      continue;
    }
    const clean = u.toString();
    if (seen.has(clean)) {
      rejected.push(`duplicate:${host}`);
      continue;
    }
    seen.add(clean);
    urls.push(clean);
  }
  console.error(
    `[search-recipes] ai ${domain} -> raw=${rawCount}, accepted=${urls.length}, rejected=${rejected.length} [${rejected.slice(0, 5).join(" | ")}]`,
  );
  return urls;
}

/* ============================================================
 * Preview leve: título + miniatura de uma página de receita
 * ============================================================ */

type UnknownRec = Record<string, unknown>;

function findRecipeNode(node: unknown): UnknownRec | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof node === "object") {
    const obj = node as UnknownRec;
    const t = obj["@type"];
    const types = Array.isArray(t) ? t : t ? [t] : [];
    if (types.some((x) => String(x).toLowerCase() === "recipe")) return obj;
    const graph = obj["@graph"];
    if (graph) {
      const found = findRecipeNode(graph);
      if (found) return found;
    }
  }
  return null;
}

function pickImageFromJsonLd(imageField: unknown): string | null {
  if (!imageField) return null;
  if (typeof imageField === "string") return imageField;
  if (Array.isArray(imageField)) {
    for (const it of imageField) {
      const url = pickImageFromJsonLd(it);
      if (url) return url;
    }
    return null;
  }
  if (typeof imageField === "object") {
    const o = imageField as UnknownRec;
    if (typeof o.url === "string") return o.url;
    if (typeof o.contentUrl === "string") return o.contentUrl;
  }
  return null;
}

function extractJsonLdPreview(
  html: string,
): { title: string; image: string | null } | null {
  const scripts = html.match(
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  if (!scripts) return null;
  for (const raw of scripts) {
    const inner = raw
      .replace(/^<script[^>]*>/i, "")
      .replace(/<\/script>$/i, "")
      .trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(inner);
    } catch {
      try {
        parsed = JSON.parse(inner.replace(/,\s*([}\]])/g, "$1"));
      } catch {
        continue;
      }
    }
    const recipe = findRecipeNode(parsed);
    if (!recipe) continue;
    const title = String(recipe.name ?? "").trim();
    if (!title) continue;
    const image = pickImageFromJsonLd(recipe.image);
    return { title, image };
  }
  return null;
}

function extractOgPreview(
  html: string,
): { title: string | null; image: string | null } {
  const titleM = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
  );
  const imageM = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
  );
  return {
    title: titleM ? decodeEntities(titleM[1]).trim() : null,
    image: imageM ? imageM[1].trim() : null,
  };
}

async function previewRecipeUrl(
  url: string,
  source: Source,
): Promise<Result | null> {
  const html = await fetchHtml(url);
  if (!html) return null;

  const jsonld = extractJsonLdPreview(html);
  if (jsonld && jsonld.title) {
    return { title: jsonld.title, url, thumbnailUrl: jsonld.image, source };
  }
  const og = extractOgPreview(html);
  if (og.title) {
    return { title: og.title, url, thumbnailUrl: og.image, source };
  }
  return null;
}

/**
 * Fluxo completo por site: IA descobre URLs + preview leve de cada uma.
 * Envolve todo o pipeline num deadline para não travar a resposta final.
 */
async function searchViaAiAndPreview(
  apiKey: string,
  domain: string,
  source: Source,
  ingredient: string,
): Promise<Result[]> {
  const work = (async () => {
    const urls = await findRecipeUrlsViaAi(apiKey, domain, ingredient, 3);
    if (urls.length === 0) return [] as Result[];
    const previews = await Promise.allSettled(
      urls.slice(0, 5).map((u) => previewRecipeUrl(u, source)),
    );
    const out: Result[] = [];
    for (const p of previews) {
      if (p.status === "fulfilled" && p.value) out.push(p.value);
    }
    return out;
  })();

  const timeout = new Promise<Result[]>((resolve) =>
    setTimeout(() => {
      console.error(`[search-recipes] ai deadline ${domain}`);
      resolve([]);
    }, AI_SITE_DEADLINE_MS),
  );

  try {
    return await Promise.race([work, timeout]);
  } catch (e) {
    console.error(`[search-recipes] ai search ${domain} error`, e);
    return [];
  }
}

export const Route = createFileRoute("/api/search-recipes-by-ingredient")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const ip = getClientIp(request);
          if (!rateLimit(`ingsearch:${ip}`, 8, HOUR_MS)) {
            return Response.json(
              { error: "Muitas buscas seguidas. Tente novamente em alguns minutos." },
              { status: 429 },
            );
          }
          const body = await request.json().catch(() => null);
          const parsed = z.object({ ingredient: z.string() }).safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Digite um ingrediente." }, { status: 400 });
          }
          const ingredient = parsed.data.ingredient.trim();
          if (!ingredient || ingredient.length > 60) {
            return Response.json({ error: "Digite um ingrediente." }, { status: 400 });
          }

          const q = encodeURIComponent(ingredient);
          const apiKey = process.env.LOVABLE_API_KEY;

          const tasks: Array<Promise<Result[]>> = [
            // 1. TudoGostoso (raspagem direta)
            (async () => {
              const html = await fetchHtml(
                `https://www.tudogostoso.com.br/busca?q=${q}`,
              );
              if (!html) return [];
              try {
                return parseTudoGostoso(html, ingredient);
              } catch (e) {
                console.error("[search-recipes] tudogostoso parse", e);
                return [];
              }
            })(),
            // 2. Guia da Cozinha (raspagem direta, mantido)
            (async () => {
              const html = await fetchHtml(`https://guiadacozinha.com.br/?s=${q}`);
              if (!html) return [];
              try {
                return parseGuiaDaCozinha(html, ingredient);
              } catch (e) {
                console.error("[search-recipes] guiadacozinha parse", e);
                return [];
              }
            })(),
            // 3. Fritadeira Sem Óleo (raspagem direta, novo)
            (async () => {
              const html = await fetchHtml(
                `https://www.fritadeirasemoleo.com.br/search?q=${q}`,
              );
              if (!html) return [];
              try {
                return parseFritadeiraSemOleo(html, ingredient);
              } catch (e) {
                console.error("[search-recipes] fritadeirasemoleo parse", e);
                return [];
              }
            })(),
          ];

          if (apiKey) {
            tasks.push(
              searchViaAiAndPreview(apiKey, "panelinha.com.br", "Panelinha", ingredient),
              searchViaAiAndPreview(
                apiKey,
                "receitasnestle.com.br",
                "Receitas Nestlé",
                ingredient,
              ),
              searchViaAiAndPreview(
                apiKey,
                "receitas.globo.com",
                "Receitas Globo",
                ingredient,
              ),
            );
          } else {
            console.error("[search-recipes] LOVABLE_API_KEY missing, skipping AI sources");
          }

          const settled = await Promise.allSettled(tasks);

          // Agrupa por source respeitando limite de 3-4 por fonte
          const bySource = new Map<Source, Result[]>();
          for (const s of settled) {
            if (s.status !== "fulfilled") continue;
            for (const r of s.value) {
              const list = bySource.get(r.source) ?? [];
              list.push(r);
              bySource.set(r.source, list);
            }
          }

          const results: Result[] = [];
          const seenUrls = new Set<string>();
          for (const [, list] of bySource) {
            let added = 0;
            for (const r of list) {
              if (seenUrls.has(r.url)) continue;
              seenUrls.add(r.url);
              results.push(r);
              added++;
              if (added >= 4) break;
            }
          }

          // Limite total 16
          const limited = results.slice(0, 16);
          return Response.json({ results: limited });
        } catch (e) {
          console.error("[search-recipes-by-ingredient]", e);
          return Response.json({ error: "Erro no servidor." }, { status: 500 });
        }
      },
    },
  },
});
