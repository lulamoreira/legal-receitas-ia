import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

type Mode = "signin" | "signup";

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [finalizingOAuth, setFinalizingOAuth] = useState(false);

  useEffect(() => {
    // Detect OAuth return in URL (hash tokens or ?code=)
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const hasHash = hash.includes("access_token=") || hash.includes("type=recovery");
    const hasCode = /[?&]code=/.test(search);
    const isOAuthReturn = hasHash || hasCode;

    // TODO: remover após validar em produção
    if (isOAuthReturn) {
      console.error("[oauth-return] detected", { hasHash, hasCode });
    }

    let cancelled = false;

    async function finalizeOAuth() {
      setFinalizingOAuth(true);
      const start = Date.now();
      const timeoutMs = 5000;
      while (!cancelled && Date.now() - start < timeoutMs) {
        const { data, error } = await supabase.auth.getSession();
        // TODO: remover após validar em produção
        console.error("[oauth-return] poll", {
          hasSession: !!data.session,
          error: error?.message,
        });
        if (data.session) {
          try {
            history.replaceState(null, "", window.location.pathname);
          } catch (e) {
            console.error("[oauth-return] replaceState failed", e);
          }
          if (!cancelled) navigate({ to: "/" });
          return;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!cancelled) {
        // TODO: remover após validar em produção
        console.error("[oauth-return] timeout without session");
        toast.error("Não consegui concluir o login com Google. Tente de novo.");
        setFinalizingOAuth(false);
      }
    }

    if (isOAuthReturn) {
      finalizeOAuth();
    } else {
      // If already signed in, bounce to home (only when NOT finalizing OAuth)
      supabase.auth.getUser().then(({ data }) => {
        if (!cancelled && data.user) navigate({ to: "/" });
      });
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        try {
          history.replaceState(null, "", window.location.pathname);
        } catch {}
        navigate({ to: "/" });
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  async function signInGoogle() {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/auth",
      });
      if (result.error) {
        toast.error("Não consegui entrar com o Google. Tente de novo.");
        console.error(result.error);
        setBusy(false);
      }
      // if redirected or session set, the auth listener above will navigate
    } catch (e) {
      console.error(e);
      toast.error("Algo deu errado.");
      setBusy(false);
    }
  }


  function friendlyError(msg: string): string {
    const m = msg.toLowerCase();
    if (m.includes("already registered") || m.includes("already been registered") || m.includes("user already")) {
      return "Esse e-mail já tem conta. Tenta entrar em vez de criar uma nova?";
    }
    if (m.includes("invalid login") || m.includes("invalid credentials") || m.includes("invalid email or password")) {
      return "E-mail ou senha incorretos.";
    }
    if (m.includes("password") && (m.includes("6") || m.includes("short") || m.includes("at least"))) {
      return "A senha precisa ter pelo menos 6 caracteres.";
    }
    if (m.includes("invalid email") || m.includes("email address")) {
      return "E-mail inválido.";
    }
    return "Algo deu errado. Tenta de novo?";
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    setEmailBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
          toast.error(friendlyError(error.message));
          setEmailBusy(false);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          toast.error(friendlyError(error.message));
          setEmailBusy(false);
          return;
        }
      }
      // onAuthStateChange redirects
    } catch (err) {
      console.error(err);
      toast.error("Algo deu errado. Tenta de novo?");
      setEmailBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10">
      <div className="w-full rounded-3xl bg-card p-8 shadow-[var(--shadow-warm)]">
        <div className="flex flex-col items-center text-center">
          <img
            src="/nona-hero.png"
            alt="Nona Neural"
            width={80}
            height={80}
            className="mb-4 h-20 w-20 drop-shadow-sm"
          />
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Nona Neural
          </p>
          <h1 className="mt-1 font-serif text-3xl leading-tight text-foreground">
            A cozinha da Nona te espera
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Entre pra Nona guardar suas receitas e sua lista de compras — no
            celular, no tablet e no computador.
          </p>
        </div>

        <button
          onClick={signInGoogle}
          disabled={busy || emailBusy}
          className="mt-8 inline-flex w-full items-center justify-center gap-3 rounded-full border border-border bg-white py-3 text-sm font-semibold text-[#3c4043] shadow-sm transition hover:bg-gray-50 disabled:opacity-60"
        >
          <GoogleIcon />
          {busy ? "Entrando…" : "Entrar com Google"}
        </button>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground">ou</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submitEmail} className="flex flex-col gap-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={emailBusy || busy}
            className="w-full rounded-full border border-border bg-background px-4 py-3 text-sm outline-none ring-primary/40 focus:ring-2 disabled:opacity-60"
          />
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="Senha (mín. 6 caracteres)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={emailBusy || busy}
            className="w-full rounded-full border border-border bg-background px-4 py-3 text-sm outline-none ring-primary/40 focus:ring-2 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={emailBusy || busy}
            className="mt-1 inline-flex w-full items-center justify-center rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {emailBusy
              ? mode === "signup" ? "Criando conta…" : "Entrando…"
              : mode === "signup" ? "Criar conta" : "Entrar"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            className="text-sm font-medium text-primary hover:underline"
          >
            {mode === "signup" ? "Já tem conta? Entrar" : "Não tem conta? Criar conta"}
          </button>
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
          Ao entrar, você concorda em salvar suas receitas na nuvem para acessar
          de qualquer dispositivo.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.12c-.22-.66-.35-1.36-.35-2.12s.13-1.46.35-2.12V7.04H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.96l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
    </svg>
  );
}
