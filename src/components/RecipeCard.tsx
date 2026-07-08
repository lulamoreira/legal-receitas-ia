import { Link } from "@tanstack/react-router";
import { Clock, Users } from "lucide-react";
import type { Recipe } from "@/lib/types";

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link
      to="/receita/$id"
      params={{ id: recipe.id }}
      className="group block rounded-2xl bg-card p-4 shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5 hover:shadow-[var(--shadow-warm)]"
    >
      <div className="mb-3 flex h-24 items-center justify-center rounded-xl bg-accent text-5xl">
        <span aria-hidden>{recipe.emoji}</span>
      </div>
      <h3 className="font-serif text-lg leading-tight text-foreground">{recipe.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{recipe.description}</p>
      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
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
              className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
