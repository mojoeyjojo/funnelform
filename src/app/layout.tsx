import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import TransferCompleter from "@/components/TransferCompleter";

// Type system: Geist for all UI text (variable weight, covers 400–900) and
// Geist Mono for technical / numeric labels. One family, no serif, no accent.
export const metadata: Metadata = {
  title: "Funnelform: turn your website into a lead-generating quiz",
  description:
    "Paste your link. Watch the funnel build itself. AI turns your site into a complete, publishable quiz funnel in seconds.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`h-full ${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-full">
        <TransferCompleter />
        {children}
      </body>
    </html>
  );
}
