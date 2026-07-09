import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type UserInfo = { name: string; email: string; avatar?: string };

export function UserMenu() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reset = useStore((s) => s.reset);
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!alive || !data.user) return;
      const meta = data.user.user_metadata ?? {};
      setUser({
        name: (meta.full_name as string) || (meta.name as string) || data.user.email?.split("@")[0] || "Você",
        email: data.user.email ?? "",
        avatar: (meta.avatar_url as string) || (meta.picture as string) || undefined,
      });
    });
    return () => {
      alive = false;
    };
  }, []);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    reset();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const initial = (user?.name ?? "?").trim().charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-accent text-sm font-bold text-accent-foreground ring-2 ring-white transition hover:opacity-90"
          aria-label="Menu do usuário"
        >
          {user?.avatar ? (
            <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span>{initial}</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {user && (
          <>
            <DropdownMenuLabel className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">{user.name}</span>
              <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={signOut} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
