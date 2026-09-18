import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ghspace",
  description: "Your GitHub pull requests, sorted by what actually needs you.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
