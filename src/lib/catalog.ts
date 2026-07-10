import { supabase } from "@/integrations/supabase/client";
import { AISLES, type Aisle, type Ingredient, type Recipe } from "./types";
import { uid } from "./format";
import { cleanEmoji } from "./emoji";

export const CATALOG_PAGE_SIZE = 20;

type CatalogRow = {
  id: string;
  title: string;
  description: string | null;
  emoji: string | null;
  servings: number;
  total_minutes: number;
  tags: string[] | null;
  ingredients: unknown;
  steps: string[] | null;
  created_at: string;
  image_url?: string | null;
};

function toAisle(v: unknown): Aisle {
  return (AISLES as readonly string[]).includes(v as string) ? (v as Aisle) : "Outros";
}

function toIngredient(raw: unknown): Ingredient {
  const r = (raw ?? {}) as Record<string, unknown>;
  const qty = Number(r.quantity);
  const imgRaw = r.imageUrl ?? r.image_url;
  return {
    id: uid(),
    name: String(r.name ?? ""),
    quantity: Number.isFinite(qty) ? qty : 0,
    unit: String(r.unit ?? ""),
    note: r.note ? String(r.note) : undefined,
    emoji: cleanEmoji(r.emoji, "🥄"),
    aisle: toAisle(r.aisle),
    imageUrl: typeof imgRaw === "string" && imgRaw ? imgRaw : undefined,
  };
}

export function catalogRowToRecipe(row: CatalogRow): Recipe {
  const ingredients = Array.isArray(row.ingredients)
    ? (row.ingredients as unknown[]).map(toIngredient)
    : [];
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    emoji: cleanEmoji(row.emoji, "🍽️"),
    servings: row.servings,
    totalMinutes: row.total_minutes,
    tags: row.tags ?? [],
    ingredients,
    steps: row.steps ?? [],
    imageUrl: row.image_url ?? undefined,
    isFavorite: false,
    createdAt: new Date(row.created_at).getTime(),
  };
}


export async function fetchCatalogPage(page: number): Promise<{ recipes: Recipe[]; total: number }> {
  const from = page * CATALOG_PAGE_SIZE;
  const to = from + CATALOG_PAGE_SIZE - 1;
  const { data, error, count } = await supabase
    .from("catalog_recipes")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  return {
    recipes: (data ?? []).map((r) => catalogRowToRecipe(r as CatalogRow)),
    total: count ?? 0,
  };
}

export async function fetchCatalogRecipe(id: string): Promise<Recipe | null> {
  const { data, error } = await supabase
    .from("catalog_recipes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? catalogRowToRecipe(data as CatalogRow) : null;
}
