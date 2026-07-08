import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import type { ExtractedRecipe } from "@/lib/types";
import { IngredientRow } from "@/components/IngredientRow";

export const Route = createFileRoute("/importar")({
  component: Importar,
});

function Importar() {
  const navigate = useNavigate();
  const addRecipe = useStore((s) => s.addRecipe);
  const [caption, setCaption] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ExtractedRecipe | null>(null);

  async function extract() {
    if (!caption.trim()) {
      toast.error("Cole a legenda do post primeiro.");
      return;
    }
    setLoading(true);
    setPreview(null);
    try {
      const res = await fetch("/api/extract-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption, sourceUrl: sourceUrl || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 429) throw new Error("Muitas requisições. Tente novamente em alguns instantes.");
        if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione mais nas configurações.");
        throw new Error(body?.error || "Não consegui extrair essa receita. Tente ajustar o texto.");
      }
      const data = (await res.json()) as ExtractedRecipe;
      setPreview({ ...data, sourceUrl: sourceUrl || data.sourceUrl });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  function save() {
    if (!preview) return;
    const recipe = addRecipe(preview);
    toast.success("Receita salva!");
    navigate({ to: "/receita/$id", params: { id: recipe.id } });
  }

  return (
    <div className="px-4 pt-8 pb-6">
      <header className="mb-6">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">Importar com IA</p>
        <h1 className="mt-1 font-serif text-3xl text-foreground">Cole e organize</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cole a legenda do Reel ou TikTok. A IA cuida do resto — traduz, organiza, categoriza.
        </p>
      </header>

      {!preview && (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Legenda do post
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={9}
              placeholder="Cole aqui a legenda completa, com hashtags, emojis e tudo…"
              className="w-full resize-none rounded-2xl border border-border bg-card p-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Link do post <span className="text-muted-foreground">(opcional)</span>
            </label>
            <input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://instagram.com/reel/…"
              className="w-full rounded-full border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <button
            onClick={extract}
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Extraindo com a IA…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Extrair receita com IA
              </>
            )}
          </button>
        </div>
      )}

      {preview && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-soft)]">
            <div className="mb-3 flex items-start gap-3">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-accent text-4xl" aria-hidden>
                {preview.emoji}
              </div>
              <div className="min-w-0">
                <h2 className="font-serif text-xl leading-tight text-foreground">{preview.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{preview.description}</p>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
              <span className="rounded-full bg-secondary px-2.5 py-1 font-medium text-foreground">
                {preview.totalMinutes} min
              </span>
              <span className="rounded-full bg-secondary px-2.5 py-1 font-medium text-foreground">
                {preview.servings} porções
              </span>
              {preview.tags.map((t) => (
                <span key={t} className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
                  {t}
                </span>
              ))}
            </div>

            <h3 className="mb-1 mt-4 font-serif text-base text-foreground">Ingredientes</h3>
            <ul>
              {preview.ingredients.map((ing, i) => (
                <IngredientRow
                  key={i}
                  ingredient={{ ...ing, id: String(i) }}
                  fromServings={preview.servings}
                  toServings={preview.servings}
                />
              ))}
            </ul>

            <h3 className="mb-2 mt-5 font-serif text-base text-foreground">Modo de preparo</h3>
            <ol className="space-y-3">
              {preview.steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <p className="text-sm leading-relaxed text-foreground">{s}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setPreview(null)}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-border bg-card py-3 text-sm font-semibold text-foreground transition hover:bg-accent"
            >
              <X className="h-4 w-4" />
              Descartar
            </button>
            <button
              onClick={save}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              <Check className="h-4 w-4" />
              Salvar receita
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
