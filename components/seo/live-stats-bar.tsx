"use client";

// ============ LiveStatsBar ============
// v35.5 (پیشنهاد ۷ سند روانشناسی فروش — Social Proof زنده):
// نوار آمار زندهٔ پلتفرم از /api/pricing/social-proof — «X کسب‌وکار فعال،
// Y فاکتور این هفته، Z ثبت‌نام جدید» با شمارندهٔ انیمیت‌شونده و نقطهٔ «زنده».
//
// اصول:
// - صداقت: فقط آمار > 0 نمایش داده می‌شود؛ اگر هیچ داده‌ای نبود، کل نوار
//   رندر نمی‌شود (هرگز عدد ساختگی نمی‌سازیم).
// - مقاوم‌سازی: retry سه‌مرحله‌ای (۰/۳/۸ ثانیه) — با یک نوسان شبکه
//   نوار غیب نمی‌شود؛ تازه‌سازی خودکار هر ۲ دقیقه.
// - دسترس‌پذیری: aria-label کامل + احترام به prefers-reduced-motion
//   (شمارندهٔ انیمیت خاموش می‌شود و عدد مستقیم می‌نشیند).

import * as React from "react";
import {
  Building2,
  FileText,
  UserPlus,
  FlaskConical,
  ShoppingBag,
  Activity,
} from "lucide-react";
import { formatNumber } from "@/lib/persian";

interface SocialProofStats {
  purchasesThisWeek: number;
  topPurchasedPlan: string | null;
  signupsThisWeek: number;
  invoicesThisWeek: number;
  activeBusinesses: number;
  trialActiveNow: number;
  updatedAt: string;
}

const REFRESH_MS = 2 * 60 * 1000;

/** واکشی با retry سه‌مرحله‌ای — الگوی مشترک کامپوننت‌های مقاوم پروژه */
async function fetchSocialProof(): Promise<SocialProofStats | null> {
  const delays = [0, 3000, 8000];
  for (const d of delays) {
    if (d > 0) await new Promise((r) => setTimeout(r, d));
    try {
      const res = await fetch("/api/pricing/social-proof", { cache: "no-store" });
      if (!res.ok) continue;
      const json = await res.json();
      if (json?.success && json?.data) return json.data as SocialProofStats;
    } catch {
      /* تلاش بعدی */
    }
  }
  return null;
}

/** شمارندهٔ انیمیت easeOutCubic — با reduced-motion مستقیم می‌نشیند */
function useCountUp(target: number, enabled: boolean, durationMs = 1100) {
  const [value, setValue] = React.useState(0);
  React.useEffect(() => {
    if (target <= 0) {
      setValue(0);
      return;
    }
    if (!enabled) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, durationMs]);
  return value;
}

interface StatChipProps {
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  label: string;
  tone: "emerald" | "amber" | "teal" | "rose" | "violet";
  animate: boolean;
}

const TONE_STYLES: Record<StatChipProps["tone"], { chip: string; icon: string }> = {
  emerald: {
    chip: "border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/30",
    icon: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    chip: "border-amber-200/70 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/30",
    icon: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  teal: {
    chip: "border-teal-200/70 bg-teal-50/70 dark:border-teal-900/50 dark:bg-teal-950/30",
    icon: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  },
  rose: {
    chip: "border-rose-200/70 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/30",
    icon: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  },
  violet: {
    chip: "border-violet-200/70 bg-violet-50/70 dark:border-violet-900/50 dark:bg-violet-950/30",
    icon: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
};

function StatChip({ icon: Icon, value, label, tone, animate }: StatChipProps) {
  const shown = useCountUp(value, animate);
  const styles = TONE_STYLES[tone];
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-transform duration-200 hover:-translate-y-0.5 ${styles.chip}`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${styles.icon}`}
        aria-hidden="true"
      >
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-bold tabular-nums leading-tight text-foreground">
          {formatNumber(shown)}
        </span>
        <span className="block truncate text-[11px] leading-tight text-muted-foreground">
          {label}
        </span>
      </span>
    </div>
  );
}

export function LiveStatsBar() {
  const [stats, setStats] = React.useState<SocialProofStats | null>(null);
  const [reducedMotion, setReducedMotion] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotion(mq.matches);
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      const data = await fetchSocialProof();
      if (!cancelled && data) setStats(data);
    };
    void load();
    timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  // فقط آمار مثبت — صداقت کامل
  const chips = React.useMemo(() => {
    if (!stats) return [];
    const out: StatChipProps[] = [];
    if (stats.activeBusinesses > 0)
      out.push({
        icon: Building2,
        value: stats.activeBusinesses,
        label: "کسب‌وکار فعال روی هوش",
        tone: "emerald",
        animate: !reducedMotion,
      });
    if (stats.invoicesThisWeek > 0)
      out.push({
        icon: FileText,
        value: stats.invoicesThisWeek,
        label: "فاکتور صادرشده این هفته",
        tone: "teal",
        animate: !reducedMotion,
      });
    if (stats.signupsThisWeek > 0)
      out.push({
        icon: UserPlus,
        value: stats.signupsThisWeek,
        label: "ثبت‌نام جدید این هفته",
        tone: "violet",
        animate: !reducedMotion,
      });
    if (stats.trialActiveNow > 0)
      out.push({
        icon: FlaskConical,
        value: stats.trialActiveNow,
        label: "کسب‌وکار در حال آزمایش رایگان",
        tone: "amber",
        animate: !reducedMotion,
      });
    if (stats.purchasesThisWeek > 0)
      out.push({
        icon: ShoppingBag,
        value: stats.purchasesThisWeek,
        label: "خرید پلن همین این هفته",
        tone: "rose",
        animate: !reducedMotion,
      });
    return out;
  }, [stats, reducedMotion]);

  if (chips.length === 0) return null;

  return (
    <section
      aria-label="آمار زندهٔ پلتفرم هوش"
      className="relative mb-12 overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-l from-emerald-50/60 via-card to-teal-50/40 p-4 shadow-sm dark:from-emerald-950/20 dark:via-card dark:to-teal-950/10 sm:p-5"
    >
      {/* بافت نقطه‌ای پس‌زمینه */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "18px 18px",
          color: "rgb(16 185 129 / 0.08)",
        }}
        aria-hidden="true"
      />
      <div className="relative flex flex-col gap-4">
        <div className="flex items-center justify-center gap-2">
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <p className="text-xs font-semibold text-muted-foreground">
            آمار زندهٔ پلتفرم — همین حالا روی هوش
          </p>
          <Activity className="h-3.5 w-3.5 text-emerald-500/70" aria-hidden="true" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {chips.map((c) => (
            <StatChip key={c.label} {...c} />
          ))}
        </div>
        <p className="text-center text-[10px] leading-relaxed text-muted-foreground/70">
          به‌روزرسانی خودکار هر ۲ دقیقه — اعداد از فعالیت واقعی پلتفرم (بدون نام
          بردن از هیچ کسب‌وکاری)
        </p>
      </div>
    </section>
  );
}
