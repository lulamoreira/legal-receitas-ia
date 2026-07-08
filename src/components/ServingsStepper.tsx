import { Minus, Plus, Users } from "lucide-react";

export function ServingsStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="inline-flex items-center gap-3 rounded-full bg-secondary p-1 pr-4">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        className="grid h-9 w-9 place-items-center rounded-full bg-card text-foreground shadow-sm transition hover:bg-primary hover:text-primary-foreground disabled:opacity-40"
        aria-label="Diminuir porções"
        disabled={value <= 1}
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Users className="h-4 w-4 text-muted-foreground" />
        {value} {value === 1 ? "porção" : "porções"}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(50, value + 1))}
        className="grid h-9 w-9 place-items-center rounded-full bg-card text-foreground shadow-sm transition hover:bg-primary hover:text-primary-foreground"
        aria-label="Aumentar porções"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
