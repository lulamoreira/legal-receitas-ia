import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getClientIp, rateLimit } from "@/lib/rate-limit.server";

const HOUR_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 800 * 1024;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

type Result = {
  title: string;
  url: string;
  thumbnailUrl: string | null;
  source: "TudoGostoso" | "Guia da Cozinha";
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
    const url = absUrl(href, base);
    if (!url) continue;
    if (seen.has(url)) continue;
    // Find image in inner
    let thumb: string | null = null;
    const imgMatch = inner.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/i);
    if (imgMatch) {
      const src = imgMatch[1];
      if (/145-110|300x300/.test(src) && !/40x40/.test(src)) {
        thumb = src;
      }
    }
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
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html))) {
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
  const needle = normalize(ingredient);
  return out.filter((r) => normalize(r.title).includes(needle));
}

export const Route = createFileRoute("/api/search-recipes-by-ingredient")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const ip = getClientIp(request);
          if (!rateLimit(`ingsearch:${ip}`, 15, HOUR_MS)) {
            return Response.json(
              { error: "Muitas buscas seguidas. Tente novamente em alguns minutos." },
              { status: 429 },
            );
          }
          const body = await request.json().catch(() => null);
          const parsed = z
            .object({ ingredient: z.string() })
            .safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Digite um ingrediente." }, { status: 400 });
          }
          const ingredient = parsed.data.ingredient.trim();
          if (!ingredient || ingredient.length > 60) {
            return Response.json({ error: "Digite um ingrediente." }, { status: 400 });
          }

          const q = encodeURIComponent(ingredient);
          const [tg, gc] = await Promise.allSettled([
            fetchHtml(`https://www.tudogostoso.com.br/busca?q=${q}`),
            fetchHtml(`https://guiadacozinha.com.br/?s=${q}`),
          ]);

          const results: Result[] = [];
          if (tg.status === "fulfilled" && tg.value) {
            try {
              results.push(...parseTudoGostoso(tg.value, ingredient));
            } catch (e) {
              console.error("[search-recipes] tudogostoso parse", e);
            }
          }
          if (gc.status === "fulfilled" && gc.value) {
            try {
              results.push(...parseGuiaDaCozinha(gc.value, ingredient));
            } catch (e) {
              console.error("[search-recipes] guiadacozinha parse", e);
            }
          }

          const dedup: Result[] = [];
          const seen = new Set<string>();
          for (const r of results) {
            if (seen.has(r.url)) continue;
            seen.add(r.url);
            dedup.push(r);
            if (dedup.length >= 8) break;
          }

          return Response.json({ results: dedup });
        } catch (e) {
          console.error("[search-recipes-by-ingredient]", e);
          return Response.json({ error: "Erro no servidor." }, { status: 500 });
        }
      },
    },
  },
});
