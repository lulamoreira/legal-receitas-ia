import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Sparkles, Loader2, Check, X, Upload, FileVideo, Type as TypeIcon } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import type { ExtractedRecipe } from "@/lib/types";
import { IngredientRow } from "@/components/IngredientRow";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/importar")({
  component: Importar,
});

const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

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

  const [preview, setPreview] = useState<ExtractedRecipe | null>(null);

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

  function save() {
    if (!preview) return;
    const recipe = addRecipe(preview);
    toast.success("Receita salva!");
    navigate({ to: "/receita/$id", params: { id: recipe.id } });
  }

  const videoBusy = videoPhase !== "idle";

  return (
    <div className="px-4 pt-8 pb-6">
      <header className="mb-6">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">Importar com IA</p>
        <h1 className="mt-1 font-serif text-3xl text-foreground">De qualquer lugar pra sua cozinha</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cole a legenda do Reel ou envie o vídeo direto. A IA organiza tudo em português.
        </p>
      </header>

      {preview ? (
        <PreviewCard preview={preview} onDiscard={() => setPreview(null)} onSave={save} />
      ) : (
        <Tabs defaultValue="text" className="w-full">
          <TabsList className="grid w-full grid-cols-2 rounded-full bg-secondary p-1">
            <TabsTrigger value="text" className="rounded-full data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">
              <TypeIcon className="mr-1.5 h-4 w-4" />
              Colar texto
            </TabsTrigger>
            <TabsTrigger value="video" className="rounded-full data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">
              <FileVideo className="mr-1.5 h-4 w-4" />
              Enviar vídeo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Legenda do post</label>
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
              onClick={extractFromText}
              disabled={textLoading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
            >
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
          </TabsContent>

          <TabsContent value="video" className="mt-5 space-y-4">
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
                  className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center transition hover:border-primary hover:bg-accent/40"
                >
                  <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Escolher vídeo do celular</p>
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
                      <p className="truncate text-sm font-semibold text-foreground">{videoFile.name}</p>
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
                        className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-foreground"
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
                          A IA está transcrevendo o áudio, lendo os textos na tela e observando os ingredientes. Isso pode levar até um minuto.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Link do post <span className="text-muted-foreground">(opcional)</span>
              </label>
              <input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://tiktok.com/…"
                className="w-full rounded-full border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <button
              onClick={extractFromVideo}
              disabled={!videoFile || videoBusy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
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
          onClick={onDiscard}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-border bg-card py-3 text-sm font-semibold text-foreground transition hover:bg-accent"
        >
          <X className="h-4 w-4" />
          Descartar
        </button>
        <button
          onClick={onSave}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
        >
          <Check className="h-4 w-4" />
          Salvar receita
        </button>
      </div>
    </div>
  );
}
