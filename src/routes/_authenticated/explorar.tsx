import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Compass } from "lucide-react";
import { toast } from "sonner";
import { RecipeCard } from "@/components/RecipeCard";
import { CATALOG_PAGE_SIZE, fetchCatalogPage } from "@/lib/catalog";
import type { Recipe } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/explorar")({
  component: Explorar,
});

function Explorar() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchCatalogPage(0)
      .then((res) => {
        if (!alive) return;
        setRecipes(res.recipes);
        setTotal(res.total);
        setPage(0);
      })
      .catch(() => {
        if (!alive) return;
        setError("Não consegui carregar o catálogo. Verifique sua conexão e tente de novo.");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await fetchCatalogPage(next);
      setRecipes((prev) => [...prev, ...res.recipes]);
      setTotal(res.total);
      setPage(next);
    } catch {
      toast.error("Não consegui carregar mais receitas");
    } finally {
      setLoadingMore(false);
    }
  }

  const hasMore = recipes.length < total;

  return (
    <div className="px-4 pt-8 pb-6">
      <header className="mb-6">
        <p className="flex items-center gap-1.5 text-sm font-medium uppercase tracking-wider text-primary">
          <Compass className="h-4 w-4" />
          Explorar
        </p>
        <h1 className="mt-1 font-serif text-3xl leading-tight text-foreground">Catálogo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Receitas prontas pra você salvar e cozinhar.
        </p>
      </header>

      {loading ? (
        <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-[var(--shadow-soft)]">
          Carregando catálogo…
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-card p-8 text-center shadow-[var(--shadow-soft)]">
          <div className="mb-2 text-4xl" aria-hidden>😕</div>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      ) : recipes.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center shadow-[var(--shadow-soft)]">
          <div className="mb-2 text-4xl" aria-hidden>🍽️</div>
          <p className="text-sm text-muted-foreground">Nenhuma receita no catálogo ainda</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {recipes.map((r, i) => (
              <RecipeCard key={r.id} recipe={r} index={i} to="/explorar/$id" />
            ))}
          </div>
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {loadingMore ? "Carregando…" : `Carregar mais (${total - recipes.length} restantes)`}
              </button>
            </div>
          )}
          <p className="mt-4 text-center text-xs text-muted-foreground">
            {recipes.length} de {total} {total === 1 ? "receita" : "receitas"}
            {" · página "}
            {page + 1} · {CATALOG_PAGE_SIZE}/página
          </p>
        </>
      )}
    </div>
  );
}
