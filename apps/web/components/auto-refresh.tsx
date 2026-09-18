"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the server component tree on an interval so the dashboard picks up
 * what the worker has written. This is a cheap Postgres read, not a GitHub call,
 * so polling here costs nothing against the API budget.
 */
export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      // Refreshing a hidden tab wastes work and can pile up while the laptop
      // is asleep; the visibilitychange listener catches up on return.
      if (document.visibilityState === "visible") router.refresh();
    };

    const timer = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, intervalMs]);

  return null;
}
