"use client";

// This file replaces the root layout when it renders, so it has to bring its
// own document and its own stylesheet — nothing above it is left to supply
// them.
import "./globals.css";

/**
 * The last resort: the root layout itself failed.
 *
 * Kept to plain markup with no imports from `components/`, because whatever
 * broke the layout may well be in the same import graph. A link rather than a
 * `retry()`-only screen, since a root layout that throws once usually throws
 * again on the same URL.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground min-h-screen antialiased">
        <title>Something went wrong · ghspace</title>
        <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight">ghspace could not start</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Something failed before any page could be rendered. Reloading is worth one
              try; if it keeps happening, the server log will have the detail.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => retry()}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-md px-4 text-sm font-medium transition-colors"
            >
              Try again
            </button>
            <a
              href="/"
              className="border-border hover:bg-accent inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium transition-colors"
            >
              Back to ghspace
            </a>
          </div>

          {error.digest ? (
            <p className="text-muted-foreground font-mono text-xs">Reference {error.digest}</p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
