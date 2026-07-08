import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Check, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/hooks/use-hydrated";
import { AISLES, type Aisle } from "@/lib/types";
import { formatQuantity } from "@/lib/format";

export const Route = createFileRoute("/compras")({
  component: Compras,
});

function Compras() {
  const hydrated = useHydrated();
  const list = useStore((s) => s.shoppingList);
  const toggle = useStore((s) => s.toggleItem);
  const clear = useStore((s) => s.clearChecked);

  if (!hydrated) {
    return (
      <div className="px-4 pt-16 text-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  const grouped = useMemo(() => {
    const g = new Map<Aisle, typeof list>();
    for (const item of list) {
      if (!g.has(item.aisle)) g.set(item.aisle, []);
      g.get(item.aisle)!.push(item);
    }
    return AISLES.filter((a) => g.has(a)).map((a) => ({ aisle: a, items: g.get(a)! }));
  }, [list]);

  const checkedCount = list.filter((i) => i.checked).length;

  return (
    <div className="px-4 pt-8 pb-6">
      <header className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-primary">Mercado</p>
          <h1 className="mt-1 font-serif text-3xl text-foreground">Lista de compras</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {list.length === 0
              ? "Adicione ingredientes de uma receita"
              : `${list.length - checkedCount} para comprar · ${checkedCount} no carrinho`}
          </p>
        </div>
        {checkedCount > 0 && (
          <button
            onClick={clear}
            className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Limpar
          </button>
        )}
      </header>

      {list.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center shadow-[var(--shadow-soft)]">
          <div className="mb-3 text-4xl" aria-hidden>🛒</div>
          <h2 className="font-serif text-lg text-foreground">Carrinho vazio</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Abra uma receita e toque em "Adicionar à lista".
          </p>
          <Link to="/" className="mt-4 inline-block rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            Ver receitas
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ aisle, items }) => (
            <section key={aisle}>
              <h2 className="mb-2 px-1 font-serif text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {aisle}
              </h2>
              <ul className="overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-soft)]">
                {items.map((item) => (
                  <li key={item.id} className="border-b border-border/60 last:border-b-0">
                    <button
                      onClick={() => toggle(item.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-accent/40"
                    >
                      <span
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition ${
                          item.checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-transparent"
                        }`}
                        aria-hidden
                      >
                        {item.checked && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="text-xl" aria-hidden>{item.emoji}</span>
                      <div className={`min-w-0 flex-1 ${item.checked ? "opacity-50 line-through" : ""}`}>
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-sm font-semibold text-foreground">
                            {formatQuantity(item.quantity)} {item.unit}
                          </span>
                          <span className="text-sm text-foreground">{item.name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">de: {item.recipeTitle}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
