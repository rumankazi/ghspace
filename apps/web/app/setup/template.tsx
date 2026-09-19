/**
 * The same page transition the signed-in views get, kept for this route on its
 * own because the shared one had to move inside `(app)` — a template remounts
 * everything below it, and at the root that meant rebuilding the nav on every
 * tab change.
 *
 * Worth having here rather than leaving the page to its own fade: the dashboard
 * links to /setup when ghspace cannot see any repositories, so this is a route
 * people arrive at by navigation, not only by redirect from GitHub.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
