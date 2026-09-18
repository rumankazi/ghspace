import { getDashboard, getInstallationCoverage } from "@ghspace/core";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AppNav } from "@/components/app-nav";
import { AutoRefresh } from "@/components/auto-refresh";
import { BucketSection } from "@/components/bucket-section";
import { InstallationCoveragePanel } from "@/components/installation-coverage";
import { requireUser } from "@/lib/current-user";
import { installUrl } from "@/lib/env";
import { refreshNow } from "./actions";

// Reads a per-user snapshot behind a cookie, so there is nothing to cache.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();

  const [dashboard, coverage] = await Promise.all([
    getDashboard(user.id),
    getInstallationCoverage(user.id),
  ]);

  const populated = dashboard.buckets.filter((b) => b.pullRequests.length > 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <AutoRefresh />
      <AppNav current="/dashboard" user={user} sync={dashboard.sync} refreshAction={refreshNow} />

      {dashboard.sync.status === "failed" && dashboard.sync.error ? (
        <Alert className="mb-6">
          <AlertTitle>The last refresh did not complete</AlertTitle>
          <AlertDescription>
            {dashboard.sync.lastSuccessAt
              ? "Showing the last good snapshot. ghspace will retry automatically."
              : "No snapshot has been stored yet."}{" "}
            <span className="text-muted-foreground">{dashboard.sync.error}</span>
          </AlertDescription>
        </Alert>
      ) : null}

      {populated.length > 0 ? (
        <div className="space-y-4">
          {populated.map((bucket) => (
            <BucketSection key={bucket.key} bucket={bucket} />
          ))}
        </div>
      ) : (
        <EmptyState
          synced={dashboard.sync.status !== "never"}
          hasCoverage={coverage.length > 0}
        />
      )}

      <div className="mt-8">
        <InstallationCoveragePanel coverage={coverage} installUrl={installUrl()} />
      </div>
    </div>
  );
}

function EmptyState({ synced, hasCoverage }: { synced: boolean; hasCoverage: boolean }) {
  // An empty triage view has three quite different causes, and telling them
  // apart is the difference between "all clear" and "setup is incomplete".
  if (!hasCoverage) {
    return (
      <Empty
        title="ghspace is not installed anywhere yet"
        body="Pull requests only appear for accounts where the app is installed. Install it on your own account and on the organizations you work in, using the panel below."
      />
    );
  }

  if (!synced) {
    return (
      <Empty
        title="No data yet"
        body="The first sync has not run yet. Start the worker, or use Refresh above."
      />
    );
  }

  return (
    <Empty
      title="Nothing needs you right now"
      body="No open pull requests you opened, are assigned to, or have been asked to review. Other people's work is under All pull requests."
    />
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-border text-muted-foreground rounded-lg border border-dashed px-6 py-16 text-center">
      <p className="text-foreground text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm">{body}</p>
    </div>
  );
}
