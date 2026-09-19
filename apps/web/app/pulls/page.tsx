import Link from "next/link";
import { getFilterOptions, getPullRequests, getSyncState } from "@ghspace/core";
import { AppNav } from "@/components/app-nav";
import { AutoRefresh } from "@/components/auto-refresh";
import { PullRequestFilters } from "@/components/pull-request-filters";
import { RepositorySection } from "@/components/repository-section";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/current-user";
import { refreshNow } from "@/app/dashboard/actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/**
 * Every open pull request this user can see, grouped by repository and
 * filterable.
 *
 * The sync fetches repositories whole rather than asking GitHub about one
 * person, so this view costs nothing extra — the data is already local, and
 * filtering is a database query rather than another API call.
 *
 * The page is a run of whole repositories rather than a slice through all of
 * them (see `getPullRequests`), so "load more" continues where the last section
 * left off instead of reopening repositories already shown.
 */
export default async function PullsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const single = (key: string) => {
    const value = params[key];

    return Array.isArray(value) ? value[0] : value;
  };

  const offset = Number.parseInt(single("offset") ?? "0", 10) || 0;
  const repo = single("repo");
  const author = single("author");
  const draft = single("draft");

  const [page, options, sync] = await Promise.all([
    getPullRequests(user.id, {
      repositoryIds: repo ? [repo] : undefined,
      authors: author ? [author] : undefined,
      query: single("q"),
      scope: single("scope") === "involved" ? "involved" : "all",
      draft: draft === "exclude" || draft === "only" ? draft : "include",
      limit: PAGE_SIZE,
      offset,
    }),
    getFilterOptions(user.id),
    getSyncState(user.id),
  ]);

  const shown = offset + page.count;
  const nextParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && key !== "offset") nextParams.set(key, value);
  }

  nextParams.set("offset", String(offset + PAGE_SIZE));

  return (
    <div className="animate-content-in mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <AutoRefresh />
      <AppNav current="/pulls" user={user} sync={sync} refreshAction={refreshNow} />

      <div className="mb-4">
        <PullRequestFilters options={options} />
      </div>

      {page.total > 0 ? (
        <>
          <p className="text-muted-foreground mb-2 text-xs tabular-nums">
            {page.total.toLocaleString()} open pull request{page.total === 1 ? "" : "s"}
            {page.total > page.count ? ` · showing ${shown.toLocaleString()}` : ""}
            {` · ${page.groups.length.toLocaleString()} repositor${page.groups.length === 1 ? "y" : "ies"} below`}
          </p>

          <div className="space-y-3">
            {page.groups.map((group) => (
              <RepositorySection key={group.repository.id} group={group} />
            ))}
          </div>

          {page.hasMore ? (
            <div className="mt-4 flex justify-center">
              <Button asChild variant="outline" size="sm">
                <Link href={`/pulls?${nextParams.toString()}`}>Load more</Link>
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="border-border text-muted-foreground rounded-lg border border-dashed px-6 py-16 text-center">
          <p className="text-foreground text-sm font-medium">No matching pull requests</p>
          <p className="mx-auto mt-1 max-w-md text-sm">
            {options.repositories.length === 0
              ? "ghspace has not cached any repositories yet. Check the coverage panel on the triage view."
              : "Try widening the filters above."}
          </p>
        </div>
      )}
    </div>
  );
}
