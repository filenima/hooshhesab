"use client";

/**
 * ============ TrialProgressCard — «گام‌های طلایی تا ارزش کامل» (v35.1) ============
 * ----------------------------------------------------------------------------
 * پیاده‌سازی پیشنهاد شمارهٔ ۱ سند روانشناسی فروش (پیشنهادهای-ارتقا-v35.md):
 * «نشان پیشرفت آخرین قدم تا ارتقا» — Goal Gradient Effect + Loss Aversion.
 *
 * مغز انسان کارِ ناتمام را می‌خواهد تمام کند؛ وقتی کاربر ۴ از ۵ گام را
 * دیده باشد، همان گام آخر ضربهٔ نهایی خرید است. داده از /api/trial/progress
 * می‌آید که از «رخدادهای واقعی دیتابیس» ساخته می‌شود (فاکتور/مشتری/کالا/
 * هزینه/گفتگو با هوش‌یار) — نه شمارندهٔ جعلی.
 *
 * همچنین «اثبات ارزش ریالی» (پیشنهاد ۳): دقایق صرفه‌جویی‌شدهٔ واقعی.
 * و در روزهای آخر، CTA ارتقا با یادآوری تخفیف ۵٪ سه‌روزه (پیشنهاد ۲ و ۵).
 * ============================================================================
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
 CheckCircle2,
 Circle,
 Sparkles,
 Timer,
 TrendingUp,
 Zap,
 ArrowLeft,
 PartyPopper,
 FileText,
 Heart,
 Package,
 Receipt,
 Sparkle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/auth-fetch";
import { toPersianDigits } from "@/lib/persian";

interface ProgressStep {
 id: string;
 title: string;
 description: string;
 module: string;
 done: boolean;
 weight: number;
}

interface TrialProgressData {
 isTrial: boolean;
 showCard: boolean;
 daysRemaining: number;
 daysTotal: number;
 progressPercent: number;
 doneCount: number;
 totalSteps: number;
 steps: ProgressStep[];
 nextStep: ProgressStep | null;
 minutesSaved: number;
 counts: {
 invoices: number;
 parties: number;
 products: number;
 expenses: number;
 aiMessages: number;
 };
}

/** آیکون هر گام بر اساس شناسه — بدون ایموجی (قانون برند) */
const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
 "first-invoice": FileText,
 "first-party": Heart,
 "first-product": Package,
 "first-expense": Receipt,
 "first-ai": Sparkle,
};

/** حلقهٔ پیشرفت SVG — انیمیت‌شده با stroke-dashoffset */
function ProgressRing({ percent, size = 92 }: { percent: number; size?: number }) {
 const stroke = 9;
 const radius = (size - stroke) / 2;
 const circumference = 2 * Math.PI * radius;
 const offset = circumference - (percent / 100) * circumference;

 return (
 <div className="relative shrink-0" style={{ width: size, height: size }}>
 <svg width={size} height={size} className="-rotate-90">
      {/* ریل پس‌زمینه حلقه (track) */}
 <circle
 cx={size / 2}
 cy={size / 2}
 r={radius}
 strokeWidth={stroke}
 className="stroke-primary/15"
 fill="none"
 />
 {/* نوار پیشرفت — گرادیان قهرمان */}
 <defs>
 <linearGradient id="trialRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
 <stop offset="0%" stopColor="var(--tw-gradient-from, #10b981)" />
 <stop offset="100%" stopColor="#f59e0b" />
 </linearGradient>
 </defs>
 <motion.circle
 cx={size / 2}
 cy={size / 2}
 r={radius}
 strokeWidth={stroke}
 strokeLinecap="round"
 fill="none"
 stroke="url(#trialRingGrad)"
 strokeDasharray={circumference}
 initial={{ strokeDashoffset: circumference }}
 animate={{ strokeDashoffset: offset }}
 transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
 />
 </svg>
 <div className="absolute inset-0 flex flex-col items-center justify-center">
 <motion.span
 key={percent}
 initial={{ scale: 0.7, opacity: 0 }}
 animate={{ scale: 1, opacity: 1 }}
 transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.5 }}
 className="text-lg font-extrabold tabular-nums text-foreground"
 >
 {toPersianDigits(percent)}٪
 </motion.span>
 <span className="text-[9px] text-muted-foreground -mt-0.5">کامل شد</span>
 </div>
 </div>
 );
}

