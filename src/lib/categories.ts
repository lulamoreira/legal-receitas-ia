import type { Recipe } from "./types";

export type CategorySlug =
  | "minhas"
  | "favoritas"
  | "doces"
  | "salgadas"
  | "rapidas";

export type Category = {
  slug: CategorySlug;
  label: string;
  emoji: string;
};

export const CATEGORIES: Category[] = [
  { slug: "minhas", label: "Minhas", emoji: "📖" },
  { slug: "favoritas", label: "Favoritas", emoji: "⭐" },
  { slug: "doces", label: "Doces", emoji: "🍰" },
  { slug: "salgadas", label: "Salgadas", emoji: "🍲" },
  { slug: "rapidas", label: "Rápidas", emoji: "⚡" },
];

export function getCategory(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const DOCES_KEYS = [
  "doce",
  "doces",
  "sobremesa",
  "sobremesas",
  "bolo",
  "chocolate",
  "brigadeiro",
  "docinho",
];

const SALGADAS_KEYS = [
  "salgado",
  "salgada",
  "jantar",
  "almoco",
  "prato principal",
];

function tagsMatchAny(recipe: Recipe, keys: string[]): boolean {
  return recipe.tags.some((t) => {
    const nt = normalize(t);
    return keys.some((k) => nt.includes(k));
  });
}

export function matchesCategory(
  recipe: Recipe,
  slug: CategorySlug,
  isMine: boolean,
): boolean {
  switch (slug) {
    case "minhas":
      return isMine;
    case "favoritas":
      return isMine && recipe.isFavorite === true;
    case "rapidas":
      return typeof recipe.totalMinutes === "number" && recipe.totalMinutes <= 25;
    case "doces":
      return tagsMatchAny(recipe, DOCES_KEYS);
    case "salgadas":
      return tagsMatchAny(recipe, SALGADAS_KEYS);
    default:
      return false;
  }
}
