import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LikedDish = { title: string; at: string };
export type TasteProfile = {
  restrictions: string[];
  likedDishes: LikedDish[];
};

export const getTasteProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TasteProfile> => {
    const { data, error } = await context.supabase
      .from("user_taste_profile")
      .select("restrictions, liked_dishes")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { restrictions: [], likedDishes: [] };
    const liked = Array.isArray(data.liked_dishes)
      ? (data.liked_dishes as unknown as LikedDish[])
      : [];
    return {
      restrictions: (data.restrictions ?? []) as string[],
      likedDishes: liked,
    };
  });

export const saveTasteProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        restrictions: z.array(z.string()).max(10).default([]),
        chosenDishTitle: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: existing } = await context.supabase
      .from("user_taste_profile")
      .select("liked_dishes")
      .eq("user_id", context.userId)
      .maybeSingle();
    const prev: LikedDish[] = Array.isArray(existing?.liked_dishes)
      ? (existing!.liked_dishes as unknown as LikedDish[])
      : [];
    let next = prev;
    if (data.chosenDishTitle && data.chosenDishTitle.trim()) {
      const title = data.chosenDishTitle.trim();
      next = [{ title, at: new Date().toISOString() }, ...prev.filter((d) => d.title !== title)].slice(0, 20);
    }
    const { error } = await context.supabase.from("user_taste_profile").upsert(
      {
        user_id: context.userId,
        restrictions: data.restrictions,
        liked_dishes: next as unknown as never,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
