import { TriangleAlert } from "lucide-react";

/**
 * Shown on every heading that can be shut — bucket, and repository inside it.
 *
 * A failing check or a merge conflict must not be able to hide inside a
 * collapsed section, and sub-dividing by repository adds a second place it
 * could hide, so the count is repeated at both levels rather than only the top.
 */
export function AttentionChip({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <span className="text-destructive inline-flex items-center gap-1 text-xs">
      <TriangleAlert className="size-3" aria-hidden />
      {count} need{count === 1 ? "s" : ""} attention
    </span>
  );
}
