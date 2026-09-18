import Link from "next/link";
import { getInstallationCoverage } from "@ghspace/core";
import { Building2, CircleCheck, User } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { GitHubMark } from "@/components/github-mark";
import { InstallationCoveragePanel } from "@/components/installation-coverage";
import { requireUser } from "@/lib/current-user";
import { installConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * The step that makes ghspace able to see anything.
 *
 * This exists as a page of its own rather than a banner on the dashboard
 * because, until an installation exists, there is no dashboard to speak of —
 * every bucket is empty for the same single reason, and the only useful thing
 * the interface can do is explain it and offer the fix.
 */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ pending?: string; error?: string }>;
}) {
  const user = await requireUser();

  const [coverage, { pending, error }] = await Promise.all([
    getInstallationCoverage(user.id),
    searchParams,
  ]);

  const canInstall = installConfigured();
  const connected = coverage.length > 0;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {connected ? "Add another account" : "Choose what ghspace can see"}
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          ghspace is a GitHub App, and a GitHub App only sees accounts it has been
          installed on. Installing it is what makes your pull requests appear — it is
          not a permission you have already granted by signing in.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {pending ? (
        <Alert className="mt-6">
          <AlertTitle>Your request went to the organization&rsquo;s owners</AlertTitle>
          <AlertDescription>
            You are not an owner of that organization, so GitHub sent them a request to
            install ghspace instead of installing it straight away. Nothing more to do
            here — its pull requests will appear once a request is approved.
          </AlertDescription>
        </Alert>
      ) : null}

      {canInstall ? (
        <>
          <div className="mt-8">
            <Button asChild size="lg">
              <a href="/api/auth/install">
                <GitHubMark className="size-4" />
                {connected ? "Install on another account" : "Install ghspace on GitHub"}
              </a>
            </Button>
          </div>

          <section className="mt-8 space-y-3">
            <h2 className="text-sm font-medium">What to choose on GitHub</h2>
            <ul className="space-y-2.5 text-sm">
              <Item icon={<User className="size-3.5" aria-hidden />}>
                <strong className="font-medium">Your personal account</strong>, for pull
                requests in your own repositories.
              </Item>
              <Item icon={<Building2 className="size-3.5" aria-hidden />}>
                <strong className="font-medium">Every organization you work in.</strong>{" "}
                Each one is installed separately, and an organization you skip stays
                invisible here even though you can see it on GitHub.
              </Item>
              <Item icon={<CircleCheck className="size-3.5" aria-hidden />}>
                All repositories, or only the ones you pick. Either way you can change it
                later from the same screen.
              </Item>
            </ul>
            <p className="text-muted-foreground text-xs leading-relaxed">
              If you are not an owner of an organization, GitHub will send your request to
              its owners rather than installing it for you.
            </p>
          </section>
        </>
      ) : (
        <Alert variant="destructive" className="mt-8">
          <AlertTitle>This deployment cannot build an install link</AlertTitle>
          <AlertDescription>
            <code>GH_APP_SLUG</code> is not set, so ghspace does not know which GitHub App
            to send you to. Set it to the slug from{" "}
            <code>github.com/settings/apps/&lt;slug&gt;</code> and restart.
          </AlertDescription>
        </Alert>
      )}

      {connected ? (
        <div className="mt-10 space-y-4">
          <InstallationCoveragePanel coverage={coverage} canInstall={canInstall} />
          <Button asChild variant="outline">
            <Link href="/dashboard">Go to ghspace</Link>
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground mt-10 text-xs">
          <Link href="/dashboard" className="hover:text-foreground underline">
            Continue without installing
          </Link>{" "}
          — the dashboard will be empty until ghspace is installed somewhere.
        </p>
      )}
    </main>
  );
}

function Item({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <span className="text-muted-foreground leading-relaxed">{children}</span>
    </li>
  );
}
