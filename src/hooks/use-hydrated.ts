import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";

export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState<boolean>(() =>
    useStore.persist.hasHydrated(),
  );

  useEffect(() => {
    if (useStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true));
    // Kick off in case rehydrate() hasn't been called yet.
    void useStore.persist.rehydrate();
    return () => unsub();
  }, []);

  return hydrated;
}
