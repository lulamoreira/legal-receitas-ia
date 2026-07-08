import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { BottomNav } from "../components/BottomNav";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-7xl text-foreground">404</h1>
        <h2 className="mt-4 font-serif text-xl text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A receita que você procura pode ter escapado da panela.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Voltar para o começo
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-xl text-foreground">Algo desandou no forno</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Deu ruim ao carregar essa página. Tente de novo ou volte ao início.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-accent"
          >
            Início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "ReceitAI — Suas receitas favoritas, organizadas pela IA" },
      {
        name: "description",
        content:
          "Cole a legenda de qualquer Reel ou TikTok de receita e a IA organiza tudo pra você: ingredientes, modo de preparo e lista de compras. Em português.",
      },
      { name: "author", content: "ReceitAI" },
      { property: "og:title", content: "ReceitAI — Suas receitas favoritas, organizadas pela IA" },
      {
        property: "og:description",
        content:
          "Transforme legendas bagunçadas de Reels e TikToks em receitas prontas, com lista de compras por corredor do mercado.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#FAF6EF" },
      { name: "twitter:title", content: "ReceitAI — Suas receitas favoritas, organizadas pela IA" },
      { name: "description", content: "Cole a legenda de qualquer Reel ou TikTok de receita e a IA organiza tudo pra você: ingredientes, modo de preparo e lista de compras. Em português." },
      { property: "og:description", content: "Cole a legenda de qualquer Reel ou TikTok de receita e a IA organiza tudo pra você: ingredientes, modo de preparo e lista de compras. Em português." },
      { name: "twitter:description", content: "Cole a legenda de qualquer Reel ou TikTok de receita e a IA organiza tudo pra você: ingredientes, modo de preparo e lista de compras. Em português." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a32e0228-77ed-4b34-affa-70ef29172494/id-preview-0dc66834--6bc68399-1ea6-4a3a-83be-1cb050224ce2.lovable.app-1783521690357.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a32e0228-77ed-4b34-affa-70ef29172494/id-preview-0dc66834--6bc68399-1ea6-4a3a-83be-1cb050224ce2.lovable.app-1783521690357.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700&family=Inter:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    // Zustand persist is configured with skipHydration to avoid SSR/CSR
    // mismatches; trigger rehydration on the client after mount.
    void import("../lib/store").then((m) => m.useStore.persist.rehydrate());
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background pb-28">
        <div className="mx-auto max-w-md">
          <Outlet />
        </div>
        <BottomNav />
        <Toaster position="top-center" richColors />
      </div>
    </QueryClientProvider>
  );
}
