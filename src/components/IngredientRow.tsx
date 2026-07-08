import type { Ingredient } from "@/lib/types";
import { formatQuantity, scaleQuantity } from "@/lib/format";

export function IngredientRow({
  ingredient,
  fromServings,
  toServings,
}: {
  ingredient: Ingredient;
  fromServings: number;
  toServings: number;
}) {
  const qty = scaleQuantity(ingredient.quantity, fromServings, toServings);
  return (
    <li className="flex items-start gap-3 border-b border-border/60 py-3 last:border-b-0">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-lg" aria-hidden>
        {ingredient.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold text-foreground">
            {formatQuantity(qty)} {ingredient.unit}
          </span>
          <span className="text-sm text-foreground">{ingredient.name}</span>
        </div>
        {ingredient.note && (
          <p className="text-xs text-muted-foreground">{ingredient.note}</p>
        )}
      </div>
    </li>
  );
}
