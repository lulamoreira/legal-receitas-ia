import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Sparkles, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/hooks/use-hydrated";
import { RecipeCard } from "@/components/RecipeCard";
import { UserMenu } from "@/components/UserMenu";

export const Route = createFileRoute("/_authenticated/")({
  component: Index,
});

function Index() {
  const hydrated = useHydrated();
  const recipes = useStore((s) => s.recipes);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return recipes;
    return recipes.filter((r) => {
      if (r.title.toLowerCase().includes(term)) return true;
      if (r.tags.some((t) => t.toLowerCase().includes(term))) return true;
      if (r.ingredients.some((i) => i.name.toLowerCase().includes(term))) return true;
      return false;
    });
  }, [recipes, q]);

  const latest = recipes.slice(0, 5);

  return (
    <div className="px-4 pt-8 pb-6">
      {!hydrated && (
        <div className="sr-only" aria-live="polite">Carregando receitas…</div>
      )}
      <header className="mb-6 flex items-start gap-3">
        <img
          src="/favicon.png"
          alt="Caderno de Vó"
          width={64}
          height={64}
          className="h-16 w-16 shrink-0 drop-shadow-sm"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Caderno de Vó</p>
          <h1 className="mt-0.5 font-serif text-[32px] leading-none text-foreground">
            Minhas receitas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {recipes.length} {recipes.length === 1 ? "receita salva" : "receitas salvas"}
          </p>
        </div>
        <UserMenu />
      </header>

      {recipes.length >= 3 && (
        <section className="mb-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-serif text-lg text-foreground">Últimas receitas</h2>
            <span className="text-xs font-medium text-muted-foreground">
              {latest.length}
            </span>
          </div>
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 hide-scrollbar">
            {latest.map((r) => (
              <Link
                key={r.id}
                to="/receita/$id"
                params={{ id: r.id }}
                className="group w-[110px] shrink-0 snap-start"
              >
                <div className="flex h-[110px] w-[110px] items-center justify-center overflow-hidden rounded-2xl bg-card text-4xl shadow-[var(--shadow-soft)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[var(--shadow-warm)]">
                  {r.imageUrl ? (
                    <img
                      src={r.imageUrl}
                      alt={r.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <span aria-hidden>{r.emoji}</span>
                  )}
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-tight text-foreground">
                  {r.title}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {recipes.length > 0 && (
        <div className="sticky top-2 z-10 mb-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome, tag ou ingrediente"
              className="w-full rounded-full border border-border bg-card/95 py-2.5 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground shadow-sm backdrop-blur transition focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 supports-[backdrop-filter]:bg-card/80"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-3xl bg-card p-8 text-center shadow-[var(--shadow-soft)]">
          <div className="mb-3 text-5xl" aria-hidden>{q ? "🔎" : "🍽️"}</div>
          <h2 className="font-serif text-lg text-foreground">
            {q ? "Nada encontrado" : "Nada por aqui ainda"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {q
              ? "Nenhuma receita bate com a sua busca."
              : "Cole a legenda do próximo Reel e comece."}
          </p>
          {!q && (
            <Link
              to="/importar"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-soft)] transition hover:opacity-90"
            >
              <Sparkles className="h-4 w-4" />
              Importar receita
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((r, i) => (
            <RecipeCard key={r.id} recipe={r} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
