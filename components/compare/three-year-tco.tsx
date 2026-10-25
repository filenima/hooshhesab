// ============ ThreeYearTco ============
// v35.4 (پیشنهاد ۶ سند روانشناسی فروش — Framing):
// جدول «جمع هزینهٔ مالکیت ۳ ساله» (Total Cost of Ownership) — هوش در برابر رقیب.
// رقبا با لایسنس یک‌بارهٔ ارزان شروع می‌شوند اما در بلندمدت (ارتقای سالانه +
// سرور اختصاصی + خرابی + آموزش + پشتیبانی ویژه) گران‌تر تمام می‌شوند؛
// عدد نهایی ۳ساله تصمیم را می‌سازد.
//
// سرور-کامپوننت است (SEO)؛ اعداد هوش از lib/plans.ts و اعداد رقیب از
// competitor-deep-analysis (tco3y — تخمینی و شفاف).

import { PLAN_BY_ID } from "@/lib/plans";
import type { CompetitorDeepAnalysis } from "@/lib/competitor-deep-analysis";
import { toPersianDigits } from "@/lib/persian";
import { Calculator, Lock, Info } from "lucide-react";

function fa(n: number): string {
 return toPersianDigits(n.toLocaleString("en-US").replace(/,/g, "٬"));
}

interface TcoRow {
 label: string;
 hoshToman: number;
 rivalToman: number;
 hoshNote?: string;
 rivalNote?: string;
 highlight?: boolean;
}

