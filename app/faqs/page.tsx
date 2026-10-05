import type { Metadata } from "next";

import { SiteHeader } from "@/components/landing/site-header";
import { FaqAccordion } from "@/components/landing/faq-accordion";
import { NewToWeb3 } from "@/components/landing/new-to-web3";
import { SiteFooter } from "@/components/landing/site-footer";
import { RakeBps } from "@/components/common/rake-bps";
import { FAQS } from "@/lib/faqs";

const title = "FAQs";
const description =
  "What a pari-mutuel market is, how to join a $SACH pool on Sachet, how settlement pays winners — plus a primer for first-time wallet users.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/faqs" },
  openGraph: { title, description, url: "/faqs" },
  twitter: { title, description },
};

/** Public FAQ page. Questions live in `lib/faqs.ts`. */
export default function FaqsPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-border">
          <div aria-hidden className="grid-lines absolute inset-0" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-b from-transparent to-background"
          />

          <div className="relative mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:py-20">
            <p className="font-mono text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
              Frequently asked
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
              Everything you need before you stake.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground text-pretty">
              How the pool works, how to join one, and how settlement pays out.
            </p>
            <div className="mt-6">
              <RakeBps />
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:py-20">
          <FaqAccordion />
        </section>

        <NewToWeb3 />
      </main>
      <SiteFooter />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c"),
        }}
      />
    </div>
  );
}
