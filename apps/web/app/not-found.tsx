import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Not found · ghspace",
};

/**
 * The root not-found also catches every unmatched URL in the app, so it is
 * seen by signed-in and signed-out people alike. That is why the way out is
 * `/` rather than `/dashboard`: the landing page already knows which of the
 * two you should be looking at and redirects accordingly, so one link is
 * correct for both instead of bouncing half the visitors through a redirect
 * to the page they were not allowed to see.
 */
export default function NotFound() {
  return (
    <main className="animate-content-in mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-3">
        <FileQuestion className="text-muted-foreground size-6" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">This page does not exist</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Nothing in ghspace answers to that address. If you followed a link to a pull
          request, that link points at GitHub — ghspace only keeps a local copy of what
          the accounts you have connected can see.
        </p>
      </div>

      <div>
        <Button asChild>
          <Link href="/">Back to ghspace</Link>
        </Button>
      </div>
    </main>
  );
}
