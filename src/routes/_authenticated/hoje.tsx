import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ChefHat, Clock, Loader2, Send, Sparkles, Star, Users, Wine } from "lucide-react";
import { useStore } from "@/lib/store";
import type { ExtractedRecipe, Recipe } from "@/lib/types";
import { getTasteProfile, saveTasteProfile } from "@/lib/taste-profile.functions";
import { IngredientRow } from "@/components/IngredientRow";

export const Route = createFileRoute("/_authenticated/hoje")({
  component: HojeRoute,
});

type Step =
  | "fridge"
  | "protein"
  | "time"
  | "people"
  | "restrictions"
  | "mood"
  | "suggesting"
  | "results"
  | "detail";

type Dish = {
  name: string;
  emoji: string;
  description: string;
  estimatedMinutes: number;
  whyFits: string;
  missingIngredients: string[];
};

type DishDetails = ExtractedRecipe & {
  difficulty: "fácil" | "média" | "elaborada";
  nutritionPerServing: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  substitutions: { ingredient: string; alternatives: string[] }[];
  drinkPairings: string[];
  sourcesConsulted: { title: string; url: string }[];
};

const PROTEIN_CHIPS = ["Frango", "Carne", "Peixe", "Ovos", "Nenhuma"];
const TIME_CHIPS: { label: string; value: number }[] = [
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hora", value: 60 },
  { label: "Sem pressa", value: 120 },
];
const RESTRICTION_CHIPS = [
  "Sem lactose",
  "Sem glúten",
  "Vegetariano",
  "Vegano",
  "Sem açúcar",
];
const MOOD_CHIPS = ["Leve e saudável", "Rápido", "Econômico", "Especial", "Comida de conforto"];

