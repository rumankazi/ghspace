"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS: { href: Route; label: string }[] = [
  { href: "/dashboard", label: "Triage" },
  { href: "/pulls", label: "All pull requests" },
];

/**
 * The view switcher.
 *
 * Which tab is current has to be read on the client. The nav lives in a layout
 * so that it survives navigation, and a preserved layout is precisely one that
 * Next does *not* re-render when the route below it changes — so a `current`
 * prop passed down from the server would still name the tab the reader arrived
 * on, however many times they switched afterwards.
 */
export function NavTabs() {
  const pathname = usePathname();

  return (
    <nav className="bg-muted mr-auto flex items-center gap-1 rounded-lg p-1" aria-label="Views">
      {TABS.map((tab) => {
        const current = pathname === tab.href;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1 text-sm transition-colors",
              current
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
