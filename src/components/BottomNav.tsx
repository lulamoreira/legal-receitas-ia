import { Link } from "@tanstack/react-router";
import { BookOpen, Compass, Sparkles, ShoppingCart } from "lucide-react";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/hooks/use-hydrated";

export function BottomNav() {
  const hydrated = useHydrated();
  const pending = useStore((s) =>
    hydrated ? s.shoppingList.filter((i) => !i.checked).length : 0,
  );

  const item =
    "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-semibold text-muted-foreground transition-colors data-[status=active]:text-primary";

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex justify-center px-4">
      <div
        className="pointer-events-auto flex w-full max-w-md items-center rounded-full border-2 bg-card px-2 py-1"
        style={{ borderColor: "#F6D9E3", boxShadow: "0 10px 30px -8px rgba(231,69,122,0.25)" }}
      >
        <Link to="/" activeOptions={{ exact: true }} className={item} aria-label="Receitas">
          <BookOpen className="h-5 w-5" />
          Receitas
        </Link>

        <Link to="/explorar" className={item} aria-label="Explorar">
          <Compass className="h-5 w-5" />
          Explorar
        </Link>

        <Link
          to="/importar"
          aria-label="Importar"
          className="-my-4 mx-1 grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-warm)] transition hover:opacity-90"
        >
          <Sparkles className="h-6 w-6" />
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
