"use client";

/**
 * ============ WeeklyValueBanner — «گزارش ارزش هفتگی» (v35.2) ============
 * -------------------------------------------------------------------------
 * پیاده‌سازی پیشنهاد شمارهٔ ۳ سند روانشناسی فروش (پیشنهادهای-ارتقا-v35.md):
 * «اثبات ارزش ریالیِ دستیار» — Concrete Value.
 *
 * آخر هر هفته، کاربر «عدد» می‌بیند نه ادعا:
 * «این هفته X فاکتور و Y هزینه و Z کار خودکارِ هوش‌یار — N ساعت کار
 * شما صرفه‌جویی شد؛ ارزش ماهانه: W تومان (بر مبنای حق‌الزحمهٔ دفترداری)».
 *
 * داده از /api/dashboard/value-summary می‌آید — شمارش واقعی رخدادهای DB.
 * برای کاربر پولی هم نمایش داده می‌شود (نگه‌داشت/value reinforcement)،
 * فقط CTA برای تریال است. بنر هر هفته یک‌بار قابل بستن است (۶ روز).
 * =========================================================================
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  TrendingUp,
  FileText,
  Receipt,
  Bot,
  MessageCircle,
  Package,
  Heart,
  Clock,
  X,
  Zap,
  ShieldCheck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/auth-fetch";
import { toPersianDigits, formatToman } from "@/lib/persian";

interface ValueSummaryData {
  isTrial: boolean;
  showBanner: boolean;
  week: {
    invoices: number;
    expenses: number;
    products: number;
    parties: number;
    aiActions: number;
    aiMessages: number;
    minutesSaved: number;
    hoursSaved: number;
  };
  monthValueToman: number;
  hourlyRateToman: number;
  totalMinutesSaved: number;
  totals: { invoices: number; aiActions: number; aiMessages: number };
}

/** کلید ذخیرهٔ بستن بنر — ۶ روز مخفی می‌ماند (نه برای همیشه) */
const DISMISS_KEY = "hoshhesab:value-banner-dismissed-at";
const DISMISS_TTL_MS = 6 * 24 * 60 * 60 * 1000;

/** فرمت ساعت: ۲.۵ → «۲٫۵» با ممیز فارسی */
function faHours(h: number): string {
  const s = (Math.round(h * 10) / 10).toString().replace(".", "٫");
  return toPersianDigits(s);
}

