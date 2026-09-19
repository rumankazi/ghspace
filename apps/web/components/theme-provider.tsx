"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";

/**
 * `next-themes` is a client component, and the root layout is not. This wrapper
 * is the boundary between them — the one thing it adds over the library is
 * `disableTransitionOnChange`, which suppresses the colour transitions on every
 * element for the frame the class actually flips. Without it, switching themes
 * plays a few hundred staggered colour animations at once and reads as a smear.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemeProvider>
  );
}
