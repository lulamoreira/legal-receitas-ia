import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Loader2,
  Check,
  X,
  Upload,
  FileVideo,
  Type as TypeIcon,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import type { ExtractedRecipe } from "@/lib/types";
import { IngredientRow } from "@/components/IngredientRow";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/importar")({
  component: Importar,
});

const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

/**
 * Fixed CTA bar that floats above the BottomNav.
 * BottomNav is ~64px tall with a bottom offset of max(0.75rem, safe-area).
 * We stack this bar right above it, still centered in the max-w-md column.
 */
function StickyCta({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ bottom: "calc(5.25rem + env(safe-area-inset-bottom))" }}
    >
      <div className="pointer-events-auto w-full max-w-md">
        <div className="rounded-full bg-background/85 p-1 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          {children}
        </div>
      </div>
    </div>
  );
}

function Importar() {
  const navigate = useNavigate();
  const addRecipe = useStore((s) => s.addRecipe);

  const [caption, setCaption] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [textLoading, setTextLoading] = useState(false);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPhase, setVideoPhase] = useState<"idle" | "uploading" | "analyzing">("idle");
  const [uploadPct, setUploadPct] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [linkUrl, setLinkUrl] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);

  const [preview, setPreview] = useState<ExtractedRecipe | null>(null);
  const previewAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (preview) {
      previewAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [preview]);

  async function extractFromLink() {
    const trimmed = linkUrl.trim();
    if (!trimmed) {
      toast.error("Cole o link da receita primeiro.");
      return;
    }
    try {
      const u = new URL(trimmed);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    } catch {
      toast.error("Link inválido. Use um endereço http(s) completo.");
      return;
    }
    setLinkLoading(true);
    setPreview(null);
    try {
      const res = await fetch("/api/extract-recipe-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) throw new Error("Muitas requisições. Tente novamente em instantes.");
        if (res.status === 402) throw new Error("Créditos de IA esgotados.");
        throw new Error(data?.error || "Não consegui extrair essa receita.");
      }
      setPreview({ ...data, sourceUrl: trimmed });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLinkLoading(false);
    }
  }

  async function extractFromText() {
    if (!caption.trim()) {
      toast.error("Cole a legenda do post primeiro.");
      return;
    }
    setTextLoading(true);
    setPreview(null);
    try {
      const res = await fetch("/api/extract-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption, sourceUrl: sourceUrl || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) throw new Error("Muitas requisições. Tente novamente em instantes.");
        if (res.status === 402) throw new Error("Créditos de IA esgotados.");
        throw new Error(data?.error || "Não consegui extrair essa receita.");
      }
      setPreview({ ...data, sourceUrl: sourceUrl || data.sourceUrl });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setTextLoading(false);
    }
  }

  function onPickVideo(f: File | null) {
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      toast.error("Selecione um arquivo de vídeo.");
      return;
    }
    if (f.size > MAX_VIDEO_BYTES) {
      toast.error("Vídeo muito grande. Máximo ~25MB (aprox. 90s em MP4).");
      return;
    }
    setVideoFile(f);
  }

  function extractFromVideo() {
    if (!videoFile) return;
    setPreview(null);
    setUploadPct(0);
    setVideoPhase("uploading");

    const form = new FormData();
    form.append("video", videoFile);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/extract-recipe-video");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        setUploadPct(Math.round((ev.loaded / ev.total) * 100));
      }
    };
    xhr.upload.onload = () => setVideoPhase("analyzing");
    xhr.onerror = () => {
      setVideoPhase("idle");
      toast.error("Falha de rede. Tente novamente.");
    };
    xhr.onload = () => {
      setVideoPhase("idle");
      let data: any = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) {
        setPreview({ ...data, sourceUrl: sourceUrl || data.sourceUrl });
      } else {
        toast.error(data?.error || "Não consegui extrair a receita desse vídeo.");
      }
    };
    xhr.send(form);
  }

  async function save() {
    if (!preview) return;
    const cleanUrl = sanitizeHttpUrl(preview.sourceUrl);
    try {
      const recipe = await addRecipe({ ...preview, sourceUrl: cleanUrl });
      toast.success("Receita salva!");
      navigate({ to: "/receita/$id", params: { id: recipe.id } });
    } catch (e) {
      console.error(e);
      toast.error("Não consegui salvar essa receita.");
    }
  }

  function sanitizeHttpUrl(u: string | undefined): string | undefined {
    if (!u) return undefined;
    try {
      const parsed = new URL(u);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.toString();
      }
    } catch {
      // fallthrough
    }
    return undefined;
  }

  const videoBusy = videoPhase !== "idle";

  // Inputs use text-base (16px) to prevent iOS auto-zoom on focus.
  const inputBase =
    "w-full rounded-2xl border border-border bg-card px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

  const primaryBtn =
    "inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-warm)] transition hover:opacity-90 disabled:opacity-60 disabled:shadow-none min-h-[52px]";

  // Extra scroll room so the sticky CTA never covers the last field.
  const stickyScrollPad = { paddingBottom: "5.5rem" };

  return (
    <div className="px-4 pt-8">
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Importar com IA</p>
        <h1 className="mt-1 font-serif text-[26px] leading-tight text-foreground">
          De qualquer lugar pra sua cozinha
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cole a legenda, envie o vídeo ou o link. A Nona organiza tudo em português.
        </p>
      </header>

      <div ref={previewAnchorRef} />

      {preview ? (
        <PreviewCard preview={preview} onDiscard={() => setPreview(null)} onSave={save} />
      ) : (
        <Tabs defaultValue="text" className="w-full">
          <TabsList className="grid w-full grid-cols-3 rounded-full bg-secondary p-1">
            <TabsTrigger
              value="text"
              className="flex-col gap-0.5 rounded-full py-1.5 text-[11px] font-semibold data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm sm:flex-row sm:gap-1.5 sm:text-sm"
            >
              <TypeIcon className="h-4 w-4" />
              Texto
            </TabsTrigger>
            <TabsTrigger
              value="video"
              className="flex-col gap-0.5 rounded-full py-1.5 text-[11px] font-semibold data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm sm:flex-row sm:gap-1.5 sm:text-sm"
            >
              <FileVideo className="h-4 w-4" />
              Vídeo
            </TabsTrigger>
            <TabsTrigger
              value="link"
              className="flex-col gap-0.5 rounded-full py-1.5 text-[11px] font-semibold data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm sm:flex-row sm:gap-1.5 sm:text-sm"
            >
              <Link2 className="h-4 w-4" />
              Link
            </TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="mt-5 space-y-4" style={stickyScrollPad}>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="caption">
                Legenda do post
              </label>
              <textarea
                id="caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={8}
                placeholder="Cole aqui a legenda completa, com hashtags, emojis e tudo…"
                autoCapitalize="sentences"
                autoCorrect="on"
                spellCheck
                enterKeyHint="done"
                className={`${inputBase} resize-none leading-relaxed`}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="text-source">
                Link do post <span className="text-muted-foreground">(opcional)</span>
              </label>
              <input
                id="text-source"
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="url"
                spellCheck={false}
                enterKeyHint="done"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://instagram.com/reel/…"
                className={inputBase}
              />
            </div>

            <StickyCta>
              <button onClick={extractFromText} disabled={textLoading} className={primaryBtn}>
                {textLoading ? (
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
            </StickyCta>
          </TabsContent>

          <TabsContent value="video" className="mt-5 space-y-4" style={stickyScrollPad}>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/*"
                className="hidden"
                onChange={(e) => onPickVideo(e.target.files?.[0] ?? null)}
              />

              {!videoFile ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed bg-card p-8 text-center transition active:scale-[0.99] hover:bg-accent/40"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <div className="grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-warm)]">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-serif text-base font-bold text-foreground">
                      Escolher vídeo do celular
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      MP4 até ~90 segundos · máx. 25MB
                    </p>
                  </div>
                </button>
              ) : (
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent">
                      <FileVideo className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {videoFile.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                      </p>
                    </div>
                    {!videoBusy && (
                      <button
                        onClick={() => {
                          setVideoFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-foreground"
                        aria-label="Remover vídeo"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {videoBusy && (
                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">
                          {videoPhase === "uploading"
                            ? `Enviando vídeo… ${uploadPct}%`
                            : "Assistindo ao vídeo… 🎬"}
                        </span>
                        {videoPhase === "analyzing" && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        )}
                      </div>
                      <Progress
                        value={videoPhase === "uploading" ? uploadPct : undefined}
                        className={videoPhase === "analyzing" ? "animate-pulse" : ""}
                      />
                      {videoPhase === "analyzing" && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          A Nona está transcrevendo o áudio, lendo os textos na tela e observando os ingredientes. Pode levar até um minuto.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="video-source">
                Link do post <span className="text-muted-foreground">(opcional)</span>
              </label>
              <input
                id="video-source"
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="url"
                spellCheck={false}
                enterKeyHint="done"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://tiktok.com/…"
                className={inputBase}
              />
            </div>

            <StickyCta>
              <button
                onClick={extractFromVideo}
                disabled={!videoFile || videoBusy}
                className={primaryBtn}
              >
                {videoBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {videoPhase === "uploading" ? "Enviando…" : "Analisando…"}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Extrair receita do vídeo
                  </>
                )}
              </button>
            </StickyCta>
          </TabsContent>

          <TabsContent value="link" className="mt-5 space-y-4" style={stickyScrollPad}>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="link-url">
                URL da receita
              </label>
              <input
                id="link-url"
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="url"
                spellCheck={false}
                enterKeyHint="go"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://site.com/receita/..."
                className={inputBase}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Funciona melhor em blogs de receita. Sites que carregam por JavaScript podem não abrir.
              </p>
            </div>

            <StickyCta>
              <button onClick={extractFromLink} disabled={linkLoading} className={primaryBtn}>
                {linkLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Lendo a página…
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4" />
                    Extrair receita do link
                  </>
                )}
              </button>
            </StickyCta>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function PreviewCard({
  preview,
  onDiscard,
  onSave,
}: {
  preview: ExtractedRecipe;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4" style={{ paddingBottom: "6rem" }}>
      <div className="overflow-hidden rounded-3xl bg-card shadow-[var(--shadow-soft)]">
        {/* Cabeçalho colorido */}
        <div className="bg-accent px-5 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div
              className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-card text-4xl shadow-[var(--shadow-soft)]"
              aria-hidden
            >
              {preview.emoji}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-serif text-xl leading-tight text-foreground">
                {preview.title}
              </h2>
              {preview.description && (
                <p className="mt-1 text-sm leading-snug text-muted-foreground">
                  {preview.description}
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-full bg-card px-2.5 py-1 font-semibold text-foreground">
              ⏱ {preview.totalMinutes} min
            </span>
            <span className="rounded-full bg-card px-2.5 py-1 font-semibold text-foreground">
              🍽 {preview.servings} {preview.servings === 1 ? "porção" : "porções"}
            </span>
            {preview.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary"
              >
                #{t}
              </span>
            ))}
          </div>
        </div>

        {/* Ingredientes */}
        <section className="px-5 pt-4">
          <h3 className="mb-2 flex items-center gap-2 font-serif text-base text-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            Ingredientes
            <span className="text-xs font-medium text-muted-foreground">
              · {preview.ingredients.length}
            </span>
          </h3>
          <ul className="divide-y divide-border/60">
            {preview.ingredients.map((ing, i) => (
              <IngredientRow
                key={i}
                ingredient={{ ...ing, id: String(i) }}
                fromServings={preview.servings}
                toServings={preview.servings}
              />
            ))}
          </ul>
        </section>

        {/* Modo de preparo */}
        <section className="px-5 pb-5 pt-5">
          <h3 className="mb-3 flex items-center gap-2 font-serif text-base text-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            Modo de preparo
            <span className="text-xs font-medium text-muted-foreground">
              · {preview.steps.length} passos
            </span>
          </h3>
          <ol className="space-y-3.5">
            {preview.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <p className="pt-0.5 text-sm leading-relaxed text-foreground">{s}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* Barra de ação fixa acima do BottomNav */}
      <div
        className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
        style={{ bottom: "calc(5.25rem + env(safe-area-inset-bottom))" }}
      >
        <div className="pointer-events-auto w-full max-w-md">
          <div className="flex gap-2 rounded-full bg-background/85 p-1 backdrop-blur supports-[backdrop-filter]:bg-background/70">
            <button
              onClick={onDiscard}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-border bg-card py-3 text-sm font-semibold text-foreground transition hover:bg-accent min-h-[48px]"
            >
              <X className="h-4 w-4" />
              Descartar
            </button>
            <button
              onClick={onSave}
              className="inline-flex flex-[1.4] items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-warm)] transition hover:opacity-90 min-h-[48px]"
            >
              <Check className="h-4 w-4" />
              Salvar receita
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
