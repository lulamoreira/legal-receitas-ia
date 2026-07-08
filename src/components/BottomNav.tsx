import { Link } from "@tanstack/react-router";
import { BookOpen, Sparkles, ShoppingCart } from "lucide-react";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/hooks/use-hydrated";

export function BottomNav() {
  const hydrated = useHydrated();
  const pending = useStore((s) =>
    hydrated ? s.shoppingList.filter((i) => !i.checked).length : 0,
  );

  const item = "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium text-muted-foreground transition-colors data-[status=active]:text-primary";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex max-w-md">
        <Link to="/" activeOptions={{ exact: true }} className={item} aria-label="Receitas">
          <BookOpen className="h-5 w-5" />
          Receitas
        </Link>
        <Link to="/importar" className={item} aria-label="Importar">
          <Sparkles className="h-5 w-5" />
          Importar
        </Link>
        <Link to="/compras" className={item} aria-label="Compras">
          <div className="relative">
            <ShoppingCart className="h-5 w-5" />
            {pending > 0 && (
              <span className="absolute -right-2 -top-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {pending}
              </span>
            )}
          </div>
          Compras
        </Link>
      </div>
    </nav>
  );
}
