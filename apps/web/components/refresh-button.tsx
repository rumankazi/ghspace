"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, RefreshCw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Everything about the GitHub API budget that the button draws, formatted on
 * the server.
 *
 * The numbers arrive as strings rather than as counts to format here, because
 * `toLocaleString` resolves against whichever locale is doing the rendering:
 * the server's during SSR and the reader's browser afterwards. Two different
 * thousands separators for the same number is a hydration mismatch, and one
 * that only shows up on machines configured unlike the developer's.
 */
export interface RefreshBudget {
  /** Share of the budget still available, 0–100, as the button's fill height. */
  percent: number;
  /** Tailwind background class for the fill, tinted by how little is left. */
  tone: string;
  /** The accessible name's budget clause. */
  label: string;
  /** "4,962 of 5,000 points left" */
  counts: string;
  /** "Resets in 41 minutes", or null when no sync has reported one. */
  resets: string | null;
}

/**
 * Refresh, with the GitHub API budget drawn as the button's own fill level and
 * the age of the snapshot as subtext beside it.
 *
 * Three things that used to be three separate pieces of furniture are one
 * control here, because they are one thought: how stale is this, how much
 * budget is there to fix it, and the button that spends the budget to fix it.
 * The fill is the budget *remaining*, so a full button means a full tank.
 *
 * The number of points was never actionable on its own — nobody knows whether
 * 4,962 is a lot — but the fraction is, so the fill is the honest encoding and
 * the exact counts live one hover away.
 *
 * The hover card is the button's alone. Everything worth reading is on it, so
 * there is one target rather than two, and the age beside it carries no tooltip
 * of its own — a bare <span> cannot take keyboard focus, so a tooltip there
 * would have been reachable by mouse only.
 */
