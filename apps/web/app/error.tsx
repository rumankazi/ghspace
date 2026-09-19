"use client";

import Link from "next/link";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Catches a render that threw anywhere below the root layout.
 *
 * Nothing is logged from here on purpose: Next already writes server errors to
 * the server log with the same digest shown below, and React reports client
 * ones to the console. A `console.error` here would only add a second, less
 * useful copy.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // Next 16 names this `retry`; it re-fetches and re-renders rather than
  // merely clearing the boundary, which is what a failed database read needs.
  retry: () => void;
}) {
  return (
    <main className="animate-content-in mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-3">
        <TriangleAlert className="text-destructive size-6" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">This page did not load</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          ghspace renders from its own database rather than from the GitHub API, so a
          failure here is usually ghspace being unable to read its cache — not GitHub
          being down. Your pull requests are not affected.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => retry()}>
          <RefreshCw className="size-4" aria-hidden />
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Back to ghspace</Link>
        </Button>
      </div>

      {/* The digest is the only thing that ties this screen to a line in the
          server log — a production build deliberately withholds the message. */}
      {error.digest ? (
        <p className="text-muted-foreground font-mono text-xs">
          Reference {error.digest}
        </p>
      ) : null}
    </main>
  );
}
