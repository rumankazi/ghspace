import type { InstallationCoverage } from "@ghspace/core";
import { Building2, CirclePlus, TriangleAlert, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/**
 * What ghspace can actually see.
 *
 * A GitHub App only reaches accounts where it is installed — user access tokens
 * included — so an org the user works in but has not installed on is simply
 * absent from the dashboard. Without this panel that absence looks like a bug
 * rather than a setting.
 */
export function InstallationCoveragePanel({
  coverage,
  canInstall,
}: {
  coverage: InstallationCoverage[];
  /**
   * False when `GH_APP_SLUG` is unset. The control is replaced with an
   * explanation rather than hidden — a missing button reads as a missing
   * feature, when it is really a deployment that is not finished.
   */
  canInstall: boolean;
}) {
  const repositories = coverage.reduce((sum, c) => sum + c.repositoryCount, 0);

  return (
    <section className="border-border bg-card rounded-lg border">
      <header className="border-border flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Where ghspace can see</h2>
        <span className="text-muted-foreground text-xs">
          {coverage.length === 0
            ? "no accounts connected"
            : `${coverage.length} account${coverage.length === 1 ? "" : "s"} · ${repositories} repositor${repositories === 1 ? "y" : "ies"}`}
        </span>
        {canInstall ? (
          // Routed through the app rather than straight to GitHub so the install
          // carries a state parameter and the callback can sync on the way back.
          <a
            href="/api/auth/install"
            className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-xs hover:underline"
          >
            <CirclePlus className="size-3.5" aria-hidden />
            Add an organization
          </a>
        ) : (
          <span className="text-muted-foreground ml-auto text-xs">
            Set <code>GH_APP_SLUG</code> to enable installing
          </span>
        )}
      </header>

      {coverage.length === 0 ? (
        <p className="text-muted-foreground px-4 py-4 text-xs leading-relaxed">
          Nothing is connected yet, so there is nothing to show here.
        </p>
      ) : (
        <>
          <ul className="divide-border divide-y">
            {coverage.map((account) => (
              <li
                key={account.accountLogin}
                className="flex items-center gap-2.5 px-4 py-2.5 text-xs"
              >
                <Avatar className="size-5 shrink-0">
                  {account.accountAvatarUrl ? (
                    <AvatarImage src={account.accountAvatarUrl} alt="" />
                  ) : null}
                  <AvatarFallback className="text-[9px]">
                    {account.accountLogin.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                {account.accountType === "Organization" ? (
                  <Building2 className="text-muted-foreground size-3" aria-label="Organization" />
                ) : (
                  <User className="text-muted-foreground size-3" aria-label="Personal account" />
                )}

                <span className="font-medium">{account.accountLogin}</span>

                <span className="text-muted-foreground">
                  {account.coversAllRepositories
                    ? "all repositories"
                    : `${account.repositoryCount} selected repositor${account.repositoryCount === 1 ? "y" : "ies"}`}
                </span>

                {account.isSuspended ? (
                  <span className="text-warning inline-flex items-center gap-1">
                    <TriangleAlert className="size-3" aria-hidden />
                    Suspended
                  </span>
                ) : null}

                {account.manageUrl ? (
                  <a
                    href={account.manageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground ml-auto hover:underline"
                  >
                    Manage
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground border-border border-t px-4 py-2.5 text-xs leading-relaxed">
            Pull requests from accounts not listed here will not appear, even though you can
            see them on GitHub.
          </p>
        </>
      )}
    </section>
  );
}
