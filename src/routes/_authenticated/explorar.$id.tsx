import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, BookmarkPlus, ChefHat, Clock, Users } from "lucide-react";
import { toast } from "sonner";
import { fetchCatalogRecipe } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/hooks/use-hydrated";
import type { Recipe } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/explorar/$id")({
  component: CatalogRecipeDetail,
});

function CatalogRecipeDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const addRecipe = useStore((s) => s.addRecipe);

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    fetchCatalogRecipe(id)
      .then((r) => {
        if (!alive) return;
        if (!r) {
          setStatus("not-found");
        } else {
          setRecipe(r);
          setStatus("ready");
        }
      })
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, [id]);

  function handleSave() {
    if (!recipe) return;
    setSaving(true);
    try {
      const saved = addRecipe({
        title: recipe.title,
        description: recipe.description,
        emoji: recipe.emoji,
        servings: recipe.servings,
        totalMinutes: recipe.totalMinutes,
        tags: recipe.tags,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
      });
      toast.success("Receita salva nas suas receitas!");
      navigate({ to: "/receita/$id", params: { id: saved.id } });
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="px-4 pt-16 text-center text-sm text-muted-foreground">Carregando receita…</div>
    );
  }

  if (status === "not-found") {
    return (
      <div className="px-4 pt-16">
        <div className="rounded-3xl bg-card p-8 text-center shadow-[var(--shadow-soft)]">
          <div className="mb-2 text-4xl" aria-hidden>🔍</div>
          <p className="text-sm text-muted-foreground">Essa receita não está mais no catálogo.</p>
          <Link to="/explorar" className="mt-4 inline-block rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            Voltar ao catálogo
          </Link>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="px-4 pt-16">
        <div className="rounded-3xl bg-card p-8 text-center shadow-[var(--shadow-soft)]">
          <div className="mb-2 text-4xl" aria-hidden>😕</div>
          <p className="text-sm text-muted-foreground">Não consegui carregar essa receita. Tente de novo.</p>
        </div>
      </div>
    );
  }

  if (!recipe) return null;
  const hasImage = Boolean(recipe.imageUrl);

  return (
    <div className="pb-6">
      <div className="relative">
        <div
          className="relative overflow-hidden"
          style={{ borderBottomLeftRadius: "2rem", borderBottomRightRadius: "2rem" }}
        >
          <div
            className="aspect-[4/3] w-full"
            style={{ backgroundColor: hasImage ? "transparent" : "#FFE3EC" }}
          >
            {hasImage ? (
              <img src={recipe.imageUrl} alt={recipe.title} className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center text-[7rem]" aria-hidden>
                {recipe.emoji}
              </div>
            )}
          </div>
          {hasImage && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/40 to-transparent" />
          )}
        </div>

        <div className="absolute inset-x-0 top-0 flex items-center px-4 pt-4">
          <Link
            to="/explorar"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-card/95 text-foreground shadow-md backdrop-blur transition hover:bg-card"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </div>
      </div>

      <div className="px-4 pt-5">
        <h1 className="font-serif text-[26px] font-bold leading-tight text-foreground">{recipe.title}</h1>
        {recipe.description && (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{recipe.description}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold" style={{ backgroundColor: "#FFF0C7", color: "#6B4A06" }}>
            <Clock className="h-3.5 w-3.5" />
            {recipe.totalMinutes} min
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold" style={{ backgroundColor: "#DFF5E9", color: "#14532D" }}>
            <Users className="h-3.5 w-3.5" />
            {recipe.servings} porções
          </span>
          {recipe.tags.map((t, i) => {
            const p = [
              { bg: "#FFE3EC", fg: "#7B2547" },
              { bg: "#EDE7FB", fg: "#3B2E6B" },
            ][i % 2]!;
            return (
              <span key={t} className="rounded-full px-3 py-1.5 font-semibold" style={{ backgroundColor: p.bg, color: p.fg }}>
                {t}
              </span>
            );
          })}
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !hydrated}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-soft)] transition hover:opacity-90 disabled:opacity-60 active:scale-[0.99]"
        >
          <BookmarkPlus className="h-4 w-4" />
          {saving ? "Salvando…" : "Salvar nas minhas receitas"}
        </button>

        <section className="mt-6 rounded-3xl bg-card p-5 shadow-[var(--shadow-soft)]">
          <h2 className="mb-3 font-serif text-lg text-foreground">Ingredientes</h2>
          <ul className="space-y-2.5">
            {recipe.ingredients.map((ing) => (
              <li key={ing.id} className="flex items-start gap-2.5 text-sm text-foreground">
                <span className="text-base" aria-hidden>{ing.emoji}</span>
                <span className="flex-1 leading-relaxed">
                  <span className="font-semibold">
                    {ing.quantity} {ing.unit}
                  </span>{" "}
                  {ing.name}
                  {ing.note ? <span className="text-muted-foreground"> ({ing.note})</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-4 rounded-3xl bg-card p-5 shadow-[var(--shadow-soft)]">
          <h2 className="mb-4 flex items-center gap-2 font-serif text-lg text-foreground">
            <ChefHat className="h-4 w-4" />
            Modo de preparo
          </h2>
          <ol className="space-y-4">
            {recipe.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 font-serif text-sm font-bold text-primary">
                  {i + 1}
                </span>
                <p className="pt-1 text-sm leading-relaxed text-foreground">{s}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
