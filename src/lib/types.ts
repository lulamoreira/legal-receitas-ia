export const AISLES = [
  "Hortifrúti",
  "Açougue e Peixaria",
  "Laticínios e Ovos",
  "Padaria",
  "Mercearia",
  "Congelados",
  "Bebidas",
  "Temperos e Condimentos",
  "Outros",
] as const;

export type Aisle = (typeof AISLES)[number];

export type Ingredient = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  note?: string;
  emoji: string;
  aisle: Aisle;
  imageUrl?: string;
};

export type Recipe = {
  id: string;
  title: string;
  description: string;
  emoji: string;
  servings: number;
  totalMinutes: number;
  tags: string[];
  ingredients: Ingredient[];
  steps: string[];
  sourceUrl?: string;
  imageUrl?: string;
  isFavorite?: boolean;
  createdAt: number;
};

export type ExtractedRecipe = Omit<Recipe, "id" | "createdAt">;


export type ShoppingItem = {
  id: string;
  recipeId: string;
  recipeTitle: string;
  name: string;
  quantity: number;
  unit: string;
  emoji: string;
  aisle: Aisle;
  checked: boolean;
};
