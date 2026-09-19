/**
 * The first thing anyone sees.
 *
 * Deliberately not a skeleton: this covers the sign-in page, which is a
 * paragraph and a button rather than a list of data, and a skeleton of prose
 * reads as broken text. A wordmark holding still for a moment does not.
 */
export default function Loading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
      <span className="sr-only" role="status" aria-live="polite">
        Loading ghspace
      </span>
      <p
        className="animate-content-in text-3xl font-semibold tracking-tight opacity-40"
        aria-hidden
      >
        ghspace
      </p>
    </main>
  );
}
