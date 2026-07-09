import { Link } from "@tanstack/react-router";
import { BookOpen, Compass, Sparkles, ShoppingCart, ChefHat } from "lucide-react";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/hooks/use-hydrated";

export function BottomNav() {
  const hydrated = useHydrated();
  const pending = useStore((s) =>
    hydrated ? s.shoppingList.filter((i) => !i.checked).length : 0,
  );

  const item =
    "group flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold text-muted-foreground transition-colors data-[status=active]:text-primary";

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-3"
      style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      aria-label="Navegação principal"
    >
      <div
        className="pointer-events-auto flex w-full max-w-md items-center rounded-full border bg-card/95 px-1.5 py-1 backdrop-blur supports-[backdrop-filter]:bg-card/80"
        style={{ borderColor: "var(--color-border)", boxShadow: "0 10px 30px -8px rgba(231,69,122,0.25)" }}
      >
        <Link to="/" activeOptions={{ exact: true }} className={item} aria-label="Receitas">
          <span className="grid h-7 w-7 place-items-center rounded-full transition-colors group-data-[status=active]:bg-accent">
            <BookOpen className="h-[17px] w-[17px]" />
          </span>
          Receitas
        </Link>

        <Link to="/hoje" className={item} aria-label="Hoje">
          <span className="grid h-7 w-7 place-items-center rounded-full transition-colors group-data-[status=active]:bg-accent">
            <ChefHat className="h-[17px] w-[17px]" />
          </span>
          Hoje
        </Link>

        <Link
          to="/importar"
          aria-label="Importar receita"
          className="-my-4 mx-1 grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-warm)] transition-transform hover:scale-105 active:scale-95"
        >
          <Sparkles className="h-6 w-6" />
        </Link>

        <Link to="/explorar" className={item} aria-label="Explorar">
          <span className="grid h-7 w-7 place-items-center rounded-full transition-colors group-data-[status=active]:bg-accent">
            <Compass className="h-[17px] w-[17px]" />
          </span>
          Explorar
        </Link>

        <Link to="/compras" className={item} aria-label="Compras">
          <span className="relative grid h-7 w-7 place-items-center rounded-full transition-colors group-data-[status=active]:bg-accent">
            <ShoppingCart className="h-[17px] w-[17px]" />
            {pending > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground ring-2 ring-card">
                {pending > 99 ? "99+" : pending}
              </span>
            )}
          </span>
          Compras
        </Link>
      </div>
    </nav>
  );
}
