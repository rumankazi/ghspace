import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "ghspace",
  description: "Your GitHub pull requests, sorted by what actually needs you.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `suppressHydrationWarning` is required, not cosmetic: next-themes writes
    // the class onto <html> from a blocking inline script before React
    // hydrates, so the server markup and the live DOM disagree here by design.
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
