import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { RecipeCard } from "@/components/RecipeCard";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/hooks/use-hydrated";
import { fetchCatalogPage, CATALOG_PAGE_SIZE } from "@/lib/catalog";
import {
  CATEGORIES,
  getCategory,
  matchesCategory,
  normalize,
  type CategorySlug,
} from "@/lib/categories";
import type { Recipe } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/categoria/$slug")({
  component: CategoryPage,
});

function CategoryPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const mine = useStore((s) => s.recipes);
  const category = getCategory(slug);

  const [catalog, setCatalog] = useState<Recipe[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const needsCatalog = slug === "doces" || slug === "salgadas" || slug === "rapidas";

  useEffect(() => {
    if (!needsCatalog) {
      setCatalogLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const all: Recipe[] = [];
        let page = 0;
        // pull up to ~200 items — enough for our current catalog
        while (page < 10) {
          const res = await fetchCatalogPage(page);
          all.push(...res.recipes);
          if (all.length >= res.total || res.recipes.length < CATALOG_PAGE_SIZE) break;
          page++;
        }
        if (alive) setCatalog(all);
      } catch (e) {
        console.error("[categoria] fetch catalog", e);
      } finally {
        if (alive) setCatalogLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [needsCatalog]);

  const filtered = useMemo(() => {
    if (!category) return [];
    const s = slug as CategorySlug;
    const mineMatched = mine.filter((r) => matchesCategory(r, s, true));
    const mineTitles = new Set(mineMatched.map((r) => normalize(r.title)));
    const catalogMatched = needsCatalog
      ? catalog
          .filter((r) => matchesCategory(r, s, false))
          .filter((r) => !mineTitles.has(normalize(r.title)))
      : [];
    // sort mine first (by createdAt desc), then catalog
    const mineSorted = [...mineMatched].sort((a, b) => b.createdAt - a.createdAt);
    const catSorted = [...catalogMatched].sort((a, b) => b.createdAt - a.createdAt);
    return [
      ...mineSorted.map((r) => ({ recipe: r, mine: true })),
      ...catSorted.map((r) => ({ recipe: r, mine: false })),
    ];
  }, [mine, catalog, slug, category, needsCatalog]);

  if (!category) {
    return (
      <div className="px-4 pt-16 text-center">
        <p className="text-muted-foreground">Categoria não encontrada.</p>
        <Link to="/" className="mt-4 inline-block text-sm font-semibold text-primary">
          Voltar
        </Link>
      </div>
    );
  }

  const loading = !hydrated || (needsCatalog && catalogLoading);

  return (
    <div className="px-4 pt-6 pb-6">
      <header className="mb-5 flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/" })}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-card text-foreground shadow-[var(--shadow-soft)] transition hover:bg-accent"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Categoria
          </p>
          <h1 className="font-serif text-2xl leading-tight text-foreground">
            <span className="mr-2" aria-hidden>{category.emoji}</span>
            {category.label}
          </h1>
        </div>
      </header>

      {loading ? (
        <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-[var(--shadow-soft)]">
          Carregando…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl bg-card p-8 text-center shadow-[var(--shadow-soft)]">
          <div className="mb-3 text-5xl" aria-hidden>{category.emoji}</div>
          <p className="text-sm text-muted-foreground">
            {slug === "favoritas"
              ? "Você ainda não favoritou nenhuma receita. Abra uma receita sua e toque na estrela."
              : slug === "minhas"
                ? "Você ainda não salvou nenhuma receita."
                : "Nada nessa categoria por enquanto."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map(({ recipe, mine: isMine }, i) => (
            <RecipeCard
              key={(isMine ? "m-" : "c-") + recipe.id}
              recipe={recipe}
              index={i}
              to={isMine ? "/receita/$id" : "/explorar/$id"}
            />
          ))}
        </div>
      )}

      {/* categories quick switch */}
      <div className="mt-8 flex flex-wrap gap-2">
        {CATEGORIES.filter((c) => c.slug !== slug).map((c) => (
          <Link
            key={c.slug}
            to="/categoria/$slug"
            params={{ slug: c.slug }}
            className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-[var(--shadow-soft)] transition hover:bg-accent"
          >
            <span aria-hidden>{c.emoji}</span>
            {c.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
