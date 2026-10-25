"use client";

// ============ LiveSocialProof ============
// v35.4 (پیشنهاد ۷ سند روانشناسی فروش — Social Proof زنده):
// نوار «۱۲ کسب‌وکار دیگر همین هفته پلن حرفه‌ای گرفتند» در صفحهٔ پلن‌ها.
// داده از /api/pricing/social-proof (واقعی، تجمیعی، بدون نام) — هر واقعیت
// فقط وقتی > 0 باشد نمایش داده می‌شود؛ چرخش هر ۷ ثانیه با انیمیشن نرم.
//
// روانشناسی: دیده‌شدنِ دیگران در حال خرید، قوی‌ترین سیگنال امنیت است —
// مخصوصاً در بازار نرم‌افزار مالی ایران که اعتماد، گلوگاه خرید است.

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Receipt, TrendingUp, ShieldCheck } from "lucide-react";
import { toPersianDigits } from "@/lib/persian";

interface SocialProofData {
 purchasesThisWeek: number;
 topPurchasedPlan: string | null;
 signupsThisWeek: number;
 invoicesThisWeek: number;
 activeBusinesses: number;
 trialActiveNow: number;
}

const PLAN_FA: Record<string, string> = {
 basic: "پایه",
 pro: "حرفه‌ای",
 enterprise: "سازمانی",
 mini: "مینی",
 free: "رایگان",
};

interface Fact {
 icon: React.ComponentType<{ className?: string }>;
 text: string;
}

function buildFacts(d: SocialProofData): Fact[] {
 const facts: Fact[] = [];
 if (d.purchasesThisWeek > 0 && d.topPurchasedPlan) {
  const planFa = PLAN_FA[d.topPurchasedPlan] || d.topPurchasedPlan;
  facts.push({
   icon: TrendingUp,
   text: `${toPersianDigits(d.purchasesThisWeek)} کسب‌وکار دیگر همین هفته پلن ${planFa} گرفت`,
  });
 }
 if (d.trialActiveNow > 0) {
  facts.push({
   icon: Users,
   text: `${toPersianDigits(d.trialActiveNow)} کسب‌وکار همین حالا دورهٔ آزمایش را تجربه می‌کنند`,
  });
 }
 if (d.invoicesThisWeek > 0) {
  facts.push({
   icon: Receipt,
   text: `${toPersianDigits(d.invoicesThisWeek.toLocaleString("en-US").replace(/,/g, "٬"))} فاکتور واقعی این هفته در هوش ثبت شد`,
  });
 }
 if (d.activeBusinesses > 0) {
  facts.push({
   icon: ShieldCheck,
   text: `${toPersianDigits(d.activeBusinesses.toLocaleString("en-US").replace(/,/g, "٬"))} کسب‌وکار فعال روی هوش حسابداری خود را انجام می‌دهند`,
  });
 }
 return facts;
}

export function LiveSocialProof({ className }: { className?: string }) {
 const [facts, setFacts] = React.useState<Fact[]>([]);
 const [index, setIndex] = React.useState(0);

 React.useEffect(() => {
  let cancelled = false;
  (async () => {
   try {
    const res = await fetch("/api/pricing/social-proof", { cache: "no-store" });
    const json = await res.json();
    if (cancelled || !json?.success || !json?.data) return;
    const built = buildFacts(json.data as SocialProofData);
    if (built.length > 0) setFacts(built);
   } catch {
    /* آفلاین — نوار نمایش داده نمی‌شود */
   }
  })();
  return () => {
   cancelled = true;
  };
 }, []);

 // چرخش خودکار واقعیت‌ها
 React.useEffect(() => {
  if (facts.length <= 1) return;
  const id = setInterval(() => {
   setIndex((i) => (i + 1) % facts.length);
  }, 7000);
  return () => clearInterval(id);
 }, [facts.length]);

 if (facts.length === 0) return null;
 const current = facts[index % facts.length];
 const Icon = current.icon;

 return (
  <div
   className={`flex justify-center ${className ?? ""}`}
   aria-label="آمار زندهٔ پلتفرم"
  >
   <div className="inline-flex max-w-full items-center gap-2.5 rounded-full border border-border/80 bg-muted/40 px-4 py-2 backdrop-blur-sm">
    <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
     <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
     <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
    </span>
    <AnimatePresence mode="wait">
     <motion.div
      key={index}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground sm:text-sm"
     >
      <Icon className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <span className="truncate">{current.text}</span>
     </motion.div>
    </AnimatePresence>
    {facts.length > 1 && (
     <div className="hidden shrink-0 items-center gap-1 sm:flex" aria-hidden="true">
      {facts.map((_, i) => (
       <span
        key={i}
        className={`h-1 rounded-full transition-all ${
         i === index % facts.length
          ? "w-4 bg-emerald-500"
          : "w-1.5 bg-border"
        }`}
       />
      ))}
     </div>
    )}
   </div>
  </div>
 );
}