export function ThreeYearTco({
 competitor,
}: {
 competitor: CompetitorDeepAnalysis;
}) {
 const tco = competitor.tco3y;
 if (!tco) return null;

 // سناریوی معادل: پلن حرفه‌ای (چندکاربره + همهٔ ماژول‌ها) — همان چیزی که
 // با خرید لایسنس چندکاربرهٔ رقیب + ماژول‌های جدا به دست می‌آید.
 const pro = PLAN_BY_ID.pro;
 const hosh3y = pro.priceToman * 3;

 const rival3y =
 tco.licenseToman +
 tco.yearlyUpgradeToman * 3 +
 tco.serverToman +
 tco.serverFailureRiskToman +
 tco.trainingToman +
 tco.support3yToman;

 const savings = rival3y - hosh3y;
 const savingsPercent = rival3y > 0 ? Math.round((savings / rival3y) * 100) : 0;

 const rows: TcoRow[] = [
 {
 label: "اشتراک/لایسنس (۳ سال)",
 hoshToman: hosh3y,
 rivalToman: tco.licenseToman,
 hoshNote: "پلن حرفه‌ای × ۳ سال — همهٔ ماژول‌ها داخل پلن",
 rivalNote: "لایسنس چندکاربره + ماژول‌های ضروری (یک‌بار)",
 },
 {
 label: "ارتقا و بروزرسانی سالانه",
 hoshToman: 0,
 rivalToman: tco.yearlyUpgradeToman * 3,
 hoshNote: "بروزرسانی خودکار و رایگان",
 rivalNote: `≈ ${fa(tco.yearlyUpgradeToman)} در سال`,
 },
 {
 label: "سرور و راه‌اندازی شبکه",
 hoshToman: 0,
 rivalToman: tco.serverToman,
 hoshNote: "ابری — بدون سرور اختصاصی",
 rivalNote: competitor.type === "desktop" ? "نیازمند سیستم/سرور ویندوزی" : "زیرساخت اختصاصی",
 },
 {
 label: "ریسک خرابی سرور (۳ سال)",
 hoshToman: 0,
 rivalToman: tco.serverFailureRiskToman,
 hoshNote: "زیرساخت ابری با SLA — بدون توقف کار",
 rivalNote: "تعمیر/جایگزینی سخت‌افزار در طول ۳ سال",
 },
 {
 label: "آموزش کاربران",
 hoshToman: 0,
 rivalToman: tco.trainingToman,
 hoshNote: "رابط ساده + آموزش رایگان درون‌محصولی",
 rivalNote: "آموزش تخصصی خارج از پلن",
 },
 {
 label: "پشتیبانی ویژه (۳ سال)",
 hoshToman: 0,
 rivalToman: tco.support3yToman,
 hoshNote: "پشتیبانی داخل قیمت پلن",
 rivalNote: "قرارداد پشتیبانی جداگانه",
 },
 {
 label: "جمع کل مالکیت ۳ ساله",
 hoshToman: hosh3y,
 rivalToman: rival3y,
 highlight: true,
 },
 ];

 return (
 <section
 aria-label="مقایسهٔ هزینهٔ ۳ ساله"
 className="my-10"
 >
 <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
 <div className="border-b border-border bg-gradient-to-l from-primary/[0.06] via-transparent to-primary/[0.06] p-5 sm:p-6">
 <div className="flex items-center gap-3">
 <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
 <Calculator className="h-5.5 w-5.5" />
 </div>
 <div className="min-w-0">
 <h2 className="text-lg font-bold text-foreground sm:text-xl">
 جمع هزینهٔ مالکیت ۳ ساله — هوش در برابر {competitor.name}
 </h2>
 <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
 معادل‌سازی برای کسب‌وکار چندکاربره با انبار، مودیان و اپ موبایل — همهٔ هزینه‌های پنهان شامل شده است.
 </p>
 </div>
 </div>
 </div>

 <div className="overflow-x-auto">
 <table className="w-full min-w-[560px] text-sm">
 <thead>
 <tr className="border-b border-border bg-muted/40">
 <th className="p-3 text-right font-semibold text-muted-foreground">شرح هزینه</th>
 <th className="p-3 text-center font-bold text-primary">هوش</th>
 <th className="p-3 text-center font-semibold text-muted-foreground">{competitor.name}</th>
 </tr>
 </thead>
 <tbody>
 {rows.map((row) => (
 <tr
 key={row.label}
 className={`border-b border-border/60 last:border-0 ${
 row.highlight ? "bg-primary/[0.05]" : ""
 }`}
 >
 <td className="p-3">
 <span className={`font-medium ${row.highlight ? "font-bold text-foreground" : "text-foreground"}`}>
 {row.label}
 </span>
 </td>
 <td className="p-3 text-center">
 <div className={`tabular-nums ${row.highlight ? "text-lg font-extrabold text-primary" : "font-bold text-foreground"}`}>
 {row.hoshToman === 0 ? "رایگان" : `${fa(row.hoshToman)} تومان`}
 </div>
 {row.hoshNote && (
 <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{row.hoshNote}</div>
 )}
 </td>
 <td className="p-3 text-center">
 <div className={`tabular-nums ${row.highlight ? "text-lg font-extrabold text-foreground" : "font-medium text-muted-foreground"}`}>
 {fa(row.rivalToman)} تومان
 </div>
 {row.rivalNote && (
 <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{row.rivalNote}</div>
 )}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 {savings > 0 && (
 <div className="border-t border-border bg-emerald-50/60 p-4 sm:p-5 dark:bg-emerald-950/20">
 <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:text-right">
 <div className="flex items-center gap-2.5">
 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
 <Lock className="h-4.5 w-4.5" />
 </div>
 <p className="text-sm font-bold text-foreground sm:text-base">
 با هوش طی ۳ سال{" "}
 <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
 {fa(savings)} تومان ({toPersianDigits(savingsPercent)}٪)
 </span>{" "}
 کمتر هزینه می‌کنید — و قیمت شما برای همیشه قفل می‌ماند.
 </p>
 </div>
 <a
 href="/pricing"
 className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98] sm:text-sm"
 >
 شروع با ۷ روز رایگان
 </a>
 </div>
 </div>
 )}

 {tco.notes && tco.notes.length > 0 && (
 <div className="border-t border-border p-4">
 <div className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
 <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
 <div>
 <p>ارقام رقیب تخمینی و بر اساس قیمت‌های اعلامی عمومی است؛ در خرید واقعی با نمایندگی/نسخهٔ موردنظر خودتان مقایسه کنید.</p>
 <ul className="mt-1 list-inside list-disc space-y-0.5">
 {tco.notes.map((n, i) => (
 <li key={i}>{n}</li>
 ))}
 </ul>
 </div>
 </div>
 </div>
 )}
 </div>
 </section>
);
}
