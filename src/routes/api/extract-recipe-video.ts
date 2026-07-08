import { createFileRoute } from "@tanstack/react-router";
import {
  VIDEO_SYSTEM_PROMPT,
  JSON_INSTRUCTION,
  recipeSchema,
  sanitizeExtracted,
  AI_MODEL,
} from "@/lib/recipe-extraction.server";
import { getClientIp, rateLimit } from "@/lib/rate-limit.server";
import { enrichRecipeWithImages } from "@/lib/image-generation.server";




const MAX_BYTES = 25 * 1024 * 1024; // 25MB — MP4 curto de ~90s
const HOUR_MS = 60 * 60 * 1000;

export const Route = createFileRoute("/api/extract-recipe-video")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const ip = getClientIp(request);
          if (!rateLimit(`video:${ip}`, 5, HOUR_MS)) {
            return Response.json(
              { error: "Muitas requisições. Tente novamente mais tarde." },
              { status: 429 },
            );
          }
          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) {
            return Response.json(
              { error: "IA não configurada." },
              { status: 500 },
            );
          }

          const form = await request.formData().catch(() => null);
          const file = form?.get("video");
          if (!(file instanceof File)) {
            return Response.json({ error: "Envie um arquivo de vídeo." }, { status: 400 });
          }
          if (file.size > MAX_BYTES) {
            return Response.json(
              { error: "Vídeo muito grande. Envie até ~25MB (aprox. 90s em MP4)." },
              { status: 413 },
            );
          }
          const mime = file.type || "video/mp4";
          if (!mime.startsWith("video/")) {
            return Response.json({ error: "Formato não suportado." }, { status: 400 });
          }

          const bytes = new Uint8Array(await file.arrayBuffer());
          const base64 = uint8ToBase64(bytes);
          const dataUrl = `data:${mime};base64,${base64}`;

          // Bypassa AI SDK — chat completions cru para conseguir enviar o vídeo
          // como bloco `file` (o converter do @ai-sdk/openai-compatible não suporta vídeo).
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
                  { role: "system", content: `${VIDEO_SYSTEM_PROMPT}\n\n${JSON_INSTRUCTION}` },
                  {
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: "Assista ao vídeo, transcreva a fala, leia os textos na tela e observe os ingredientes/etapas mostrados. Devolva a receita em JSON.",
                      },
                      {
                        type: "file",
                        file: {
                          filename: file.name || "video.mp4",
                          file_data: dataUrl,
                        },
                      },
                    ],
                  },
                ],
              }),
            },
          );

          if (!gatewayRes.ok) {
            const txt = await gatewayRes.text().catch(() => "");
            console.error("[extract-recipe-video] gateway", gatewayRes.status, txt);
            if (gatewayRes.status === 429)
              return Response.json({ error: "Muitas requisições. Tente novamente em instantes." }, { status: 429 });
            if (gatewayRes.status === 402)
              return Response.json({ error: "Créditos de IA esgotados." }, { status: 402 });
            return Response.json(
              { error: "A IA não conseguiu processar o vídeo. Tente um vídeo mais curto ou nítido." },
              { status: 502 },
            );
          }

          const payload = await gatewayRes.json();
          const content: string | undefined = payload?.choices?.[0]?.message?.content;
          if (!content) {
            return Response.json({ error: "Resposta vazia da IA." }, { status: 502 });
          }

          const jsonText = extractJson(content);
          let parsed: unknown;
          try {
            parsed = JSON.parse(jsonText);
          } catch {
            return Response.json(
              { error: "A IA não devolveu um JSON válido. Tente outro vídeo." },
              { status: 502 },
            );
          }

          const validated = recipeSchema.safeParse(parsed);
          if (!validated.success) {
            return Response.json(
              { error: "Não consegui identificar uma receita neste vídeo." },
              { status: 422 },
            );
          }

          const clean = sanitizeExtracted(validated.data);
          if (
            !clean.title ||
            /não foi possível identificar/i.test(clean.title) ||
            clean.ingredients.length === 0
          ) {
            return Response.json(
              { error: "Não encontrei uma receita neste vídeo. Tente um vídeo com passo a passo mais claro." },
              { status: 422 },
            );
          }

          try { await enrichRecipeWithImages(clean as never, apiKey); } catch (imgErr) { console.error("[extract-recipe-video] enrich", imgErr); }
          return Response.json(clean);

        } catch (e) {
          console.error("[extract-recipe-video]", e);
          const msg = e instanceof Error ? e.message : "Erro no servidor.";
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});

function extractJson(s: string): string {
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) return s.slice(first, last + 1);
  return s.trim();
}

function uint8ToBase64(bytes: Uint8Array): string {
  // Cloudflare Worker + Node: Buffer disponível via nodejs_compat
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
