import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { RecipeCard } from "@/components/RecipeCard";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
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

  return (
    <div className="px-4 pt-8 pb-6">
      <header className="mb-6">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">ReceitAI</p>
        <h1 className="mt-1 font-serif text-3xl leading-tight text-foreground">
          Minhas receitas
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {recipes.length} {recipes.length === 1 ? "receita salva" : "receitas salvas"}
        </p>
      </header>

      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome, tag ou ingrediente"
          className="w-full rounded-full border border-border bg-card py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center shadow-[var(--shadow-soft)]">
          <div className="mb-3 text-4xl" aria-hidden>🍽️</div>
          <h2 className="font-serif text-lg text-foreground">Nada por aqui ainda</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {q ? "Nenhuma receita bate com a sua busca." : "Cole a legenda do próximo Reel e comece."}
          </p>
          <Link
            to="/importar"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Sparkles className="h-4 w-4" />
            Importar receita
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      )}
    </div>
  );
}
