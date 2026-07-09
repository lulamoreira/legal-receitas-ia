import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function normalizeName(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
function mergeRecipeTitle(existing: string, incoming: string): string {
  const stripped = (existing ?? "").replace(/^de:\s*/i, "");
  const parts = stripped.split(/\s*\+\s*/).map((p) => p.trim()).filter(Boolean);
  if (!parts.some((p) => p.toLowerCase() === incoming.toLowerCase())) {
    parts.push(incoming);
  }
  return parts.join(" + ");
}

function rowToItem(row: any) {
  return {
    id: row.id as string,
    recipeId: (row.recipe_id ?? "") as string,
    recipeTitle: (row.recipe_title ?? "") as string,
    name: row.name as string,
    quantity: Number(row.quantity ?? 0),
    unit: (row.unit ?? "") as string,
    emoji: (row.emoji ?? "🛒") as string,
    aisle: (row.aisle ?? "Outros") as string,
    checked: !!row.checked,
  };
}

async function loadAll(supabase: any) {
  const { data, error } = await supabase
    .from("user_shopping_items")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToItem);
}

export const listShoppingItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => loadAll(context.supabase));

export const addRecipeToShopping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      recipeId: z.string(),
      servings: z.number().int().min(1),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: recipe, error: rErr } = await context.supabase
      .from("user_recipes")
      .select("*")
      .eq("id", data.recipeId)
      .single();
    if (rErr || !recipe) throw new Error(rErr?.message ?? "Receita não encontrada");

    const factor = data.servings / (recipe.servings || data.servings || 1);

    const { data: existing, error: eErr } = await context.supabase
      .from("user_shopping_items")
      .select("*")
      .eq("checked", false);
    if (eErr) throw new Error(eErr.message);

    const list = [...(existing ?? [])];
    const updates: Array<{ id: string; quantity: number; recipe_title: string }> = [];
    const inserts: any[] = [];

    for (const ing of (recipe.ingredients as any[]) ?? []) {
      const scaledQty = Number(ing.quantity) * factor;
      const normName = normalizeName(ing.name);
      const idx = list.findIndex(
        (it) => !it.checked && it.unit === ing.unit && normalizeName(it.name) === normName,
      );
      if (idx >= 0) {
        const cur = list[idx]!;
        const merged = {
          ...cur,
          quantity: Number(cur.quantity) + scaledQty,
          recipe_title: mergeRecipeTitle(cur.recipe_title ?? "", recipe.title),
        };
        list[idx] = merged;
        updates.push({ id: merged.id, quantity: merged.quantity, recipe_title: merged.recipe_title });
      } else {
        inserts.push({
          user_id: context.userId,
          recipe_id: recipe.id,
          recipe_title: recipe.title,
          name: ing.name,
          quantity: scaledQty,
          unit: ing.unit ?? "",
          emoji: ing.emoji ?? "🛒",
          aisle: ing.aisle ?? "Outros",
          checked: false,
        });
      }
    }

    for (const u of updates) {
      const { error } = await context.supabase
        .from("user_shopping_items")
        .update({ quantity: u.quantity, recipe_title: u.recipe_title })
        .eq("id", u.id);
      if (error) throw new Error(error.message);
    }
    if (inserts.length) {
      const { error } = await context.supabase
        .from("user_shopping_items")
        .insert(inserts);
      if (error) throw new Error(error.message);
    }

    return loadAll(context.supabase);
  });

export const toggleShoppingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string(), checked: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("user_shopping_items")
      .update({ checked: data.checked })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const clearCheckedShoppingItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("user_shopping_items")
      .delete()
      .eq("checked", true);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const bulkItemSchema = z.object({
  recipeTitle: z.string().default(""),
  name: z.string(),
  quantity: z.number(),
  unit: z.string().default(""),
  emoji: z.string().default("🛒"),
  aisle: z.string().default("Outros"),
  checked: z.boolean().default(false),
});

export const bulkImportShoppingItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ items: z.array(bulkItemSchema) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    if (data.items.length === 0) return { inserted: 0 };
    const rows = data.items.map((i) => ({
      user_id: context.userId,
      recipe_id: null,
      recipe_title: i.recipeTitle,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      emoji: i.emoji,
      aisle: i.aisle,
      checked: i.checked,
    }));
    const { error } = await context.supabase
      .from("user_shopping_items")
      .insert(rows);
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });
