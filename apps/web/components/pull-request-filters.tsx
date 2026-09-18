"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { FilterOptions } from "@ghspace/core";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Filters over locally cached pull requests.
 *
 * Because the sync fetches repositories whole rather than asking GitHub about
 * one person, narrowing the list costs a database query rather than an API
 * call — so filters can be as generous as the UI wants without any rate limit
 * consequence.
 *
 * State lives in the URL so a filtered view is shareable and survives a reload.
 */
export function PullRequestFilters({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState(params.get("q") ?? "");

  // Keep the box in step when the URL changes from elsewhere — back button,
  // or the "clear" control below.
  useEffect(() => {
    setSearch(params.get("q") ?? "");
  }, [params]);

  const apply = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    // Any filter change invalidates the current page of results.
    next.delete("offset");
    startTransition(() => router.push(`/pulls?${next.toString()}`));
  };

  const set = (key: string, value: string) =>
    apply((next) => (value === "all" || value === "" ? next.delete(key) : next.set(key, value)));

  const hasFilters = ["q", "repo", "author", "scope", "draft"].some((k) => params.get(k));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        className="relative min-w-52 flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          set("q", search);
        }}
      >
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter by title…"
          aria-label="Filter by title"
          className="h-8 pl-8 text-sm"
        />
      </form>

      <Select value={params.get("repo") ?? "all"} onValueChange={(v) => set("repo", v)}>
        <SelectTrigger size="sm" className="w-44" aria-label="Repository">
          <SelectValue placeholder="Repository" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All repositories</SelectItem>
          {options.repositories.map((repo) => (
            <SelectItem key={repo.id} value={repo.id}>
              {repo.nameWithOwner} ({repo.openCount})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={params.get("author") ?? "all"} onValueChange={(v) => set("author", v)}>
        <SelectTrigger size="sm" className="w-40" aria-label="Author">
          <SelectValue placeholder="Author" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All authors</SelectItem>
          {options.authors.map((author) => (
            <SelectItem key={author.login} value={author.login}>
              {author.login} ({author.openCount})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={params.get("scope") ?? "all"} onValueChange={(v) => set("scope", v)}>
        <SelectTrigger size="sm" className="w-36" aria-label="Involvement">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Everyone</SelectItem>
          <SelectItem value="involved">Involves me</SelectItem>
        </SelectContent>
      </Select>

      <Select value={params.get("draft") ?? "include"} onValueChange={(v) => set("draft", v)}>
        <SelectTrigger size="sm" className="w-32" aria-label="Drafts">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="include">With drafts</SelectItem>
          <SelectItem value="exclude">No drafts</SelectItem>
          <SelectItem value="only">Drafts only</SelectItem>
        </SelectContent>
      </Select>

      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => startTransition(() => router.push("/pulls"))}
        >
          <X className="size-3.5" aria-hidden />
          Clear
        </Button>
      ) : null}

      <span
        className="text-muted-foreground text-xs"
        aria-live="polite"
        // Reserve the space so applying a filter does not shift the layout.
        style={{ visibility: isPending ? "visible" : "hidden" }}
      >
        Filtering…
      </span>
    </div>
  );
}
