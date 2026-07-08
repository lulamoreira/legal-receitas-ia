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
        const items: ShoppingItem[] = recipe.ingredients.map((ing) => ({
          id: uid(),
          recipeId: recipe.id,
          recipeTitle: recipe.title,
          name: ing.name,
          quantity: ing.quantity * factor,
          unit: ing.unit,
          emoji: ing.emoji,
          aisle: ing.aisle,
          checked: false,
        }));
        set({ shoppingList: [...get().shoppingList, ...items] });
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
    { name: "receitai-store-v1" },
  ),
);