// Detecta proteínas mencionadas em texto livre. Mantém o rótulo original
// (com acento/case bonito) para exibir nos chips e enviar ao endpoint.
const PROTEIN_KEYWORDS: { key: string; label: string }[] = [
  { key: "carne moida", label: "carne moída" },
  { key: "carne bovina", label: "carne bovina" },
  { key: "carne suina", label: "carne suína" },
  { key: "carne de porco", label: "carne de porco" },
  { key: "bife", label: "bife" },
  { key: "boi", label: "boi" },
  { key: "carne", label: "carne" },
  { key: "frango", label: "frango" },
  { key: "peito de frango", label: "peito de frango" },
  { key: "coxa de frango", label: "coxa de frango" },
  { key: "peru", label: "peru" },
  { key: "peixe", label: "peixe" },
  { key: "salmao", label: "salmão" },
  { key: "atum", label: "atum" },
  { key: "tilapia", label: "tilápia" },
  { key: "sardinha", label: "sardinha" },
  { key: "bacalhau", label: "bacalhau" },
  { key: "camarao", label: "camarão" },
  { key: "ovos", label: "ovos" },
  { key: "ovo", label: "ovo" },
  { key: "linguica", label: "linguiça" },
  { key: "salsicha", label: "salsicha" },
  { key: "bacon", label: "bacon" },
  { key: "presunto", label: "presunto" },
  { key: "porco", label: "porco" },
  { key: "lombo", label: "lombo" },
  { key: "costela", label: "costela" },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function detectProteins(text: string): string[] {
  const norm = normalize(text);
  const found: { key: string; label: string }[] = [];
  for (const p of PROTEIN_KEYWORDS) {
    const re = new RegExp(`(^|[^a-z])${p.key.replace(/ /g, "\\s+")}([^a-z]|$)`);
    if (re.test(norm)) found.push(p);
  }
  // Deduplicar: se um label já detectado contém a chave de outro, remove o menor.
  const kept: { key: string; label: string }[] = [];
  for (const p of found) {
    const isSubsumed = found.some((other) => other !== p && other.key.includes(p.key));
    if (!isSubsumed) kept.push(p);
  }
  // Remove duplicatas exatas por label
  const seen = new Set<string>();
  return kept.filter((p) => (seen.has(p.label) ? false : (seen.add(p.label), true))).map((p) => p.label);
}


type Bubble = { role: "vo" | "user"; text: string; key: string };

function VoAvatar() {
  return (
    <div
      className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full shadow-sm"
      style={{ backgroundColor: "#FFE3EC" }}
      aria-hidden
    >
      <img src="/nona-avatar.png" alt="" className="h-full w-full rounded-full object-cover" />
    </div>
  );
}

function Bubbles({ items }: { items: Bubble[] }) {
  return (
    <div className="space-y-3">
      {items.map((b) =>
        b.role === "vo" ? (
          <div key={b.key} className="flex items-end gap-2">
            <VoAvatar />
            <div
              className="max-w-[80%] rounded-3xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed text-foreground"
              style={{ backgroundColor: "#FFF0C7" }}
            >
              {b.text}
            </div>
          </div>
        ) : (
          <div key={b.key} className="flex justify-end">
            <div className="max-w-[80%] rounded-3xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
              {b.text}
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function Typing() {
  return (
    <div className="flex items-end gap-2">
      <VoAvatar />
      <div className="rounded-3xl rounded-bl-md px-4 py-3" style={{ backgroundColor: "#FFF0C7" }}>
        <span className="inline-flex gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/50" style={{ animationDelay: "0ms" }} />
          <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/50" style={{ animationDelay: "120ms" }} />
          <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/50" style={{ animationDelay: "240ms" }} />
        </span>
      </div>
    </div>
  );
}

function HojeRoute() {
  const [step, setStep] = useState<Step>("fridge");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [fridge, setFridge] = useState("");
  const [protein, setProtein] = useState("");
  const [proteinOther, setProteinOther] = useState("");
  const [timeMinutes, setTimeMinutes] = useState(30);
  const [people, setPeople] = useState(2);
  const [restrictions, setRestrictions] = useState<string[]>([]);
  const [mood, setMood] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [likedTitles, setLikedTitles] = useState<string[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
  const [details, setDetails] = useState<DishDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedRecipe, setSavedRecipe] = useState<Recipe | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const addRecipe = useStore((s) => s.addRecipe);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const savedById = useStore((s) => (savedRecipe ? s.recipes.find((r) => r.id === savedRecipe.id) : null));

  // Carregar perfil e primeira fala
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const profile = await getTasteProfile();
        if (!mounted) return;
        if (profile.restrictions.length) setRestrictions(profile.restrictions);
        setLikedTitles(profile.likedDishes.map((d) => d.title));
        const opener: Bubble[] = [
          { role: "vo", text: "Ciao, piccolino! Que bom te ver aqui. 💛", key: "op1" },
          { role: "vo", text: "Conta pra Nona, piccolino: o que tem na sua geladeira e na despensa agora?", key: "op2" },
        ];
        setBubbles(opener);
      } catch (e) {
        console.error(e);
        setBubbles([
          { role: "vo", text: "Oi, meu bem! Conta pra Nona: o que tem na sua geladeira?", key: "op-fb" },
        ]);
      } finally {
        if (mounted) setProfileLoaded(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [bubbles, step, dishes, detailLoading, details]);

  const [detectedProteins, setDetectedProteins] = useState<string[]>([]);

  function push(bubble: Bubble) {
    setBubbles((b) => [...b, bubble]);
  }
  function pushVo(text: string) {
    push({ role: "vo", text, key: `vo-${Date.now()}-${Math.random()}` });
  }
  function pushUser(text: string) {
    push({ role: "user", text, key: `u-${Date.now()}-${Math.random()}` });
  }

  function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function submitFridge() {
    const v = fridge.trim();
    if (!v) {
      toast.error("Me conta o que você tem aí, meu bem.");
      return;
    }
    pushUser(v);
    const detected = detectProteins(v);
    setDetectedProteins(detected);
    setTimeout(() => {
      if (detected.length === 1) {
        pushVo(`Vi que você tem ${detected[0]} — ela vai ser a estrela do prato, piccolino?`);
      } else if (detected.length >= 2) {
        pushVo(`Você me falou de ${detected.join(", ")}. Qual vai ser a estrela do prato?`);
      } else {
        pushVo("Ótimo! Tem alguma proteína aí que você queira usar?");
      }
      setStep("protein");
    }, 250);
  }


  function selectProtein(p: string, displayLabel?: string) {
    setProtein(p);
    pushUser(displayLabel ?? (p || "Sem proteína hoje"));
    setTimeout(() => {
      pushVo("E quanto tempo você tem, meu bem?");
      setStep("time");
    }, 250);
  }


  function submitProteinOther() {
    const v = proteinOther.trim();
    if (!v) return;
    setProtein(v);
    pushUser(v);
    setTimeout(() => {
      pushVo("E quanto tempo você tem, meu bem?");
      setStep("time");
    }, 250);
  }

  function selectTime(t: { label: string; value: number }) {
    setTimeMinutes(t.value);
    pushUser(t.label);
    setTimeout(() => {
      pushVo("Quantas bocas pra alimentar?");
      setStep("people");
    }, 250);
  }

  function submitPeople() {
    pushUser(`${people} ${people === 1 ? "pessoa" : "pessoas"}`);
    setTimeout(() => {
      if (restrictions.length) {
        pushVo(`Da última vez você me disse que ${restrictions.join(", ").toLowerCase()} — continua assim?`);
      } else {
        pushVo("Alguma restrição alimentar? Pode marcar mais de uma.");
      }
      setStep("restrictions");
    }, 250);
  }

  function toggleRestriction(r: string) {
    setRestrictions((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  }

  function submitRestrictions() {
    pushUser(restrictions.length ? restrictions.join(", ") : "Nenhuma");
    setTimeout(() => {
      pushVo("Por último: e o clima de hoje?");
      setStep("mood");
    }, 250);
  }

  async function selectMood(m: string) {
    setMood(m);
    pushUser(m);
    setStep("suggesting");
    setTimeout(() => pushVo("Deixa a Nona pensar… 🤌"), 250);
    try {
      const res = await fetch("/api/suggest-dishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fridge,
          protein: protein || undefined,
          timeMinutes,
          people,
          restrictions,
          mood: m,
          likedDishes: likedTitles,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Erro ao pedir sugestões.");
      setDishes(data.dishes || []);
      setStep("results");
      pushVo("Olha o que a Nona pensou pra você:");
    } catch (e) {
      pushVo(e instanceof Error ? e.message : "Xi, deu um nó aqui. Tenta de novo?");
      setStep("mood");
    }
  }

  async function chooseDish(d: Dish) {
    setSelectedDish(d);
    setDetails(null);
    setSavedRecipe(null);
    setStep("detail");
    setDetailLoading(true);
    try {
      const res = await fetch("/api/dish-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dishName: d.name,
          fridge,
          timeMinutes,
          people,
          restrictions,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Não consegui montar a receita.");
      setDetails(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Xi, deu um nó aqui.");
      setStep("results");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleSave() {
    if (!details || !selectedDish) return;
    setSaving(true);
    try {
      const recipe = await addRecipe(details as ExtractedRecipe);
      setSavedRecipe(recipe);
      toast.success("Salvo no seu caderno! 💛");
      try {
        await saveTasteProfile({ data: { restrictions, chosenDishTitle: selectedDish.name } });
      } catch (e) {
        console.error(e);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu pra salvar.");
    } finally {
      setSaving(false);
    }
  }

  const isFav = Boolean(savedById?.isFavorite);

  if (!profileLoaded) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-6rem)] max-w-md flex-col pb-32">
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 pb-3 pt-4" style={{ backgroundColor: "#FFF8F0" }}>
        {step === "detail" ? (
          <button
            onClick={() => { setStep("results"); setDetails(null); setSelectedDish(null); setSavedRecipe(null); }}
            className="grid h-9 w-9 place-items-center rounded-full bg-card shadow-sm"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : (
          <Link to="/" className="grid h-9 w-9 place-items-center rounded-full bg-card shadow-sm" aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        )}
        <div>
          <h1 className="font-serif text-xl text-foreground">O que eu faço hoje?</h1>
          <p className="text-xs text-muted-foreground">Conversa com a Nona</p>
        </div>
      </header>

      {step === "detail" ? (
        <DetailView
          dish={selectedDish!}
          details={details}
          loading={detailLoading}
          onSave={handleSave}
          saving={saving}
          savedRecipe={savedRecipe}
          isFavorite={isFav}
          onToggleFavorite={() => savedRecipe && toggleFavorite(savedRecipe.id)}
        />
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
            <Bubbles items={bubbles} />
            {step === "suggesting" && (
              <div className="mt-3"><Typing /></div>
            )}
            {step === "results" && dishes.length > 0 && (
              <div className="mt-4 space-y-3">
                {dishes.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => chooseDish(d)}
                    className="w-full rounded-3xl bg-card p-4 text-left shadow-[var(--shadow-soft)] transition hover:scale-[1.01] active:scale-[0.99]"
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl text-2xl leading-none" style={{ backgroundColor: "#FFE3EC" }} aria-hidden>
                        <span className="max-w-full truncate leading-none">{d.emoji}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-serif text-base text-foreground">{d.name}</h3>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{d.description}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold" style={{ backgroundColor: "#FFF0C7", color: "#6B4A06" }}>
                            <Clock className="h-3 w-3" />
                            {d.estimatedMinutes} min
                          </span>
                          {d.missingIngredients.length > 0 && (
                            <span className="rounded-full px-2 py-0.5 font-semibold" style={{ backgroundColor: "#FDE1B0", color: "#7A4A0A" }}>
                              faltam: {d.missingIngredients.slice(0, 3).join(", ")}
                            </span>
                          )}
                        </div>
                        {d.whyFits && (
                          <p className="mt-2 text-xs italic text-foreground/80">👵 {d.whyFits}</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t bg-card/95 px-4 py-3 backdrop-blur" style={{ borderColor: "var(--color-border)" }}>
            {step === "fridge" && (
              <div className="flex items-end gap-2">
                <textarea
                  value={fridge}
                  onChange={(e) => setFridge(e.target.value)}
                  placeholder="Ex: frango, arroz, tomate, cebola, ovos…"
                  className="min-h-[52px] max-h-32 flex-1 resize-none rounded-2xl border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                  style={{ borderColor: "var(--color-border)" }}
                  maxLength={600}
                />
                <button
                  onClick={submitFridge}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm"
                  aria-label="Enviar"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            )}

            {step === "protein" && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {detectedProteins.length === 0 ? (
                    PROTEIN_CHIPS.map((p) => (
                      <Chip key={p} onClick={() => selectProtein(p === "Nenhuma" ? "" : p, p)}>{p}</Chip>
                    ))
                  ) : (
                    <>
                      {detectedProteins.map((p) => (
                        <Chip key={p} onClick={() => selectProtein(capitalize(p))}>{capitalize(p)}</Chip>
                      ))}
                      {detectedProteins.length >= 2 && (
                        <Chip onClick={() => selectProtein(detectedProteins.join(", "))}>Todas</Chip>
                      )}
                      <Chip onClick={() => selectProtein("")}>Sem proteína hoje</Chip>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={proteinOther}
                    onChange={(e) => setProteinOther(e.target.value)}
                    placeholder="Outra…"
                    className="flex-1 rounded-full border bg-card px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                    style={{ borderColor: "var(--color-border)" }}
                  />
                  <button onClick={submitProteinOther} className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground" aria-label="Enviar">
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}


            {step === "time" && (
              <div className="flex flex-wrap gap-2">
                {TIME_CHIPS.map((t) => (
                  <Chip key={t.value} onClick={() => selectTime(t)}>{t.label}</Chip>
                ))}
              </div>
            )}

            {step === "people" && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button onClick={() => setPeople((p) => Math.max(1, p - 1))} className="grid h-9 w-9 place-items-center rounded-full bg-secondary font-bold">−</button>
                  <span className="min-w-[3ch] text-center font-serif text-lg">{people}</span>
                  <button onClick={() => setPeople((p) => Math.min(10, p + 1))} className="grid h-9 w-9 place-items-center rounded-full bg-secondary font-bold">+</button>
                </div>
                <button onClick={submitPeople} className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Continuar</button>
              </div>
            )}

            {step === "restrictions" && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {RESTRICTION_CHIPS.map((r) => (
                    <Chip key={r} active={restrictions.includes(r)} onClick={() => toggleRestriction(r)}>{r}</Chip>
                  ))}
                  <Chip active={restrictions.length === 0} onClick={() => setRestrictions([])}>Nenhuma</Chip>
                </div>
                <div className="flex justify-end">
                  <button onClick={submitRestrictions} className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Continuar</button>
                </div>
              </div>
            )}

            {step === "mood" && (
              <div className="flex flex-wrap gap-2">
                {MOOD_CHIPS.map((m) => (
                  <Chip key={m} onClick={() => selectMood(m)}>{m}</Chip>
                ))}
              </div>
            )}

            {step === "results" && (
              <button
                onClick={() => {
                  setStep("fridge");
                  setBubbles([{ role: "vo", text: "Andiamo de novo! Conta pra Nona: o que tem na sua geladeira?", key: `restart-${Date.now()}` }]);
                  setDishes([]);
                  setFridge("");
                  setProtein("");
                  setMood("");
                }}
                className="w-full rounded-full bg-secondary py-3 text-sm font-semibold text-secondary-foreground"
              >
                <Sparkles className="mr-2 inline h-4 w-4" />
                Recomeçar
              </button>
            )}

            {step === "suggesting" && (
              <div className="text-center text-xs text-muted-foreground">A Nona tá pensando…</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Chip({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border px-4 py-2 text-sm font-semibold transition active:scale-95"
      style={{
        borderColor: active ? "var(--color-primary)" : "var(--color-border)",
        backgroundColor: active ? "var(--color-primary)" : "var(--color-card)",
        color: active ? "var(--color-primary-foreground)" : "var(--color-foreground)",
      }}
    >
      {children}
    </button>
  );
}

function DetailView({
  dish,
  details,
  loading,
  onSave,
  saving,
  savedRecipe,
  isFavorite,
  onToggleFavorite,
}: {
  dish: Dish;
  details: DishDetails | null;
  loading: boolean;
  onSave: () => void;
  saving: boolean;
  savedRecipe: Recipe | null;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  if (loading || !details) {
    return (
      <div className="grid flex-1 place-items-center px-6 py-16 text-center">
        <VoAvatar />
        <p className="mt-4 max-w-xs text-sm text-muted-foreground">
          Vou caçar as melhores versões dessa receita, já volto! Isso pode levar até uns 20 segundinhos.
        </p>
        <Loader2 className="mt-4 h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const servings = details.servings;

  return (
    <div className="px-4 pb-8">
      {details.imageUrl ? (
        <div className="overflow-hidden rounded-3xl">
          <img src={details.imageUrl} alt={details.title} className="aspect-[4/3] w-full object-cover" />
        </div>
      ) : (
        <div className="grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-3xl px-4 text-[6rem] leading-none" style={{ backgroundColor: "#FFE3EC" }} aria-hidden>
          <span className="max-w-full truncate leading-none">{details.emoji || dish.emoji}</span>
        </div>
      )}

      <h2 className="mt-4 font-serif text-2xl text-foreground">{details.title}</h2>
      {details.description && (
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{details.description}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-semibold" style={{ backgroundColor: "#FFF0C7", color: "#6B4A06" }}>
          <Clock className="h-3.5 w-3.5" /> {details.totalMinutes} min
        </span>
        <span className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-semibold" style={{ backgroundColor: "#DFF5E9", color: "#14532D" }}>
          <Users className="h-3.5 w-3.5" /> {servings} porções
        </span>
        <span className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-semibold" style={{ backgroundColor: "#EDE7FB", color: "#3B2E6B" }}>
          <ChefHat className="h-3.5 w-3.5" /> {details.difficulty}
        </span>
      </div>

      <section className="mt-5 rounded-3xl bg-card p-5 shadow-[var(--shadow-soft)]">
        <h3 className="mb-3 font-serif text-lg">Ingredientes</h3>
        <ul>
          {details.ingredients.map((ing) => (
            <IngredientRow key={ing.id ?? ing.name} ingredient={ing} fromServings={servings} toServings={servings} />
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-3xl bg-card p-5 shadow-[var(--shadow-soft)]">
        <h3 className="mb-3 font-serif text-lg">Modo de preparo</h3>
        <ol className="space-y-4">
          {details.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 font-serif text-sm font-bold text-primary">
                {i + 1}
              </span>
              <p className="pt-1 text-sm leading-relaxed text-foreground">{s}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-4 rounded-3xl p-5 shadow-[var(--shadow-soft)]" style={{ backgroundColor: "#DFF5E9" }}>
        <h3 className="font-serif text-lg text-foreground">Nutrição por porção (estimativa)</h3>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          {[
            { label: "kcal", value: details.nutritionPerServing.kcal },
            { label: "prot", value: `${details.nutritionPerServing.proteinG}g` },
            { label: "carb", value: `${details.nutritionPerServing.carbsG}g` },
            { label: "gord", value: `${details.nutritionPerServing.fatG}g` },
          ].map((n) => (
            <div key={n.label} className="rounded-2xl bg-card px-2 py-3">
              <div className="font-serif text-lg text-foreground">{n.value}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{n.label}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-foreground/70">Valores estimados por IA — não use como orientação médica.</p>
      </section>

      {details.substitutions.length > 0 && (
        <section className="mt-4 rounded-3xl bg-card p-5 shadow-[var(--shadow-soft)]">
          <h3 className="mb-3 font-serif text-lg">Se faltar, use no lugar</h3>
          <ul className="space-y-2">
            {details.substitutions.map((s, i) => (
              <li key={i} className="text-sm">
                <span className="font-semibold text-foreground">{s.ingredient}:</span>{" "}
                <span className="text-muted-foreground">{s.alternatives.join(", ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {details.drinkPairings.length > 0 && (
        <section className="mt-4 rounded-3xl p-5 shadow-[var(--shadow-soft)]" style={{ backgroundColor: "#EDE7FB" }}>
          <h3 className="mb-3 flex items-center gap-2 font-serif text-lg text-foreground">
            <Wine className="h-4 w-4" /> Pra acompanhar 🥤
          </h3>
          <ul className="space-y-1.5">
            {details.drinkPairings.map((d, i) => (
              <li key={i} className="text-sm text-foreground">• {d}</li>
            ))}
          </ul>
        </section>
      )}

      {details.sourcesConsulted.length > 0 && (
        <section className="mt-4 rounded-3xl bg-card p-5 shadow-[var(--shadow-soft)]">
          <h3 className="mb-3 font-serif text-lg">Versões que a Nona consultou</h3>
          <ul className="space-y-2">
            {details.sourcesConsulted.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primary underline-offset-2 hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 space-y-3">
        {!savedRecipe ? (
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-soft)] transition hover:opacity-90 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {saving ? "Salvando…" : "Salvar no meu caderno"}
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={onToggleFavorite}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border py-3 text-sm font-semibold"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card)" }}
                aria-pressed={isFavorite}
              >
                <Star className="h-4 w-4" style={{ color: isFavorite ? "#E7457A" : "#6b7280", fill: isFavorite ? "#E7457A" : "transparent" }} />
                {isFavorite ? "Favoritada" : "Favoritar"}
              </button>
              <Link
                to="/receita/$id"
                params={{ id: savedRecipe.id }}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground"
              >
                Abrir receita
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
