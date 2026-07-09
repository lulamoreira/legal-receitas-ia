import { Link } from "@tanstack/react-router";
import { Clock, Users } from "lucide-react";
import type { Recipe } from "@/lib/types";

const PALETTES = [
  { bg: "#FFE3EC", title: "#7B2547", meta: "#8A3A5C", tagBg: "#FBD0DE", tagText: "#7B2547" },
  { bg: "#FFF0C7", title: "#6B4A06", meta: "#855F08", tagBg: "#FBE3A0", tagText: "#6B4A06" },
  { bg: "#DFF5E9", title: "#14532D", meta: "#2E6543", tagBg: "#BEE8D2", tagText: "#14532D" },
  { bg: "#EDE7FB", title: "#3B2E6B", meta: "#554488", tagBg: "#DBD0F5", tagText: "#3B2E6B" },
];

export function pastelForIndex(i: number) {
  return PALETTES[i % PALETTES.length]!;
}

type RecipeCardProps = {
  recipe: Recipe;
  index?: number;
  to?: "/receita/$id" | "/explorar/$id";
};

export function RecipeCard({ recipe, index = 0, to = "/receita/$id" }: RecipeCardProps) {
  const p = pastelForIndex(index);
  return (
    <Link
      to={to}
      params={{ id: recipe.id }}
      className="group block overflow-hidden rounded-3xl shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-warm)] focus-visible:-translate-y-1"
      style={{ backgroundColor: p.bg }}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-white">
        {recipe.imageUrl ? (
          <img
            src={recipe.imageUrl}
            alt={recipe.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center text-6xl" aria-hidden>
            {recipe.emoji}
          </div>
        )}
        {recipe.tags.length > 0 && (
          <span
            className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide backdrop-blur"
            style={{ backgroundColor: `${p.tagBg}dd`, color: p.tagText }}
          >
            {recipe.tags[0]}
          </span>
        )}
      </div>

      <div className="p-3">
        <h3 className="font-serif text-[15px] font-bold leading-tight line-clamp-2 min-h-[2.6em]" style={{ color: p.title }}>
          {recipe.title}
        </h3>
        <div className="mt-2 flex items-center gap-3 text-[11px] font-medium" style={{ color: p.meta }}>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {recipe.totalMinutes} min
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" />
            {recipe.servings}
          </span>
        </div>
      </div>
    </Link>
  );
}
