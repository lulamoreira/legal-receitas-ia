import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";

export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState<boolean>(false);

  useEffect(() => {
    if (useStore.persist?.hasHydrated?.()) {
      setHydrated(true);
      return;
    }
    const unsub = useStore.persist?.onFinishHydration?.(() => setHydrated(true));
    void useStore.persist?.rehydrate?.();
    return () => unsub?.();
  }, []);

  return hydrated;
}
