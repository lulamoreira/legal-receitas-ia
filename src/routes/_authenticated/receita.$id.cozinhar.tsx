import { createFileRoute, useNavigate, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/hooks/use-hydrated";

export const Route = createFileRoute("/_authenticated/receita/$id/cozinhar")({
  component: CookMode,
});

function CookMode() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const recipe = useStore((s) => s.recipes.find((r) => r.id === id));
  const [step, setStep] = useState(0);

  // Mantém a tela acesa enquanto o usuário estiver cozinhando.
  useEffect(() => {
    type WakeLockSentinel = { release: () => Promise<void> };
    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    async function acquire() {
      try {
        const nav = navigator as unknown as {
          wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> };
        };
        if (!nav.wakeLock) return;
        sentinel = await nav.wakeLock.request("screen");
      } catch {
        // Sem suporte ou permissão negada — silencioso.
      }
    }

    function onVisibility() {
      if (document.visibilityState === "visible" && !released) {
        void acquire();
      }
    }

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisibility);
      try {
        void sentinel?.release();
      } catch {
        // ignore
      }
    };
  }, []);

  if (!hydrated) {
    return <div className="px-4 pt-16 text-center text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!recipe) throw notFound();
  const total = recipe.steps.length;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-6">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary">Modo cozinha</p>
            <h1 className="font-serif text-lg leading-tight text-foreground">{recipe.title}</h1>
          </div>
          <button
            onClick={() => navigate({ to: "/receita/$id", params: { id } })}
            className="grid h-10 w-10 place-items-center rounded-full bg-card shadow-sm"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="mb-4 flex items-center gap-2">
          {recipe.steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-border"}`}
            />
          ))}
        </div>

        <p className="mb-4 text-sm font-medium text-muted-foreground">
          Passo {step + 1} de {total}
        </p>

        <div className="flex flex-1 items-center">
          <div
            className="w-full rounded-3xl border-2 bg-card p-8 shadow-[var(--shadow-warm)]"
            style={{ borderColor: "#F6D9E3" }}
          >
            <div className="mb-5 grid h-14 w-14 place-items-center rounded-full bg-primary font-serif text-2xl font-bold text-primary-foreground">
              {step + 1}
            </div>
            <p className="font-serif text-2xl font-semibold leading-snug text-foreground">
              {recipe.steps[step]}
            </p>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-border bg-card py-3 text-sm font-semibold text-foreground disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" />
            Anterior
          </button>
          {step < total - 1 ? (
            <button
              onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground"
            >
              Próximo
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => navigate({ to: "/receita/$id", params: { id } })}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground"
            >
              Bom apetite! 🎉
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
