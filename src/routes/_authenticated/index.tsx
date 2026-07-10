import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/hooks/use-hydrated";
import { UserMenu } from "@/components/UserMenu";
import {
  CATEGORIES,
  matchesCategory,
  normalize,
  type CategorySlug,
} from "@/lib/categories";
import { fetchCatalogPage, CATALOG_PAGE_SIZE } from "@/lib/catalog";
import type { Recipe } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/")({
  component: Index,
});

function Index() {
  const hydrated = useHydrated();
  const recipes = useStore((s) => s.recipes);
  const [catalog, setCatalog] = useState<Recipe[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const all: Recipe[] = [];
        let page = 0;
        while (page < 10) {
          const res = await fetchCatalogPage(page);
          all.push(...res.recipes);
          if (all.length >= res.total || res.recipes.length < CATALOG_PAGE_SIZE) break;
          page++;
        }
        if (alive) setCatalog(all);
      } catch (e) {
        console.error("[home] catalog count", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const counts = useMemo(() => {
    const mineTitles = new Set(recipes.map((r) => normalize(r.title)));
    const map: Record<CategorySlug, number> = {
      minhas: 0,
      favoritas: 0,
      doces: 0,
      salgadas: 0,
      rapidas: 0,
    };
    for (const cat of CATEGORIES) {
      const mineHits = recipes.filter((r) => matchesCategory(r, cat.slug, true)).length;
      let catalogHits = 0;
      if (cat.slug === "doces" || cat.slug === "salgadas" || cat.slug === "rapidas") {
        catalogHits = catalog.filter(
          (r) => matchesCategory(r, cat.slug, false) && !mineTitles.has(normalize(r.title)),
        ).length;
      }
      map[cat.slug] = mineHits + catalogHits;
    }
    return map;
  }, [recipes, catalog]);

  const latest = recipes.slice(0, 5);

  const PASTELS = [
    { bg: "#FFE3EC", fg: "#7B2547" },
    { bg: "#FFF0C7", fg: "#6B4A06" },
    { bg: "#DFF5E9", fg: "#14532D" },
    { bg: "#EDE7FB", fg: "#3B2E6B" },
    { bg: "#FFD9C2", fg: "#7A2E10" },
  ];

  return (
    <div className="px-4 pt-8 pb-6">
      {!hydrated && (
        <div className="sr-only" aria-live="polite">Carregando receitas…</div>
      )}
      <header className="mb-6 flex flex-col items-center text-center">
        <img
          src="/nona-hero.png"
          alt="Nona Neural"
          width={160}
          height={160}
          className="h-40 w-40 drop-shadow-sm"
        />
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Nona Neural</p>
          <h1 className="mt-1 font-serif text-[28px] leading-tight text-foreground">
            O que vamos cozinhar hoje?
          </h1>
        </div>
        <div className="absolute right-4 top-8"><UserMenu /></div>
      </header>

      {latest.length > 0 && (
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

      <section>
        <h2 className="mb-3 font-serif text-lg text-foreground">Categorias</h2>
        <div className="grid grid-cols-2 gap-3">
          {CATEGORIES.map((cat, i) => {
            const p = PASTELS[i % PASTELS.length]!;
            const count = counts[cat.slug];
            return (
              <Link
                key={cat.slug}
                to="/categoria/$slug"
                params={{ slug: cat.slug }}
                className="group relative overflow-hidden rounded-3xl p-4 shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-warm)] focus-visible:-translate-y-0.5"
                style={{ backgroundColor: p.bg }}
              >
                <div className="text-4xl" aria-hidden>{cat.emoji}</div>
                <h3
                  className="mt-3 font-serif text-lg font-bold leading-tight"
                  style={{ color: p.fg }}
                >
                  {cat.label}
                </h3>
                <p
                  className="mt-0.5 text-xs font-medium"
                  style={{ color: p.fg, opacity: 0.75 }}
                >
                  {count} {count === 1 ? "receita" : "receitas"}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
