import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { BottomNav } from "@/components/BottomNav";
import type { Recipe, ShoppingItem } from "@/lib/types";

const LEGACY_STORAGE_KEY = "receitai-store-v1";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const hydrate = useStore((s) => s.hydrate);
  const importLocalData = useStore((s) => s.importLocalData);
  const hydrated = useStore((s) => s.hydrated);
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    (async () => {
      // 1) Hydrate cloud state
      await hydrate();

      // 2) One-time migration from legacy localStorage store
      if (typeof window === "undefined") return;
      const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return;

      try {
        const parsed = JSON.parse(raw);
        const state = parsed?.state ?? parsed;
        const rawRecipes: Recipe[] = Array.isArray(state?.recipes) ? state.recipes : [];
        const shoppingList: ShoppingItem[] = Array.isArray(state?.shoppingList)
          ? state.shoppingList
          : [];

        // Drop seeded example recipes — they aren't user content.
        const recipes = rawRecipes.filter(
          (r) => typeof r?.id !== "string" || !r.id.startsWith("seed-"),
        );

        // Nothing worth migrating: just clear the legacy blob.
        if (recipes.length === 0 && shoppingList.length === 0) {
          window.localStorage.removeItem(LEGACY_STORAGE_KEY);
          return;
        }

        const result = await importLocalData({ recipes, shoppingList });
        // Only clear legacy data AFTER a successful migration.
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
        // Refresh from server after import
        await hydrate();

        if (result.recipes > 0 || result.items > 0) {
          toast.success(
            `Migrado para a nuvem: ${result.recipes} receita${result.recipes === 1 ? "" : "s"}` +
              (result.items > 0 ? ` e ${result.items} item(ns) de compras.` : "."),
          );
        }
      } catch (e) {
        console.error("[legacy migration]", e);
        toast.error(
          "Não consegui migrar suas receitas antigas agora. Vamos tentar de novo na próxima vez que você abrir o app.",
        );
      }
    })();
  }, [hydrate, importLocalData]);

  return (
    <>
      <div
        className="mx-auto max-w-md"
        style={{ paddingBottom: "calc(7rem + env(safe-area-inset-bottom))" }}
      >
        {hydrated ? (
          <Outlet />
        ) : (
          <div className="flex min-h-[60vh] items-center justify-center px-4">
            <div className="text-center">
              <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              <p className="text-sm text-muted-foreground">Carregando suas receitas…</p>
            </div>
          </div>
        )}
      </div>
      <BottomNav />
    </>
  );
}
