import { Link } from "@tanstack/react-router";
import { Clock, Users } from "lucide-react";
import type { Recipe } from "@/lib/types";

const PALETTES = [
  { bg: "#FFE3EC", title: "#7B2547", meta: "#B0567C", tagBg: "#FBD0DE", tagText: "#7B2547" },
  { bg: "#FFF0C7", title: "#6B4A06", meta: "#A3770E", tagBg: "#FBE3A0", tagText: "#6B4A06" },
  { bg: "#DFF5E9", title: "#14532D", meta: "#3F7E58", tagBg: "#BEE8D2", tagText: "#14532D" },
  { bg: "#EDE7FB", title: "#3B2E6B", meta: "#6D5BA3", tagBg: "#DBD0F5", tagText: "#3B2E6B" },
];

export function pastelForIndex(i: number) {
  return PALETTES[i % PALETTES.length]!;
}

export function RecipeCard({ recipe, index = 0 }: { recipe: Recipe; index?: number }) {
  const p = pastelForIndex(index);
  return (
    <Link
      to="/receita/$id"
      params={{ id: recipe.id }}
      className="group block rounded-3xl p-4 shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5 hover:shadow-[var(--shadow-warm)]"
      style={{ backgroundColor: p.bg }}
    >
      <div className="mb-3 flex h-24 items-center justify-center rounded-2xl bg-white text-5xl shadow-sm">
        <span aria-hidden>{recipe.emoji}</span>
      </div>
      <h3 className="font-serif text-lg font-bold leading-tight" style={{ color: p.title }}>
        {recipe.title}
      </h3>
      <p className="mt-1 line-clamp-2 text-sm" style={{ color: p.meta }}>
        {recipe.description}
      </p>
      <div className="mt-3 flex items-center gap-3 text-xs" style={{ color: p.meta }}>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {recipe.totalMinutes} min
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {recipe.servings}
        </span>
      </div>
      {recipe.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {recipe.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: p.tagBg, color: p.tagText }}
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
