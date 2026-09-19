import Link from "next/link";
import type { Route } from "next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { RefreshControl } from "@/components/refresh-control";
import { ThemeToggle } from "@/components/theme-toggle";
import type { SyncState } from "@ghspace/core";
import { cn } from "@/lib/utils";

const TABS: { href: Route; label: string }[] = [
  { href: "/dashboard", label: "Triage" },
  { href: "/pulls", label: "All pull requests" },
];

export function AppNav({
  current,
  user,
  sync,
  refreshAction,
}: {
  current: Route;
  user: { githubLogin: string; avatarUrl: string | null };
  sync: SyncState;
  refreshAction: () => Promise<void>;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-3">
      <nav className="bg-muted mr-auto flex items-center gap-1 rounded-lg p-1" aria-label="Views">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current === tab.href ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1 text-sm transition-colors",
              current === tab.href
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <RefreshControl sync={sync} refreshAction={refreshAction} />

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
