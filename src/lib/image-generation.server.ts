// Server-only. Do not import from client code.
// Gera imagens via Lovable AI Gateway e faz upload no bucket "generated-images".

const IMAGE_MODEL = "google/gemini-2.5-flash-image";
const BUCKET = "generated-images";
const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 10; // 10 anos

export const IMAGE_STYLE =
  "Estilo visual: ilustração digital plana com toque de aquarela suave, paleta da identidade Vitamina (rosa #E7457A, pêssego, amarelo pastel #F5D66A, menta #A7D8B4, lilás #C4B5FD), fundo liso e claro sem elementos extras, sem texto e sem marca d'água, contornos arredondados e acolhedores, iluminação uniforme e suave, composição centralizada, apetitosa e minimalista.";

export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function slugify(s: string): string {
  return normalizeName(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "item";
}

function b64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function generateImage(
  subjectPrompt: string,
  apiKey: string,
): Promise<Uint8Array | null> {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        messages: [{ role: "user", content: `${subjectPrompt}. ${IMAGE_STYLE}` }],
        modalities: ["image", "text"],
      }),
    });
    if (!res.ok) {
      console.error("[generateImage] gateway", res.status, await res.text().catch(() => ""));
      return null;
    }
    const payload = await res.json();
    const b64: string | undefined = payload?.data?.[0]?.b64_json;
    if (!b64) {
      console.error("[generateImage] no b64_json in response");
      return null;
    }
    return b64ToBytes(b64);
  } catch (e) {
    console.error("[generateImage]", e);
    return null;
  }
}

export async function uploadGeneratedImage(
  bytes: Uint8Array,
  path: string,
): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (upErr) {
      console.error("[uploadGeneratedImage] upload", upErr);
      return null;
    }
    const { data, error: signErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL);
    if (signErr || !data?.signedUrl) {
      console.error("[uploadGeneratedImage] sign", signErr);
      return null;
    }
    return data.signedUrl;
  } catch (e) {
    console.error("[uploadGeneratedImage]", e);
    return null;
  }
}

export async function generateRecipeImage(
  title: string,
  description: string,
  apiKey: string,
): Promise<string | null> {
  const subject = `Prato pronto e apetitoso de: ${title}${description ? `. ${description}` : ""}`;
  const bytes = await generateImage(subject, apiKey);
  if (!bytes) return null;
  const path = `recipes/${slugify(title)}-${Math.random().toString(36).slice(2, 10)}.png`;
  return uploadGeneratedImage(bytes, path);
}

export async function getOrCreateIngredientImage(
  ingredientName: string,
  apiKey: string,
): Promise<string | null> {
  const key = normalizeName(ingredientName);
  if (!key) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("ingredient_images")
      .select("image_url")
      .eq("name_normalized", key)
      .maybeSingle();
    if (existing?.image_url) return existing.image_url;

    const bytes = await generateImage(
      `Ilustração isolada e limpa do ingrediente culinário: ${ingredientName}`,
      apiKey,
    );
    if (!bytes) return null;
    const path = `ingredients/${slugify(key)}.png`;
    const url = await uploadGeneratedImage(bytes, path);
    if (!url) return null;

    // ON CONFLICT DO NOTHING via upsert com ignoreDuplicates
    const { error: insErr } = await supabaseAdmin
      .from("ingredient_images")
      .upsert({ name_normalized: key, image_url: url }, { onConflict: "name_normalized", ignoreDuplicates: true });
    if (insErr) console.error("[getOrCreateIngredientImage] insert", insErr);

    // Re-lê para respeitar o vencedor da corrida
    const { data: fresh } = await supabaseAdmin
      .from("ingredient_images")
      .select("image_url")
      .eq("name_normalized", key)
      .maybeSingle();
    return fresh?.image_url ?? url;
  } catch (e) {
    console.error("[getOrCreateIngredientImage]", e);
    return null;
  }
}

type IngredientLike = { name: string; imageUrl?: string };
type RecipeLike = { title: string; description: string; ingredients: IngredientLike[]; imageUrl?: string };

/**
 * Gera imagem da receita e dos ingredientes em paralelo, com deadline total.
 * Mutação in-place no objeto passado. Nunca lança.
 */
export async function enrichRecipeWithImages<T extends RecipeLike>(
  recipe: T,
  apiKey: string,
  deadlineMs = 15_000,
): Promise<void> {
  const deadline = new Promise<void>((resolve) => setTimeout(resolve, deadlineMs));

  const recipeTask = (async () => {
    const url = await generateRecipeImage(recipe.title, recipe.description, apiKey);
    if (url) recipe.imageUrl = url;
  })();

  const ingredientTasks = recipe.ingredients.map(async (ing) => {
    const url = await getOrCreateIngredientImage(ing.name, apiKey);
    if (url) ing.imageUrl = url;
  });

  await Promise.race([
    Promise.allSettled([recipeTask, ...ingredientTasks]).then(() => undefined),
    deadline,
  ]);
}
