"use client";

// ============ FaqAccordion — پرسش‌های متداول آکاردئونی ============
// v35.6 [استایل]: FAQهای صفحهٔ قیمت از کارت‌های همیشه‌باز به آکاردئون
// تعاملی تبدیل شدند — چگالی بصری کمتر، اسکن‌پذیری بهتر، انیمیشن نرم
// ارتفاع Radix + چرخش چوِران + اولین آیتم باز.
//
// - اولین پرسش به‌صورت پیش‌فرض باز است (نشانه‌گذاری تعامل)
// - کل آیتم قابل کلیک (نه فقط آیکون) — هدف لمس ۴۴px+
// - aria کامل از Radix — کیبورد و صفحه‌خوان
// - RTL: چوِران سمت چپ (انتهای بصری) + متن راست

import * as React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ChevronDown } from "lucide-react";

export interface FaqEntry {
  question: string;
  answer: string;
}

export function FaqAccordion({ items }: { items: FaqEntry[] }) {
  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={items.length > 0 ? "faq-0" : undefined}
      className="space-y-3"
    >
      {items.map((f, i) => (
        <AccordionItem
          key={f.question}
          value={`faq-${i}`}
          className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm transition-colors data-[state=open]:border-primary/30 data-[state=open]:shadow-md data-[state=open]:shadow-primary/5"
        >
          <AccordionTrigger className="gap-3 rounded-none px-5 py-4 text-right text-sm font-bold text-foreground hover:no-underline hover:text-primary sm:text-base [&>svg]:hidden">
            <span className="flex min-w-0 flex-1 items-start gap-3">
              {/* شمارهٔ سوال — لمس بصری */}
              <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-bold tabular-nums text-primary"
                aria-hidden="true"
              >
                {(i + 1).toLocaleString("fa-IR")}
              </span>
              <span className="leading-relaxed">{f.question}</span>
            </span>
            <ChevronDown
              className="h-4 w-4 shrink-0 translate-y-0.5 text-muted-foreground transition-transform duration-300 [[data-state=open]>&]:rotate-180 [[data-state=open]>&]:text-primary"
              aria-hidden="true"
            />
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5 pt-0">
            <p className="border-r-2 border-primary/20 pr-4 text-sm leading-7 text-muted-foreground">
              {f.answer}
            </p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
