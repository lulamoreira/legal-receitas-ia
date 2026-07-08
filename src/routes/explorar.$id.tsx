import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, BookmarkPlus, ChefHat } from "lucide-react";
import { toast } from "sonner";
import { fetchCatalogRecipe } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/hooks/use-hydrated";
import type { Recipe } from "@/lib/types";

export const Route = createFileRoute("/explorar/$id")({
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
        ingredients: recipe.ingredients.map(({ id: _id, ...rest }) => rest),
        steps: recipe.steps,
      });
      toast.success("Receita salva nas suas receitas!");
      navigate({ to: "/receita/$id", params: { id: saved.id } });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 pt-6 pb-6">
      <div className="mb-4">
        <Link
          to="/explorar"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-card shadow-sm"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
      </div>

      {status === "loading" && (
        <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-[var(--shadow-soft)]">
          Carregando receita…
        </div>
      )}

      {status === "not-found" && (
        <div className="rounded-2xl bg-card p-8 text-center shadow-[var(--shadow-soft)]">
          <div className="mb-2 text-4xl" aria-hidden>🔍</div>
          <p className="text-sm text-muted-foreground">Essa receita não está mais no catálogo.</p>
        </div>
      )}

      {status === "error" && (
        <div className="rounded-2xl bg-card p-8 text-center shadow-[var(--shadow-soft)]">
          <div className="mb-2 text-4xl" aria-hidden>😕</div>
          <p className="text-sm text-muted-foreground">Não consegui carregar essa receita. Tente de novo.</p>
        </div>
      )}

      {status === "ready" && recipe && (
        <>
          <div className="mb-5 flex items-start gap-4">
            <div
              className="grid h-24 w-24 shrink-0 place-items-center rounded-3xl text-6xl shadow-[var(--shadow-soft)]"
              style={{ backgroundColor: "#FFE3EC" }}
              aria-hidden
            >
              {recipe.emoji}
            </div>
            <div className="min-w-0 pt-1">
              <h1 className="font-serif text-2xl font-bold leading-tight text-foreground">{recipe.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{recipe.description}</p>
            </div>
          </div>

          <div className="mb-5 flex flex-wrap gap-1.5">
            <span
              className="rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ backgroundColor: "#FFF0C7", color: "#6B4A06" }}
            >
              ⏱ {recipe.totalMinutes} min
            </span>
            <span
              className="rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ backgroundColor: "#DFF5E9", color: "#14532D" }}
            >
              🍽 {recipe.servings} porções
            </span>
            {recipe.tags.map((t, i) => {
              const p = [
                { bg: "#FFE3EC", fg: "#7B2547" },
                { bg: "#EDE7FB", fg: "#3B2E6B" },
                { bg: "#FFF0C7", fg: "#6B4A06" },
                { bg: "#DFF5E9", fg: "#14532D" },
              ][i % 4]!;
              return (
                <span
                  key={t}
                  className="rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{ backgroundColor: p.bg, color: p.fg }}
                >
                  {t}
                </span>
              );
            })}
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !hydrated}
            className="mb-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            <BookmarkPlus className="h-4 w-4" />
            {saving ? "Salvando…" : "Salvar nas minhas receitas"}
          </button>

          <section className="mb-6 rounded-2xl bg-card p-5 shadow-[var(--shadow-soft)]">
            <h2 className="mb-3 font-serif text-lg text-foreground">Ingredientes</h2>
            <ul className="space-y-2">
              {recipe.ingredients.map((ing) => (
                <li key={ing.id} className="flex items-start gap-2 text-sm text-foreground">
                  <span aria-hidden>{ing.emoji}</span>
                  <span className="flex-1">
                    <span className="font-medium">
                      {ing.quantity} {ing.unit}
                    </span>{" "}
                    {ing.name}
                    {ing.note ? <span className="text-muted-foreground"> ({ing.note})</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl bg-card p-5 shadow-[var(--shadow-soft)]">
            <h2 className="mb-3 flex items-center gap-2 font-serif text-lg text-foreground">
              <ChefHat className="h-4 w-4" />
              Modo de preparo
            </h2>
            <ol className="space-y-3">
              {recipe.steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary font-serif text-sm font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <p className="pt-0.5 text-sm leading-relaxed text-foreground">{s}</p>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
