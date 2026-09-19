import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { NavTabs } from "@/components/nav-tabs";
import { RefreshControl } from "@/components/refresh-control";
import { ThemeToggle } from "@/components/theme-toggle";
import type { SyncState } from "@ghspace/core";

/**
 * The application header, rendered once by `(app)/layout.tsx` and held across
 * every navigation inside it. Nothing here may depend on which route is
 * showing — see `NavTabs` for why.
 */
export function AppNav({
  user,
  sync,
}: {
  user: { githubLogin: string; avatarUrl: string | null };
  sync: SyncState;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-3">
      <NavTabs />

      <RefreshControl sync={sync} />

      <ThemeToggle />

      <form action="/api/auth/logout" method="post">
        <Button type="submit" variant="ghost" size="sm" className="gap-2">
          <Avatar className="size-5">
            {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-[9px]">
              {user.githubLogin.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          Sign out
        </Button>
      </form>
    </header>
  );
}
