import { create } from "zustand";
import type { Recipe, ShoppingItem, ExtractedRecipe } from "./types";
import {
  listUserRecipes,
  createUserRecipe,
  deleteUserRecipe,
  bulkImportUserRecipes,
} from "./user-recipes.functions";
import {
  listShoppingItems,
  addRecipeToShopping,
  toggleShoppingItem,
  clearCheckedShoppingItems,
  bulkImportShoppingItems,
} from "./user-shopping.functions";

type State = {
  recipes: Recipe[];
  shoppingList: ShoppingItem[];
  hydrated: boolean;
  loading: boolean;
  hydrate: () => Promise<void>;
  reset: () => void;
  addRecipe: (r: ExtractedRecipe) => Promise<Recipe>;
  deleteRecipe: (id: string) => Promise<void>;
  addRecipeToShoppingList: (recipeId: string, servings?: number) => Promise<void>;
  toggleItem: (id: string) => Promise<void>;
  clearChecked: () => Promise<void>;
  importLocalData: (payload: {
    recipes: Recipe[];
    shoppingList: ShoppingItem[];
  }) => Promise<{ recipes: number; items: number }>;
};

export const useStore = create<State>()((set, get) => ({
  recipes: [],
  shoppingList: [],
  hydrated: false,
  loading: false,

  hydrate: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const [recipes, shoppingList] = await Promise.all([
        listUserRecipes(),
        listShoppingItems(),
      ]);
      set({ recipes, shoppingList, hydrated: true, loading: false });
    } catch (e) {
      console.error("[store.hydrate]", e);
      set({ loading: false });
    }
  },

  reset: () =>
    set({ recipes: [], shoppingList: [], hydrated: false, loading: false }),

  addRecipe: async (r) => {
    const recipe = await createUserRecipe({ data: r as any });
    set({ recipes: [recipe, ...get().recipes] });
    return recipe;
  },

  deleteRecipe: async (id) => {
    const prevRecipes = get().recipes;
    const prevList = get().shoppingList;
    set({
      recipes: prevRecipes.filter((r) => r.id !== id),
      shoppingList: prevList.filter((i) => i.recipeId !== id),
    });
    try {
      await deleteUserRecipe({ data: { id } });
    } catch (e) {
      set({ recipes: prevRecipes, shoppingList: prevList });
      throw e;
    }
  },

  addRecipeToShoppingList: async (recipeId, servings) => {
    const recipe = get().recipes.find((r) => r.id === recipeId);
    const useServings = servings ?? recipe?.servings ?? 1;
    const list = await addRecipeToShopping({
      data: { recipeId, servings: useServings },
    });
    set({ shoppingList: list });
  },

  toggleItem: async (id) => {
    const list = get().shoppingList;
    const idx = list.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const nextChecked = !list[idx]!.checked;
    const next = [...list];
    next[idx] = { ...list[idx]!, checked: nextChecked };
    set({ shoppingList: next });
    try {
      await toggleShoppingItem({ data: { id, checked: nextChecked } });
    } catch (e) {
      console.error("[toggleItem]", e);
      set({ shoppingList: list });
    }
  },

  clearChecked: async () => {
    const prev = get().shoppingList;
    set({ shoppingList: prev.filter((i) => !i.checked) });
    try {
      await clearCheckedShoppingItems();
    } catch (e) {
      console.error("[clearChecked]", e);
      set({ shoppingList: prev });
    }
  },

  importLocalData: async ({ recipes, shoppingList }) => {
    let insertedRecipes = 0;
    let insertedItems = 0;
    try {
      if (recipes.length > 0) {
        const res = await bulkImportUserRecipes({
          data: { recipes: recipes as any },
        });
        insertedRecipes = res.inserted;
      }
      if (shoppingList.length > 0) {
        const res = await bulkImportShoppingItems({
          data: {
            items: shoppingList.map((i) => ({
              recipeTitle: i.recipeTitle,
              name: i.name,
              quantity: i.quantity,
              unit: i.unit,
              emoji: i.emoji,
              aisle: i.aisle,
              checked: i.checked,
            })),
          },
        });
        insertedItems = res.inserted;
      }
    } catch (e) {
      console.error("[importLocalData]", e);
    }
    return { recipes: insertedRecipes, items: insertedItems };
  },
}));
