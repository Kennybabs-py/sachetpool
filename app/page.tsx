import type { Metadata } from "next";

import { SiteHeader } from "@/components/landing/site-header";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Community } from "@/components/landing/community";
import { SiteFooter } from "@/components/landing/site-footer";

export const metadata: Metadata = {
  title: "Sachet — The crowd sets the odds",
  description:
    "Pari-mutuel football prediction markets, staked in $SACH on Robinhood Chain. Winners split the pool; every settlement is verifiable on-chain.",
};

/** Public landing page. The betting board itself lives at `/board`. */
export default function LandingPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <Community />
      </main>
      <SiteFooter />
    </div>
  );
}
