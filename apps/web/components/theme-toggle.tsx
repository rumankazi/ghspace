"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Light ⇄ dark. The first visit follows the operating system; the first click
 * is what makes the choice explicit and sticky, which is why this flips
 * `resolvedTheme` rather than `theme` — on an unvisited browser `theme` is
 * still "system" and has no side to flip.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  // The server cannot know the reader's system preference, so the icon is not
  // renderable until the client has resolved one. The button ships in its final
  // size either way, so the icon appearing does not move the nav.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dark = resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={mounted ? (dark ? "Switch to light theme" : "Switch to dark theme") : "Switch theme"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {mounted ? (
        dark ? (
          <Moon className="size-4" aria-hidden />
        ) : (
          <Sun className="size-4" aria-hidden />
        )
      ) : null}
    </Button>
  );
}