export function TrialProgressCard() {
 const [data, setData] = React.useState<TrialProgressData | null>(null);
 const [dismissed, setDismissed] = React.useState(false);
 const [loading, setLoading] = React.useState(true);

 React.useEffect(() => {
 let cancelled = false;
 // v35.1: سه تلاش با فاصله — مقاوم در برابر نوسان لحظه‌ای شبکه/سرور
 // (موبایل بد شبکه یا ری‌استارت سرویس)؛ کارت به‌خاطر یک fetch ناموفق غیب نمی‌شود
 (async () => {
 const delays = [0, 3_000, 8_000];
 for (let attempt = 0; attempt < delays.length; attempt++) {
 if (delays[attempt] > 0) {
 await new Promise((r) => setTimeout(r, delays[attempt]));
 }
 if (cancelled) return;
 try {
 const res = await authFetch("/api/trial/progress", { cache: "no-store" });
 if (!res.ok) continue; // تلاش بعدی
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

 // تازه‌سازی روی رخدادهای جهانی موتاسیون (فاکتور/مشتری/کالا/هزینه ثبت شد)
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
 const res = await authFetch("/api/trial/progress", { cache: "no-store" });
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

 if (loading || dismissed || !data?.showCard) return null;

 const { steps, doneCount, totalSteps, progressPercent, daysRemaining, minutesSaved } = data;
 const allDone = doneCount === totalSteps;
 const urgent = daysRemaining <= 2;

 const navigateModule = (module: string) => {
 window.dispatchEvent(
 new CustomEvent("hoshhesab:navigate", { detail: { module } })
 );
 };

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
 initial={{ opacity: 0, y: 16 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -10 }}
 transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
 >
 <Card className="relative overflow-hidden border-emerald-500/25 shadow-lg shadow-emerald-500/5">
 {/* پس‌زمینهٔ گرادیانی ظریف + بافت نقطه‌ای */}
 <div className="absolute inset-0 bg-gradient-to-l from-emerald-500/[0.07] via-amber-500/[0.05] to-transparent pointer-events-none" />
 <div
 className="absolute inset-0 opacity-[0.35] pointer-events-none"
 style={{
 backgroundImage:
 "radial-gradient(circle at 1px 1px, hsl(var(--border)) 1px, transparent 0)",
 backgroundSize: "22px 22px",
 maskImage: "radial-gradient(ellipse at 85% 20%, black 30%, transparent 75%)",
 WebkitMaskImage: "radial-gradient(ellipse at 85% 20%, black 30%, transparent 75%)",
 }}
 />

 <div className="relative p-4 sm:p-5">
 <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
 {/* ─── ستون راست: حلقهٔ پیشرفت + روزهای تریال ─── */}
 <div className="flex items-center gap-4 lg:flex-col lg:gap-2 lg:shrink-0 lg:w-[120px]">
 <ProgressRing percent={progressPercent} />
 <div className="flex flex-col gap-1.5 lg:items-center">
 <Badge
 variant={urgent ? "destructive" : "secondary"}
 className="gap-1 text-[11px] font-semibold"
 >
 <Timer className="h-3 w-3" />
 {daysRemaining > 0
 ? `${toPersianDigits(daysRemaining)} روز رایگان مانده`
 : "آخرین روز تریال"}
 </Badge>
 {minutesSaved >= 10 && (
 <Badge variant="outline" className="gap-1 text-[10px] text-emerald-600 border-emerald-500/40">
 <TrendingUp className="h-3 w-3" />
 {toPersianDigits(minutesSaved)} دقیقه کار شما صرفه‌جویی شد
 </Badge>
 )}
 </div>
 </div>

 {/* ─── ستون چپ: عنوان + چک‌لیست گام‌ها ─── */}
 <div className="flex-1 min-w-0">
 <div className="flex items-start justify-between gap-2 mb-3">
 <div>
 <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-1.5">
 {allDone ? (
 <PartyPopper className="h-4 w-4 text-amber-500" />
 ) : (
 <Sparkles className="h-4 w-4 text-emerald-500" />
 )}
 {allDone
 ? "همهٔ گام‌های طلایی را برداشتید!"
 : "گام‌های طلایی تا ارزش کامل هوش"}
 </h3>
 <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 leading-relaxed">
 {allDone
 ? `شما ${toPersianDigits(totalSteps)} گام را کامل کردید — ارزش کامل هوش را دیده‌اید. با خرید پلن، داده‌ها و تنظیماتتان دست‌نخورده می‌مانند.`
 : `${toPersianDigits(doneCount)} از ${toPersianDigits(totalSteps)} گام انجام شد — هر گام بخشی از ارزش واقعی هوش را برای شما باز می‌کند.`}
 </p>
 </div>
 </div>

 {/* چک‌لیست — موبایل: اسکرول افقی، دسکتاپ: شبکهٔ عمودی فشرده */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
 {steps.map((step, i) => {
 const Icon = STEP_ICONS[step.id] ?? Zap;
 return (
 <motion.button
 key={step.id}
 type="button"
 initial={{ opacity: 0, x: 12 }}
 animate={{ opacity: 1, x: 0 }}
 transition={{ delay: 0.15 + i * 0.07, duration: 0.3 }}
 onClick={() => !step.done && navigateModule(step.module)}
 disabled={step.done}
 className={`group flex items-start gap-2.5 rounded-xl border p-2.5 text-start transition-all duration-200 ${
 step.done
 ? "border-emerald-500/30 bg-emerald-500/[0.06] cursor-default"
 : "border-border/80 bg-card hover:border-emerald-500/40 hover:bg-emerald-500/[0.04] hover:shadow-sm cursor-pointer active:scale-[0.985]"
 }`}
 title={step.done ? "انجام شد" : "برای انجام این گام کلیک کنید"}
 >
 <span
 className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
 step.done
 ? "bg-emerald-500/15 text-emerald-600"
 : "bg-muted text-muted-foreground group-hover:bg-emerald-500/10 group-hover:text-emerald-600"
 }`}
 >
 {step.done ? (
 <motion.span
 initial={{ scale: 0, rotate: -30 }}
 animate={{ scale: 1, rotate: 0 }}
 transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.4 + i * 0.08 }}
 >
 <CheckCircle2 className="h-4.5 w-4.5 h-[18px] w-[18px]" />
 </motion.span>
 ) : (
 <Icon className="h-[18px] w-[18px]" />
 )}
 </span>
 <span className="min-w-0 flex-1">
 <span
 className={`block text-xs sm:text-[13px] font-semibold leading-tight ${
 step.done ? "text-emerald-700 dark:text-emerald-400 line-through decoration-emerald-500/40" : "text-foreground"
 }`}
 >
 {step.title}
 </span>
 <span className="hidden sm:block text-[10.5px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
 {step.description}
 </span>
 </span>
 {!step.done && (
 <Circle className="h-3 w-3 text-muted-foreground/50 shrink-0 mt-1 group-hover:hidden" />
 )}
 {!step.done && (
 <ArrowLeft className="hidden h-3 w-3 text-emerald-500 shrink-0 mt-1 group-hover:block transition-transform group-hover:-translate-x-0.5" />
 )}
 </motion.button>
 );
 })}
 </div>

 {/* ─── CTA ارتقا — با انگیزهٔ درست در زمان درست ─── */}
 <AnimatePresence>
 {(progressPercent >= 60 || urgent || allDone) && (
 <motion.div
 initial={{ opacity: 0, y: 8, height: 0 }}
 animate={{ opacity: 1, y: 0, height: "auto" }}
 exit={{ opacity: 0, height: 0 }}
 transition={{ duration: 0.35, delay: 0.6 }}
 className="mt-3 pt-3 border-t border-dashed border-border/70"
 >
 <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
 <div className="flex-1 min-w-0">
 <p className="text-xs font-semibold text-foreground leading-relaxed">
 {allDone
 ? "داده‌های شما آمادهٔ ماندن است — با خرید پلن، هیچ‌چیز از دست نمی‌رود"
 : urgent
 ? `فقط ${toPersianDigits(daysRemaining)} روز از دسترسی کامل باقی است`
 : "با تکمیل گام‌ها، ارزش واقعی را دیده‌اید"}
 {data.daysRemaining <= 3 && progressPercent > 0 && (
 <span className="text-amber-600 dark:text-amber-400"> — تخفیف ۵٪ خرید در ۳ روز اول ثبت‌نام هم‌چنان فعال است</span>
 )}
 </p>
 </div>
 <Button
 size="sm"
 className="gap-1.5 shrink-0 bg-gradient-to-l from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white shadow"
 onClick={goPricing}
 >
 <Zap className="h-3.5 w-3.5" />
 دیدن پلن‌ها و شروع دائمی
 </Button>
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 </div>
 </div>
 </Card>
 </motion.div>
 </AnimatePresence>
 );
}
