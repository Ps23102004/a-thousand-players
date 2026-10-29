import type { Metadata } from "next";
import { Chakra_Petch, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { getSource } from "@/lib/data";
import "./globals.css";

const chakra = Chakra_Petch({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-chakra" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-plex-sans" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono" });

// No force-dynamic here: pages read data/run-main at build time (Vercel Hobby allows 12 functions; see lib/layout-static.test.ts).
// A new data/run-main drop needs a rebuild with `next start`; `next dev` still picks it up per request.

export const metadata: Metadata = {
  title: "A Thousand Players",
  description: "A crowd of Nemotron-driven synthetic players plays your browser game, finds where it breaks, and proves every finding with a replayable seed.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const sample = getSource() === "fixtures";
  return (
    <html lang="en" className={`${chakra.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="brand"><span className="brand-mark" aria-hidden="true" />A Thousand Players</Link>
            <nav className="nav" aria-label="Main">
              <Link href="/#crowd">Crowd</Link>
              <Link href="/#findings">Findings</Link>
              <Link href="/bugs">Bugs</Link>
              <Link href="/games">Games</Link>
              <Link href="/modes/exploit">Exploit</Link>
              <Link href="/modes/repro">Repro</Link>
              <Link href="/modes/balance">Balance</Link>
              <Link href="/modes/advisor">Advisor</Link>
              <Link href="/modes/drift">Spec Drift</Link>
              <Link href="/modes/onboarding">Onboarding</Link>
            </nav>
          </div>
        </header>
        {sample && (
          <div className="sample-banner" role="note">
            <div className="wrap"><strong>Sample data</strong>Generated fixtures, not a real crowd run. Numbers and findings are illustrative.</div>
          </div>
        )}
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <span>A Thousand Players. Open source, MIT license.</span>
            <span>Test bed: Market Brawl. Models: NVIDIA Nemotron on Nebius Token Factory.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