export function WeeklyValueBanner() {
  const [data, setData] = React.useState<ValueSummaryData | null>(null);
  const [dismissedAt, setDismissedAt] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);

  // خواندن وضعیت بستن بنر
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (raw) {
        const t = parseInt(raw, 10);
        if (!Number.isNaN(t) && Date.now() - t < DISMISS_TTL_MS) setDismissedAt(t);
      }
    } catch {
      /* no-op */
    }
  }, []);

  // واکشی با سه تلاش (مقاوم در برابر نوسان شبکه — الگوی trial-progress-card)
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const delays = [0, 3_000, 8_000];
      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (delays[attempt] > 0) await new Promise((r) => setTimeout(r, delays[attempt]));
        if (cancelled) return;
        try {
          const res = await authFetch("/api/dashboard/value-summary", { cache: "no-store" });
          if (!res.ok) continue;
          const json = await res.json();
          if (json?.success && json?.data) {
            if (!cancelled) setData(json.data);
            break;
          }
        } catch {
          /* تلاش بعدی */
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // تازه‌سازی روی رخدادهای موتاسیون (فاکتور/هزینه/کالا/مشتری ثبت شد)
  React.useEffect(() => {
    const events = [
      "hoshhesab:invoices-changed",
      "hoshhesab:parties-changed",
      "hoshhesab:products-changed",
      "hoshhesab:expenses-changed",
    ];
    const refresh = async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 2_500));
        try {
          const res = await authFetch("/api/dashboard/value-summary", { cache: "no-store" });
          if (!res.ok) continue;
          const json = await res.json();
          if (json?.success && json?.data) {
            setData(json.data);
            return;
          }
        } catch {
          /* تلاش بعدی */
        }
      }
    };
    events.forEach((e) => window.addEventListener(e, refresh));
    return () => events.forEach((e) => window.removeEventListener(e, refresh));
  }, []);

  const dismiss = () => {
    const now = Date.now();
    try {
      localStorage.setItem(DISMISS_KEY, String(now));
    } catch {
      /* no-op */
    }
    setDismissedAt(now);
  };

  if (loading || dismissedAt !== null || !data?.showBanner) return null;

  const { week, monthValueToman, isTrial } = data;

  // چیپ‌های آمار — فقط موارد غیرصفر نمایش داده می‌شوند (تمیزی)
  const chips = [
    { icon: FileText, label: "فاکتور", n: week.invoices },
    { icon: Receipt, label: "هزینه", n: week.expenses },
    { icon: Package, label: "کالای جدید", n: week.products },
    { icon: Heart, label: "طرف‌حساب", n: week.parties },
    { icon: Bot, label: "کار خودکار هوش‌یار", n: week.aiActions },
    { icon: MessageCircle, label: "پرسش هوش‌یار", n: week.aiMessages },
  ].filter((c) => c.n > 0);

  const goPricing = () => {
    window.dispatchEvent(
      new CustomEvent("hoshhesab:navigate", {
        detail: { module: "license", action: "upgrade" },
      })
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
      >
        <Card className="relative overflow-hidden border-amber-500/25 shadow-lg shadow-amber-500/5">
          {/* پس‌زمینهٔ گرادیانی گرم (emerald→amber — پالت برند؛ بدون آبی) */}
          <div className="absolute inset-0 bg-gradient-to-l from-amber-500/[0.08] via-emerald-500/[0.05] to-transparent pointer-events-none" />
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, hsl(var(--border)) 1px, transparent 0)",
              backgroundSize: "20px 20px",
              maskImage: "radial-gradient(ellipse at 12% 80%, black 25%, transparent 72%)",
              WebkitMaskImage: "radial-gradient(ellipse at 12% 80%, black 25%, transparent 72%)",
            }}
          />

          <div className="relative p-4 sm:p-5">
            {/* دکمهٔ بستن — ۴۴px هدف لمسی */}
            <button
              type="button"
              onClick={dismiss}
              aria-label="بستن گزارش ارزش (تا هفتهٔ بعد نمایش داده نمی‌شود)"
              title="بستن — تا ۶ روز دیگر دوباره نمایش داده می‌شود"
              className="absolute top-3 left-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-muted/70 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
              {/* ─── راست: عنوان + چیپ‌های آمار واقعی ─── */}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-1.5 mb-1">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  این هفته هوش چقدر برای شما کار کرد؟
                </h3>
                <p className="text-[11px] sm:text-xs text-muted-foreground mb-3 leading-relaxed">
                  گزارش واقعی از فعالیت ۷ روز اخیرِ کسب‌وکار شما — نه تخمین تبلیغاتی.
                </p>

                {/* چیپ‌های شمارش — اسکرول افقی موبایل */}
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {chips.map((c, i) => (
                    <motion.span
                      key={c.label}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.25 + i * 0.06, duration: 0.25 }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/80 px-2.5 py-1 text-[11px] font-medium text-foreground"
                    >
                      <c.icon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="tabular-nums font-extrabold text-emerald-700 dark:text-emerald-400">
                        {toPersianDigits(c.n)}
                      </span>
                      <span className="text-muted-foreground">{c.label}</span>
                    </motion.span>
                  ))}
                </div>
              </div>

              {/* ─── چپ: عدد بزرگ ارزش (قهرمان کارت) ─── */}
              <div className="lg:shrink-0 lg:max-w-[240px] w-full">
                <div className="rounded-2xl border border-amber-500/25 bg-gradient-to-l from-amber-500/[0.08] to-emerald-500/[0.05] p-3.5 sm:p-4">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      ارزش ماهانهٔ این سرعت
                    </span>
                  </div>
                  <motion.p
                    key={monthValueToman}
                    initial={{ scale: 0.94, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.45 }}
                    className="text-xl sm:text-2xl font-extrabold tabular-nums text-foreground leading-tight"
                  >
                    {formatToman(monthValueToman)}
                    <span className="text-xs font-semibold text-muted-foreground ms-1">تومان</span>
                  </motion.p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2">
                    <Badge
                      variant="outline"
                      className="gap-1 text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                    >
                      <Clock className="h-3 w-3" />
                      {faHours(week.hoursSaved)} ساعت صرفه‌جویی این هفته
                    </Badge>
                    <span className="text-[9.5px] text-muted-foreground/80 leading-tight">
                      بر مبنای حق‌الزحمهٔ دفترداری بازار
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── پایین: پیام متفاوت برای تریال در برابر کاربر فعال ─── */}
            <div className="mt-3 pt-3 border-t border-dashed border-border/70">
              {isTrial ? (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                  <p className="flex-1 min-w-0 text-xs font-semibold text-foreground leading-relaxed">
                    این فقط یک هفتهٔ شماست. با پایان تریال، این داده‌ها و همین سرعت
                    <span className="text-amber-600 dark:text-amber-400">
                      {" "}
                      — با تخفیف ۵٪ خرید در ۳ روز اول ثبت‌نام{" "}
                    </span>
                    برای همیشه مال شما می‌ماند.
                  </p>
                  <Button
                    size="sm"
                    className="gap-1.5 shrink-0 bg-gradient-to-l from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white shadow"
                    onClick={goPricing}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    نگه‌داشتن این سرعت
                  </Button>
                </div>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  اشتراک شما فعال است — این گزارش هر هفته همین‌جا به‌روز می‌شود.
                </p>
              )}
            </div>
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
