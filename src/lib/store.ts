import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Recipe, ShoppingItem, ExtractedRecipe } from "./types";
import { SEED_RECIPES } from "./seed";
import { uid } from "./format";

type State = {
  recipes: Recipe[];
  shoppingList: ShoppingItem[];
  addRecipe: (r: ExtractedRecipe) => Recipe;
  deleteRecipe: (id: string) => void;
  addRecipeToShoppingList: (recipeId: string, servings?: number) => void;
  toggleItem: (id: string) => void;
  clearChecked: () => void;
};

function normalizeName(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function mergeRecipeTitle(existing: string, incoming: string): string {
  const stripped = existing.replace(/^de:\s*/i, "");
  const parts = stripped.split(/\s*\+\s*/).map((p) => p.trim()).filter(Boolean);
  if (!parts.some((p) => p.toLowerCase() === incoming.toLowerCase())) {
    parts.push(incoming);
  }
  return parts.join(" + ");
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      recipes: SEED_RECIPES,
      shoppingList: [],

      addRecipe: (r) => {
        const recipe: Recipe = {
          ...r,
          id: uid(),
          createdAt: Date.now(),
          ingredients: r.ingredients.map((i) => ({ ...i, id: uid() })),
        };
        set({ recipes: [recipe, ...get().recipes] });
        return recipe;
      },

      deleteRecipe: (id) =>
        set({
          recipes: get().recipes.filter((r) => r.id !== id),
          shoppingList: get().shoppingList.filter((i) => i.recipeId !== id),
        }),

      addRecipeToShoppingList: (recipeId, servings) => {
        const recipe = get().recipes.find((r) => r.id === recipeId);
        if (!recipe) return;
        const factor = servings ? servings / recipe.servings : 1;

        const list = [...get().shoppingList];
        for (const ing of recipe.ingredients) {
          const scaledQty = ing.quantity * factor;
          const normName = normalizeName(ing.name);
          const idx = list.findIndex(
            (it) =>
              !it.checked &&
              it.unit === ing.unit &&
              normalizeName(it.name) === normName,
          );
          if (idx >= 0) {
            const cur = list[idx]!;
            list[idx] = {
              ...cur,
              quantity: cur.quantity + scaledQty,
              recipeTitle: mergeRecipeTitle(cur.recipeTitle, recipe.title),
            };
          } else {
            list.push({
              id: uid(),
              recipeId: recipe.id,
              recipeTitle: recipe.title,
              name: ing.name,
              quantity: scaledQty,
              unit: ing.unit,
              emoji: ing.emoji,
              aisle: ing.aisle,
              checked: false,
            });
          }
        }
        set({ shoppingList: list });
      },

      toggleItem: (id) =>
        set({
          shoppingList: get().shoppingList.map((i) =>
            i.id === id ? { ...i, checked: !i.checked } : i,
          ),
        }),

      clearChecked: () =>
        set({ shoppingList: get().shoppingList.filter((i) => !i.checked) }),
    }),
    { name: "receitai-store-v1", skipHydration: true },
  ),
);