export function RefreshButton({
  headline,
  age,
  failed,
  syncing,
  budget,
  className,
}: {
  headline: string;
  age: string;
  failed: boolean;
  /** A sync is already running somewhere — the worker's, or another tab's. */
  syncing: boolean;
  budget: RefreshBudget | null;
  className?: string;
}) {
  const router = useRouter();

  // Two stages of one wait, kept apart because only the first is slow: the
  // sync itself, then the re-render that puts its results on screen. The ring
  // spans both, so it never blinks out in the gap between them.
  const [running, setRunning] = useState(false);
  const [applying, startTransition] = useTransition();
  const busy = running || applying || syncing;

  // The form posts to the route handler on its own without this — that is the
  // no-JavaScript path, and the reason the markup is a form at all. With
  // JavaScript, submitting by hand is what keeps the request off the router's
  // Server Action queue, which is what lets the reader change tabs while the
  // sync runs. See `app/api/refresh/route.ts`.
  async function refresh(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (running) return;

    setRunning(true);

    try {
      await fetch("/api/refresh", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
    } catch {
      // A dropped connection leaves the snapshot exactly as it was. The refresh
      // below re-reads the sync state either way, so whatever did or did not
      // happen server-side is what gets shown.
    } finally {
      setRunning(false);
      // Inside a transition so `applying` stays true until the new tree
      // commits, rather than until the request for it is merely sent.
      startTransition(() => router.refresh());
    }
  }

  return (
    <form
      action="/api/refresh"
      method="post"
      onSubmit={refresh}
      className={cn("flex items-center gap-2", className)}
    >
      <div className="relative flex size-8 shrink-0 items-center justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="submit"
              // The budget stays in the accessible name rather than relying on
              // the tooltip's aria-describedby, which exists only while the
              // card is open. A screen reader user who never triggers the hover
              // should still be told what pressing this will spend.
              aria-label={budget ? `Refresh now. ${budget.label}` : "Refresh now"}
              aria-busy={busy}
              // Not `disabled`: a disabled button fires no pointer events, so
              // the tooltip would go dark at the one moment someone is most
              // likely to hover it asking what is going on. Only this tab's own
              // in-flight request blocks a second press — a sync reported as
              // running elsewhere must not, because a crashed run stays
              // "running" in the database until the reaper times it out, and
              // that is exactly when someone needs this button to work.
              aria-disabled={running}
              className="border-input bg-background hover:bg-accent focus-visible:ring-ring/50 absolute inset-0 flex items-center justify-center overflow-hidden rounded-full border shadow-xs transition-colors outline-none focus-visible:ring-[3px]"
            >
              {/* Decorative: everything it encodes is in the accessible name. */}
              {budget ? (
                <span
                  aria-hidden
                  className={cn("absolute inset-x-0 bottom-0", budget.tone)}
                  style={{ height: `${budget.percent}%` }}
                />
              ) : null}

              {/* Above the fill, and tinted by nothing, so the icon stays the
                  thing you read first at any budget level. */}
              <RefreshCw className="text-foreground relative size-3.5" aria-hidden />
            </button>
          </TooltipTrigger>

          <TooltipContent side="bottom" align="end" className="max-w-56">
            <p className={cn("font-medium", failed && !busy && "text-warning")}>
              {busy ? "Refreshing now…" : headline}
            </p>

            {busy ? (
              <p className="text-muted-foreground">
                Reading every repository ghspace can see. Switching views will not stop it.
              </p>
            ) : null}

            {failed && !busy ? <p className="text-warning">The last refresh failed.</p> : null}

            <p className="text-muted-foreground mt-2 font-medium">GitHub API budget</p>

            {budget ? (
              <>
                <p className="tabular-nums">{budget.counts}</p>
                {budget.resets ? <p className="text-muted-foreground">{budget.resets}</p> : null}
              </>
            ) : (
              // Says why the button is unfilled instead of leaving it a mystery.
              <p className="text-muted-foreground">Unknown until the next sync reports it.</p>
            )}
          </TooltipContent>
        </Tooltip>

        {busy ? <SyncRing /> : null}
      </div>

      {/* Announced once when a refresh starts, and silent otherwise. The age
          beside it is deliberately *not* a live region: it changes on its own
          every time a minute ticks over, and a screen reader saying "6m ago"
          unprompted every sixty seconds is noise, not feedback. */}
      <span className="sr-only" role="status" aria-live="polite">
        {busy ? "Refreshing pull requests" : ""}
      </span>

      <span
        className={cn(
          // A floor rather than a fixed width: it keeps the rest of the nav
          // still as the label swaps between an age and "syncing…", without
          // clipping the longest thing it can say ("never synced").
          "inline-flex min-w-16 items-center gap-1 text-xs tabular-nums",
          failed && !busy ? "text-warning" : "text-muted-foreground",
        )}
      >
        {failed && !busy ? <CircleAlert className="size-3 shrink-0" aria-hidden /> : null}
        {busy ? "syncing…" : age}
      </span>
    </form>
  );
}

/**
 * The ring that says a sync is under way.
 *
 * Deliberately indeterminate. A filling ring would be the better indicator and
 * this is not it, because nothing in the system knows how far along a sync is:
 * the work is one pass per installation over an unknown number of
 * repositories, and only the log sees that count go by. Drawing a bar that
 * crept to 90% and waited would be inventing a number, which is worse than
 * admitting the duration is unknown — so this turns to say *running*, and the
 * word beside it says the same thing for anyone whose system asks motion to
 * stop.
 *
 * It sits outside the button rather than in it because the button clips its
 * children to draw the budget fill, and a ring on the border would be the
 * first thing that clipping ate.
 */
function SyncRing() {
  return (
    <svg
      viewBox="0 0 32 32"
      className="pointer-events-none absolute inset-0 size-8 animate-spin"
      aria-hidden
    >
      {/* r=15 with a 2px stroke lands the ring on the button's own border. */}
      <circle cx="16" cy="16" r="15" fill="none" strokeWidth="2" className="stroke-foreground/10" />
      <circle
        cx="16"
        cy="16"
        r="15"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        // A quarter of the 94.2px circumference, so there is an obvious head
        // and tail to read the rotation by.
        strokeDasharray="24 71"
        className="stroke-foreground/70"
      />
    </svg>
  );
}
