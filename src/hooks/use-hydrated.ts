import { useStore } from "@/lib/store";

export function useHydrated(): boolean {
  return useStore((s) => s.hydrated);
}
