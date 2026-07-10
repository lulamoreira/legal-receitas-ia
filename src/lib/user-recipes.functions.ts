import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cleanEmoji } from "@/lib/emoji";

const ingredientSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  quantity: z.number(),
  unit: z.string().default(""),
  note: z.string().nullish(),
  emoji: z.string().default("🥕"),
  aisle: z.string().default("Outros"),
  imageUrl: z.string().optional(),
});

const extractedRecipeSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  emoji: z.string().default("🍽️"),
  servings: z.number().int().min(1).default(4),
  totalMinutes: z.number().int().min(0).default(30),
  tags: z.array(z.string()).default([]),
  ingredients: z.array(ingredientSchema).default([]),
  steps: z.array(z.string()).default([]),
  sourceUrl: z.string().optional(),
  imageUrl: z.string().optional(),
});

function newId(): string {
  return (globalThis.crypto as any)?.randomUUID?.() ??
    Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function rowToRecipe(row: any) {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description ?? "") as string,
    emoji: cleanEmoji(row.emoji, "🍽️"),
    servings: row.servings as number,
    totalMinutes: row.total_minutes as number,
    tags: (row.tags ?? []) as string[],
    ingredients: ((row.ingredients ?? []) as any[]).map((i) => ({
      ...i,
      id: i.id ?? newId(),
      emoji: cleanEmoji(i.emoji, "🥄"),
    })),
    steps: (row.steps ?? []) as string[],
    sourceUrl: (row.source_url ?? undefined) as string | undefined,
    imageUrl: (row.image_url ?? undefined) as string | undefined,
    isFavorite: Boolean(row.is_favorite),
    createdAt: new Date(row.created_at).getTime(),
  };
}

export const toggleFavoriteRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: cur, error: e1 } = await context.supabase
      .from("user_recipes")
      .select("is_favorite")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!cur) throw new Error("Receita não encontrada");
    const next = !cur.is_favorite;
    const { error: e2 } = await context.supabase
      .from("user_recipes")
      .update({ is_favorite: next })
      .eq("id", data.id);
    if (e2) throw new Error(e2.message);
    return { isFavorite: next };
  });

export const listUserRecipes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_recipes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToRecipe);
  });

export const createUserRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => extractedRecipeSchema.parse(d))
  .handler(async ({ context, data }) => {
    const ingredients = data.ingredients.map((i) => ({
      id: i.id ?? newId(),
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      note: i.note ?? undefined,
      emoji: i.emoji,
      aisle: i.aisle,
      imageUrl: i.imageUrl,
    }));
    const { data: row, error } = await context.supabase
      .from("user_recipes")
      .insert({
        user_id: context.userId,
        title: data.title,
        description: data.description,
        emoji: data.emoji,
        servings: data.servings,
        total_minutes: data.totalMinutes,
        tags: data.tags,
        ingredients: ingredients as any,
        steps: data.steps,
        source_url: data.sourceUrl ?? null,
        image_url: data.imageUrl ?? null,
      })
      .select()
      .single();
    if (error || !row) throw new Error(error?.message ?? "Falha ao salvar receita");
    return rowToRecipe(row);
  });

export const deleteUserRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("user_recipes")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const bulkRecipeSchema = extractedRecipeSchema.extend({
  createdAt: z.number().optional(),
});

export const bulkImportUserRecipes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ recipes: z.array(bulkRecipeSchema) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    if (data.recipes.length === 0) return { inserted: 0, recipes: [] };
    const rows = data.recipes.map((r) => ({
      user_id: context.userId,
      title: r.title,
      description: r.description,
      emoji: r.emoji,
      servings: r.servings,
      total_minutes: r.totalMinutes,
      tags: r.tags,
      ingredients: r.ingredients.map((i) => ({
        id: i.id ?? newId(),
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        note: i.note ?? undefined,
        emoji: i.emoji,
        aisle: i.aisle,
        imageUrl: i.imageUrl,
      })) as any,
      steps: r.steps,
      source_url: r.sourceUrl ?? null,
      image_url: r.imageUrl ?? null,
    }));
    const { data: inserted, error } = await context.supabase
      .from("user_recipes")
      .insert(rows)
      .select();
    if (error) throw new Error(error.message);
    return {
      inserted: inserted?.length ?? 0,
      recipes: (inserted ?? []).map(rowToRecipe),
    };
  });
