"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FAQ_GROUPS } from "@/lib/faqs";

/**
 * The FAQ list, grouped into the three questions people actually arrive with:
 * what pari-mutuel is, how to join a pool, and how settlement pays out.
 */
export function FaqAccordion() {
  return (
    <div className="flex flex-col gap-14">
      {FAQ_GROUPS.map((group) => (
        <section key={group.title}>
          <h2 className="font-mono text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
            {group.title}
          </h2>

          <Accordion multiple={false} className="mt-4 border-y border-border">
            {group.items.map((item) => (
              <AccordionItem key={item.question} value={item.question}>
                <AccordionTrigger className="rounded-none px-5 py-4 text-base font-medium hover:text-muted-foreground hover:no-underline">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="px-5 pb-6 text-sm leading-relaxed text-muted-foreground text-pretty">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      ))}
    </div>
  );
}
