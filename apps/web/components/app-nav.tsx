import Link from "next/link";
import type { Route } from "next";
import { RefreshCw } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SyncStatus } from "@/components/sync-status";
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
    <header className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3">
      <nav className="bg-muted flex items-center gap-1 rounded-lg p-1" aria-label="Views">
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

      <SyncStatus sync={sync} className="mr-auto" />

      <form action={refreshAction}>
        <Button type="submit" variant="outline" size="sm">
          <RefreshCw className="size-3.5" aria-hidden />
          Refresh
        </Button>
      </form>

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
