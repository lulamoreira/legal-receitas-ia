import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ChefHat, Clock, ExternalLink, ShoppingCart, Star, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/hooks/use-hydrated";
import { ServingsStepper } from "@/components/ServingsStepper";
import { IngredientRow } from "@/components/IngredientRow";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/receita/$id")({
  component: RecipeDetail,
  notFoundComponent: () => (
    <div className="px-4 pt-16 text-center">
      <p className="text-muted-foreground">Receita não encontrada.</p>
      <Link to="/" className="mt-4 inline-block text-sm font-semibold text-primary">Voltar</Link>
    </div>
  ),
});

function RecipeDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const recipe = useStore((s) => s.recipes.find((r) => r.id === id));
  const deleteRecipe = useStore((s) => s.deleteRecipe);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const addToList = useStore((s) => s.addRecipeToShoppingList);

  const [servings, setServings] = useState(recipe?.servings ?? 1);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!hydrated) {
    return <div className="px-4 pt-16 text-center text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!recipe) throw notFound();

  function handleDelete() {
    deleteRecipe(recipe!.id);
    toast.success("Receita excluída");
    navigate({ to: "/" });
  }

  function handleAddToList() {
    addToList(recipe!.id, servings);
    toast.success(`Ingredientes adicionados à lista de compras`);
  }

  const hasImage = Boolean(recipe.imageUrl);

  return (
    <div className="pb-6">
      {/* Hero */}
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

        {/* Floating actions */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-4">
          <Link
            to="/"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-card/95 text-foreground shadow-md backdrop-blur transition hover:bg-card"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleFavorite(recipe.id)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-card/95 shadow-md backdrop-blur transition hover:bg-card"
              aria-label={recipe.isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
              aria-pressed={Boolean(recipe.isFavorite)}
            >
              <Star
                className="h-5 w-5"
                style={{
                  color: recipe.isFavorite ? "#E7457A" : "#6b7280",
                  fill: recipe.isFavorite ? "#E7457A" : "transparent",
                }}
              />
            </button>
            <button
              onClick={() => setConfirmOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-card/95 text-destructive shadow-md backdrop-blur transition hover:bg-card"
              aria-label="Excluir receita"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-5">
        <h1 className="font-serif text-[26px] font-bold leading-tight text-foreground">{recipe.title}</h1>
        {recipe.description && (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{recipe.description}</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
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
              <span
                key={t}
                className="rounded-full px-3 py-1.5 font-semibold"
                style={{ backgroundColor: p.bg, color: p.fg }}
              >
                {t}
              </span>
            );
          })}
          {recipe.sourceUrl && (
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 font-semibold text-secondary-foreground transition hover:bg-accent"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Post original
            </a>
          )}
        </div>

        <section className="mt-6 rounded-3xl bg-card p-5 shadow-[var(--shadow-soft)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-lg text-foreground">Ingredientes</h2>
            <ServingsStepper value={servings} onChange={setServings} />
          </div>
          <ul>
            {recipe.ingredients.map((ing) => (
              <IngredientRow
                key={ing.id}
                ingredient={ing}
                fromServings={recipe.servings}
                toServings={servings}
              />
            ))}
          </ul>
          <button
            onClick={handleAddToList}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-soft)] transition hover:opacity-90 active:scale-[0.99]"
          >
            <ShoppingCart className="h-4 w-4" />
            Adicionar à lista de compras
          </button>
        </section>

        <section className="mt-4 rounded-3xl bg-card p-5 shadow-[var(--shadow-soft)]">
          <h2 className="mb-4 font-serif text-lg text-foreground">Modo de preparo</h2>
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
          <Link
            to="/receita/$id/cozinhar"
            params={{ id: recipe.id }}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-soft)] transition hover:opacity-90 active:scale-[0.99]"
          >
            <ChefHat className="h-4 w-4" />
            Cozinhar passo a passo
          </Link>
        </section>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta receita?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
