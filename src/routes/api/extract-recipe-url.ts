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
const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 500 * 1024;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function isPrivateHost(host: string): boolean {
  let h = host.toLowerCase().trim();
  // strip brackets from IPv6 literals
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);

  if (h === "" || h === "localhost" || h === "0.0.0.0" || h === "::1" || h === "::")
    return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;

  // IPv6 disguises / dangerous ranges
  if (h.includes(":")) {
    if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
    if (h.includes("::ffff:")) return true;
    // conservative: block any other IPv6 we don't explicitly whitelist? keep permissive: allow public IPv6
  }

  // Numeric-only hostname (decimal integer form of IPv4, e.g. 2130706433)
  if (/^\d+$/.test(h)) return true;
  // Hex form (0x7f000001)
  if (/^0x[0-9a-f]+$/i.test(h)) return true;
  // Octal-looking first octet or fully octal
  if (/^0\d+$/.test(h)) return true;

  // If it looks like an IPv4 (contains only digits and dots), require exactly 4 decimal octets
  if (/^[\d.]+$/.test(h)) {
    const parts = h.split(".");
    if (parts.length !== 4) return true;
    for (const p of parts) {
      if (!/^\d{1,3}$/.test(p)) return true;
      if (p.length > 1 && p.startsWith("0")) return true; // octal disguise
      const n = Number(p);
      if (!Number.isInteger(n) || n < 0 || n > 255) return true;
    }
    if (/^127\./.test(h)) return true;
    if (/^10\./.test(h)) return true;
    if (/^192\.168\./.test(h)) return true;
    if (/^169\.254\./.test(h)) return true;
    const m = h.match(/^172\.(\d+)\./);
    if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  }

  return false;
}

function validateUrl(u: string): URL | null {
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (isPrivateHost(parsed.hostname)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    let currentUrl = url;
    let res: Response | null = null;
    for (let hop = 0; hop <= 3; hop++) {
      res = await fetch(currentUrl, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
        redirect: "manual",
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return null;
        let nextUrl: string;
        try {
          nextUrl = new URL(loc, currentUrl).toString();
        } catch {
          return null;
        }
        const validated = validateUrl(nextUrl);
        if (!validated) return null;
        try {
          await res.body?.cancel();
        } catch {}
        currentUrl = validated.toString();
        continue;
      }
      break;
    }
    if (!res || !res.ok || !res.body) return null;
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
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}


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
    if (types.some((x) => String(x).toLowerCase() === "recipe")) {
      return obj;
    }
    const graph = obj["@graph"];
    if (graph) {
      const found = findRecipeNode(graph);
      if (found) return found;
    }
  }
  return null;
}

function stringifyInstruction(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as UnknownRec;
    if (typeof o.text === "string") return o.text;
    if (Array.isArray(o.itemListElement)) {
      return o.itemListElement.map(stringifyInstruction).filter(Boolean).join("\n");
    }
  }
  return "";
}

function extractJsonLdRecipeText(html: string): string | null {
  const scripts = html.match(
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  if (!scripts) return null;
  for (const raw of scripts) {
    const inner = raw.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(inner);
    } catch {
      // try to salvage: strip trailing commas
      try {
        parsed = JSON.parse(inner.replace(/,\s*([}\]])/g, "$1"));
      } catch {
        continue;
      }
    }
    const recipe = findRecipeNode(parsed);
    if (!recipe) continue;

    const name = String(recipe.name ?? "").trim();
    const ingredients = Array.isArray(recipe.recipeIngredient)
      ? recipe.recipeIngredient.map((x) => String(x).trim()).filter(Boolean)
      : [];
    const instructionsRaw = recipe.recipeInstructions;
    const steps: string[] = [];
    if (Array.isArray(instructionsRaw)) {
      for (const s of instructionsRaw) {
        const t = stringifyInstruction(s).trim();
        if (t) steps.push(t);
      }
    } else if (instructionsRaw) {
      const t = stringifyInstruction(instructionsRaw).trim();
      if (t) steps.push(t);
    }
    const yieldVal = recipe.recipeYield ? String(recipe.recipeYield) : "";
    const totalTime = recipe.totalTime ? String(recipe.totalTime) : "";
    const description =
      typeof recipe.description === "string" ? recipe.description : "";

    const parts: string[] = [];
    if (name) parts.push(`Título: ${name}`);
    if (description) parts.push(`Descrição: ${description}`);
    if (yieldVal) parts.push(`Rendimento: ${yieldVal}`);
    if (totalTime) parts.push(`Tempo total: ${totalTime}`);
    if (ingredients.length) parts.push(`Ingredientes:\n- ${ingredients.join("\n- ")}`);
    if (steps.length)
      parts.push(`Modo de preparo:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);

    const text = parts.join("\n\n").trim();
    if (text.length >= 40) return text;
  }
  return null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

export const Route = createFileRoute("/api/extract-recipe-url")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const ip = getClientIp(request);
          if (!rateLimit(`url:${ip}`, 10, HOUR_MS)) {
            return Response.json(
              { error: "Muitas requisições. Tente novamente mais tarde." },
              { status: 429 },
            );
          }

          const body = await request.json().catch(() => null);
          const parsed = z
            .object({ url: z.string().max(2048) })
            .safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Link inválido." }, { status: 400 });
          }

          let parsedUrl: URL;
          try {
            parsedUrl = new URL(parsed.data.url);
          } catch {
            return Response.json({ error: "Link inválido." }, { status: 400 });
          }
          if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
            return Response.json({ error: "Link inválido." }, { status: 400 });
          }
          if (isPrivateHost(parsedUrl.hostname)) {
            return Response.json(
              { error: "Esse endereço não é permitido." },
              { status: 400 },
            );
          }

          const html = await fetchHtml(parsedUrl.toString());
          if (!html) {
            return Response.json(
              { error: "Não consegui acessar essa página." },
              { status: 502 },
            );
          }

          let text = extractJsonLdRecipeText(html);
          if (!text) {
            text = htmlToText(html).slice(0, 8000);
          }

          if (!text || text.length < 200) {
            return Response.json(
              {
                error:
                  "Não consegui ler o conteúdo dessa página (talvez ela carregue por JavaScript). Copie o texto da receita e use a aba Colar texto.",
              },
              { status: 422 },
            );
          }

          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) {
            return Response.json(
              { error: "IA não configurada. Contate o administrador." },
              { status: 500 },
            );
          }

          const { createLovableAiGatewayProvider } = await import(
            "@/lib/ai-gateway.server"
          );
          const gateway = createLovableAiGatewayProvider(apiKey);
          const model = gateway("google/gemini-3-flash-preview");

          const prompt = `Extraia e organize a receita a partir do conteúdo da página a seguir. Texto extraído:\n\n${text}`;

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
                {
                  error:
                    "Não encontrei uma receita nessa página. Confira se o link abre uma receita completa.",
                },
                { status: 422 },
              );
            }
            return Response.json({ ...clean, sourceUrl: parsedUrl.toString() });
          } catch (err) {
            if (NoObjectGeneratedError.isInstance(err)) {
              return Response.json(
                { error: "A IA não devolveu uma receita válida. Tente outro link." },
                { status: 502 },
              );
            }
            const msg = err instanceof Error ? err.message : String(err);
            const status = /429|rate/i.test(msg)
              ? 429
              : /402|credit/i.test(msg)
                ? 402
                : 500;
            console.error("[extract-recipe-url]", msg);
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
