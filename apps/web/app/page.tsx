import { redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { GitHubMark } from "@/components/github-mark";
import { devLoginEnabled } from "@/lib/env";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSessionUserId()) redirect("/dashboard");
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">ghspace</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Your GitHub pull requests, sorted by what actually needs you — review requests,
          failing checks, and work that is ready to merge, each in its own place.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button asChild size="lg" className="w-full">
        <a href="/api/auth/login">
          <GitHubMark className="size-4" />
          Continue with GitHub
        </a>
      </Button>

      {devLoginEnabled() ? (
        <form action="/api/auth/dev-login" method="post">
          <Button type="submit" variant="outline" size="sm" className="w-full">
            Sign in with seeded data
          </Button>
          <p className="text-muted-foreground mt-2 text-xs">
            Development only. Populate it with <code>bun run seed</code>.
          </p>
        </form>
      ) : null}

      {/* Installation is a second trip through GitHub and surprises people who
          expect signing in to be the whole of it. Saying so up front turns it
          into an expected step rather than an obstacle. */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium">How it works</h2>
        <ol className="text-muted-foreground list-decimal space-y-1.5 pl-4 text-xs leading-relaxed">
          <li>Sign in with your GitHub account.</li>
          <li>
            Choose which account and organizations ghspace should watch. It is a GitHub
            App, so it only sees the ones you install it on.
          </li>
          <li>
            Their open pull requests are cached and sorted, so the dashboard stays up even
            when the GitHub API is not.
          </li>
        </ol>
      </div>
    </main>
  );
}
