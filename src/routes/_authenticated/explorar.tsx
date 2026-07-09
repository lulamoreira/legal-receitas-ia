import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Compass, Plus, Check, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { RecipeCard } from "@/components/RecipeCard";
import { CATALOG_PAGE_SIZE, fetchCatalogPage } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import type { Recipe } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/explorar")({
  component: Explorar,
});

type SearchResult = {
  title: string;
  url: string;
  thumbnailUrl: string | null;
  source:
    | "TudoGostoso"
    | "Guia da Cozinha"
    | "Fritadeira Sem Óleo"
    | "Panelinha"
    | "Receitas Nestlé"
    | "Receitas Globo";
};

type ItemStatus = "idle" | "loading" | "done";

function Explorar() {
  const [mode, setMode] = useState<"catalog" | "ingredient">("catalog");
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
      <header className="mb-4">
        <p className="flex items-center gap-1.5 text-sm font-medium uppercase tracking-wider text-primary">
          <Compass className="h-4 w-4" />
          Explorar
        </p>
        <h1 className="mt-1 font-serif text-3xl leading-tight text-foreground">Catálogo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Receitas prontas pra você salvar e cozinhar.
        </p>
      </header>

      <div className="mb-5 inline-flex rounded-full bg-muted p-1">
        <button
          onClick={() => setMode("catalog")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            mode === "catalog" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          Catálogo
        </button>
        <button
          onClick={() => setMode("ingredient")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            mode === "ingredient" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          Por ingrediente
        </button>
      </div>

      {mode === "catalog" ? (
        loading ? (
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
        )
      ) : (
        <IngredientSearch />
      )}
    </div>
  );
}

function IngredientSearch() {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [itemStatus, setItemStatus] = useState<Record<string, ItemStatus>>({});
  const [savedIds, setSavedIds] = useState<Record<string, string>>({});
  const addRecipe = useStore((s) => s.addRecipe);

  async function runSearch() {
    const ing = query.trim();
    if (!ing) return;
    setLoading(true);
    setResults([]);
    setItemStatus({});
    setSavedIds({});
    setSearched(ing);
    try {
      const res = await fetch("/api/search-recipes-by-ingredient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredient: ing }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Não consegui buscar agora. Tenta de novo?");
        return;
      }
      setResults(data.results ?? []);
    } catch {
      toast.error("Sem conexão? Tenta de novo em instantes.");
    } finally {
      setLoading(false);
    }
  }

  async function importOne(item: SearchResult) {
    setItemStatus((s) => ({ ...s, [item.url]: "loading" }));
    try {
      const res = await fetch("/api/extract-recipe-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: item.url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Não consegui importar essa receita.");
        setItemStatus((s) => ({ ...s, [item.url]: "idle" }));
        return;
      }
      const saved = await addRecipe(data);
      setItemStatus((s) => ({ ...s, [item.url]: "done" }));
      setSavedIds((s) => ({ ...s, [item.url]: saved.id }));
      toast.success("Receita adicionada! 🎉", {
        action: {
          label: "Abrir",
          onClick: () => {
            window.location.href = `/receita/${saved.id}`;
          },
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui importar essa receita.");
      setItemStatus((s) => ({ ...s, [item.url]: "idle" }));
    }
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
        className="mb-4 flex gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ex: banana, frango, chocolate..."
          maxLength={60}
          className="flex-1 rounded-full border border-border bg-card px-4 py-2.5 text-sm outline-none ring-primary/40 focus:ring-2"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          <Search className="h-4 w-4" />
          Buscar
        </button>
      </form>

      {loading ? (
        <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-[var(--shadow-soft)]">
          Buscando receitas com {searched}…
        </div>
      ) : !searched ? (
        <div className="rounded-2xl bg-card p-8 text-center shadow-[var(--shadow-soft)]">
          <div className="mb-2 text-4xl" aria-hidden>🥕</div>
          <p className="text-sm text-muted-foreground">
            Diga o que você tem em casa e a gente busca receitas nos sites mais conhecidos do Brasil.
          </p>
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center shadow-[var(--shadow-soft)]">
          <div className="mb-2 text-4xl" aria-hidden>🔎</div>
          <p className="text-sm text-muted-foreground">
            Não encontramos receitas com isso. Tente outra palavra.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {results.map((r) => {
            const status = itemStatus[r.url] ?? "idle";
            const savedId = savedIds[r.url];
            return (
              <li
                key={r.url}
                className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-[var(--shadow-soft)]"
              >
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-1 items-center gap-3 min-w-0"
                >
                  <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted text-2xl">
                    {r.thumbnailUrl ? (
                      <img
                        src={r.thumbnailUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <span aria-hidden>🍽️</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{r.title}</p>
                    <span className="mt-0.5 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {r.source}
                    </span>
                  </div>
                </a>
                {status === "done" && savedId ? (
                  <Link
                    to="/receita/$id"
                    params={{ id: savedId }}
                    aria-label="Receita salva — abrir"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-green-500 text-white"
                  >
                    <Check className="h-5 w-5" />
                  </Link>
                ) : (
                  <button
                    onClick={() => importOne(r)}
                    disabled={status === "loading"}
                    aria-label="Importar receita"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                  >
                    {status === "loading" ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Plus className="h-5 w-5" />
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
