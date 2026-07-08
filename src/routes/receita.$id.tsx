import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ChefHat, ExternalLink, ShoppingCart, Trash2 } from "lucide-react";
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

export const Route = createFileRoute("/receita/$id")({
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

  return (
    <div className="px-4 pt-6 pb-6">
      <div className="mb-4 flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-card shadow-sm"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <button
          onClick={() => setConfirmOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-card text-destructive shadow-sm"
          aria-label="Excluir receita"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>

      <div className="mb-5 flex items-start gap-4">
        <div className="grid h-24 w-24 shrink-0 place-items-center rounded-3xl bg-accent text-6xl shadow-[var(--shadow-soft)]" aria-hidden>
          {recipe.emoji}
        </div>
        <div className="min-w-0 pt-1">
          <h1 className="font-serif text-2xl leading-tight text-foreground">{recipe.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{recipe.description}</p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
          ⏱ {recipe.totalMinutes} min
        </span>
        {recipe.tags.map((t) => (
          <span key={t} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            {t}
          </span>
        ))}
        {recipe.sourceUrl && (
          <a
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent"
          >
            <ExternalLink className="h-3 w-3" />
            Post original
          </a>
        )}
      </div>

      <section className="mb-6 rounded-2xl bg-card p-5 shadow-[var(--shadow-soft)]">
        <div className="mb-3 flex items-center justify-between gap-2">
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
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
        >
          <ShoppingCart className="h-4 w-4" />
          Adicionar à lista de compras
        </button>
      </section>

      <section className="rounded-2xl bg-card p-5 shadow-[var(--shadow-soft)]">
        <h2 className="mb-3 font-serif text-lg text-foreground">Modo de preparo</h2>
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
        <Link
          to="/receita/$id/cozinhar"
          params={{ id: recipe.id }}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full border border-primary/30 bg-primary/5 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary hover:text-primary-foreground"
        >
          <ChefHat className="h-4 w-4" />
          Cozinhar passo a passo
        </Link>
      </section>

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
