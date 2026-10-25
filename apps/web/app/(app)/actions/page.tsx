import { getActionsOverview } from "@ghspace/core";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RepositoryWorkflowsSection } from "@/components/repository-workflows-section";
import { requireUser } from "@/lib/current-user";

// Reads a per-user snapshot behind a cookie, so there is nothing to cache.
export const dynamic = "force-dynamic";

/**
 * Default-branch workflow state across every repository this user can see.
 *
 * Deliberately not a run feed. GitHub already lists runs per repository; what
 * it has no page for is the one question an account-wide view can answer —
 * whether anything is broken right now — so the page is a roll-up of latest
 * verdicts, failing repositories first.
 *
 * Pull request checks are not shown here even though they are workflow runs
 * too: they belong to a pull request, both pull request views already carry
 * them, and mixing them in would mean a red row that nobody has merged yet.
 */
export default async function ActionsPage() {
  const user = await requireUser();
  const overview = await getActionsOverview(user.id);
  const { counts } = overview;

  return (
    <div className="animate-content-in">
      {overview.sync.status === "failed" && overview.sync.error ? (
        <Alert className="mb-6">
          <AlertTitle>Workflow state is not being refreshed</AlertTitle>
          <AlertDescription>
            {overview.sync.lastSuccessAt
              ? "Showing the last good snapshot. ghspace will retry automatically."
              : "No workflow runs have been stored yet."}{" "}
            <span className="text-muted-foreground">{overview.sync.error}</span>
          </AlertDescription>
        </Alert>
      ) : null}

      {counts.repositories > 0 ? (
        <>
          <p className="text-muted-foreground mb-2 text-xs tabular-nums">
            {counts.failing > 0 ? (
              <span className="text-destructive font-medium">
                {counts.failing} repositor{counts.failing === 1 ? "y" : "ies"} failing
              </span>
            ) : (
              <span className="text-success font-medium">Nothing failing</span>
            )}
            {counts.running > 0 ? ` · ${counts.running} running` : ""}
            {` · ${counts.passing} green`}
            {counts.idle > 0 ? ` · ${counts.idle} with no verdict` : ""}
            {` · ${counts.workflows} workflow${counts.workflows === 1 ? "" : "s"} in ${counts.repositories} repositor${counts.repositories === 1 ? "y" : "ies"}`}
            {/* Said rather than left out: a reader who knows they have thirty
                repositories should not have to wonder which ones are missing. */}
            {counts.withoutWorkflows > 0
              ? ` · ${counts.withoutWorkflows} with no workflows`
              : ""}
          </p>

          <div className="space-y-3">
            {overview.repositories.map((group) => (
              <RepositoryWorkflowsSection key={group.repository.id} group={group} />
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          synced={overview.sync.status !== "never"}
          repositories={counts.withoutWorkflows}
        />
      )}
    </div>
  );
}

function EmptyState({ synced, repositories }: { synced: boolean; repositories: number }) {
  // Three causes, and they call for different things from the reader: wait,
  // grant a permission, or nothing at all.
  if (!synced) {
    return (
      <Empty
        title="Workflow runs have not been collected yet"
        body="ghspace reads Actions in the background. Use Refresh above to run it now — the GitHub App needs the Actions read permission for this to return anything."
      />
    );
  }

  if (repositories === 0) {
    return (
      <Empty
        title="No repositories to report on"
        body="ghspace has not cached any repositories yet. Check the coverage panel on the triage view."
      />
    );
  }

  return (
    <Empty
      title="No workflows found"
      body={`None of the ${repositories} repositories ghspace can see has an active workflow. If that is a surprise, the GitHub App may be missing the Actions read permission for this account.`}
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
