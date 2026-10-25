"use client";

// ============ ویزارد راه‌اندازی (R13-2-a) ============
//
// جایگزین حرفه‌ای تور joyride (که مالک آن را «خیلی ابتدایی» توصیف کرد):
// به‌جای معرفی ظاهری محیط، «مسیر راه‌اندازی واقعی» را گام‌به‌گام نشان می‌دهد:
//
//   خوش‌آمدگویی ← اطلاعات کسب‌وکار ← کالا و انبار (درون‌ریزی اکسل) ←
//   مشتری‌ها ← اولین فاکتور ← پایان
//
// - پیشرفت واقعی از API /api/onboarding/progress (شمارش کالا/طرف‌حساب/فاکتور)
// - ترتیب درست کارها به کاربر گوشزد می‌شود: «اول کالا، بعد فاکتور»
// - فایل نمونهٔ CSV (BOM + UTF-8) کاملاً سمت کلاینت ساخته می‌شود
// - همهٔ اعداد با toPersianDigits / تاریخ‌ها با toJalali
// - رابط onNavigate → goToModule اپ‌شل (ماژول‌های واقعی:
//   account / data-import-export / inventory / crm / invoices / dashboard)
//
// خروجی‌های عمومی:
//   SetupWizard      — اورلی اصلی (Dialog حداکثر ۳xl)
//   SetupWizardPill  — دکمهٔ شناور «راه‌اندازی — X٪» در هدر (قابل ازسرگیری)
//   isSetupWizardDone — آیا کاربر ویزارد را تکمیل/رد کرده؟

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
 Sparkles,
 Package,
 Users,
 FileText,
 LayoutDashboard,
 Upload,
 ClipboardList,
 CheckCircle2,
 ArrowLeft,
 ArrowRight,
 Download,
 RefreshCw,
 Building2,
 Info,
 Loader2,
 Rocket,
 Bot,
 Boxes,
 Check,
 Circle,
 ListChecks,
 UserPlus,
 X,
 Warehouse,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, toJalali, formatNumber } from "@/lib/persian";
import { markJoyrideTourDone } from "@/components/onboarding-joyride";

/* ============ تایپ‌ها (قرارداد API) ============ */

export interface OnboardingStepState {
 id: string;
 label: string;
 done: boolean;
}

export interface OnboardingProgressData {
 tenantName: string;
 userName: string;
 companyName: string | null;
 productsCount: number;
 partiesCount: number;
 invoicesCount: number;
 hasWarehouse: boolean;
 hasCompanyInfo: boolean;
 isTrial: boolean;
 trialEndsAt: string | null;
 steps: OnboardingStepState[];
}

interface ProgressResponse {
 success?: boolean;
 error?: string;
 data?: OnboardingProgressData;
 completionPercent?: number;
}

/* ============ کلیدهای localStorage ============ */

/** کاربر ویزارد را تکمیل یا در گام خوش‌آمدگویی رد کرده — دکمهٔ شناور مخفی می‌شود */
const DONE_KEY = "hoshhesab_setup_wizard_done";
/** کاربر ویزارد را حداقل یک بار دیده — در باز شدن بعدی به اولین گامِ ناتمام می‌پرد */
const SEEN_KEY = "hoshhesab_setup_wizard_seen";

/** رویداد تغییر پیشرفت — دکمهٔ شناور هدر خودش را تازه می‌کند */
export const ONBOARDING_PROGRESS_CHANGED_EVENT = "hoshhesab:onboarding-progress-changed";

export function isSetupWizardDone(): boolean {
 if (typeof window === "undefined") return false;
 try {
 return window.localStorage.getItem(DONE_KEY) === "1";
 } catch {
 return false;
 }
}

function hasSeenWizard(): boolean {
 if (typeof window === "undefined") return false;
 try {
 return window.localStorage.getItem(SEEN_KEY) === "1";
 } catch {
 return false;
 }
}

function markWizardSeen() {
 try {
 window.localStorage.setItem(SEEN_KEY, "1");
 } catch {
 /* ignore */
 }
}

/**
 * تکمیل/رد ویزارد:
 * ۱) فلگ مخصوص ویزارد → دکمهٔ شناور مخفی می‌شود و گام «کاوش» تیک می‌خورد
 * ۲) فلگ تور joyride → منطق‌های وابسته (پاپ‌آپ ایمیل) فعال و اجرای خودکار
 *    مجدد در ورود بعدی متوقف می‌شود
 */
function markWizardDone() {
 try {
 window.localStorage.setItem(DONE_KEY, "1");
 } catch {
 /* ignore */
 }
 markJoyrideTourDone();
 try {
 window.dispatchEvent(new CustomEvent(ONBOARDING_PROGRESS_CHANGED_EVENT));
 } catch {
 /* ignore */
 }
}

/* ============ ساخت فایل CSV نمونه (کاملاً کلاینت‌ساید) ============ */

/**
 * ساخت و دانلود CSV با BOM (یونیکد U+FEFF) تا اکسل فارسی را درست باز کند.
 * قیمت‌ها «ریال» هستند — همان واحدی که درون‌ریزی و DB انتظار دارند.
 */
function downloadCsv(filename: string, rows: (string | number)[][]): boolean {
 try {
 const escapeCell = (cell: string | number) => {
 const s = String(cell ?? "");
 return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
 };
 const content = "\uFEFF" + rows.map((r) => r.map(escapeCell).join(",")).join("\r\n");
 const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = filename;
 a.style.display = "none";
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 setTimeout(() => URL.revokeObjectURL(url), 1500);
 return true;
 } catch {
 return false;
 }
}

/** فایل نمونهٔ کالاها — هدرها با درون‌ریزی «واردات و صادرکرد داده» مپ می‌شوند */
const PRODUCTS_SAMPLE_CSV: (string | number)[][] = [
 ["نام کالا", "کد کالا", "دسته‌بندی", "واحد شمارش", "قیمت خرید", "قیمت فروش", "موجودی اولیه", "شرح"],
 ["شیر پرچرب ۱ لیتری", "SHIR-01", "لبنیات", "عدد", 320000, 380000, 24, "شیر پرچرب یک لیتری — تولید روز"],
 ["نان تست خانگی", "TOAST-01", "نان و غله", "بسته", 450000, 580000, 12, "بستهٔ ۵۰۰ گرمی نان تست گندم"],
 ["پنیر سفید ایرانی", "CHS-01", "لبنیات", "عدد", 950000, 1200000, 8, "پنیر لیقوان ۴۰۰ گرمی"],
];

/** فایل نمونهٔ طرف‌حساب‌ها — «مشتری/فروشنده» خودکار به CUSTOMER/SUPPLIER ترجمه می‌شود */
const PARTIES_SAMPLE_CSV: (string | number)[][] = [
 ["نوع", "نام/نام شرکت", "کد اقتصادی", "شماره تماس", "ایمیل", "آدرس", "شهر"],
 ["مشتری", "کافه رارا", "411356789012", "02188776655", "info@caferara.ir", "خیابان ولیعصر، پلاک ۱۲", "تهران"],
 ["فروشنده", "لبنیات پگاه", "123456789012", "02144556677", "sales@pegah.ir", "جادهٔ مخصوص کرج، کیلومتر ۹", "تهران"],
];

/* ============ ساختار گام‌ها ============ */

/** شناسهٔ گام‌های چک‌لیست (هماهنگ با API) */
type StepId = "company-info" | "inventory" | "customers" | "first-invoice" | "explore";

const STEP_META: Record<StepId, { icon: LucideIcon; short: string }> = {
 "company-info": { icon: Building2, short: "کسب‌وکار" },
 inventory: { icon: Package, short: "کالا و انبار" },
 customers: { icon: Users, short: "مشتری‌ها" },
 "first-invoice": { icon: FileText, short: "فاکتور" },
 explore: { icon: LayoutDashboard, short: "کاوش" },
};

const STEP_ORDER: StepId[] = ["company-info", "inventory", "customers", "first-invoice", "explore"];

/** نمای صفحهٔ فعال — ۰ تا ۵ (خوش‌آمد تا پایان) */
type Screen = 0 | 1 | 2 | 3 | 4 | 5;

const SCREEN_TITLES: string[] = [
 "خوش‌آمدگویی",
 "اطلاعات کسب‌وکار",
 "کالا و انبار",
 "مشتری‌ها و فروشندگان",
 "اولین فاکتور",
 "پایان راه‌اندازی",
];

/* ============ اجزای کوچک نمایشی ============ */

/** جعبهٔ نکته/توضیح با رنگ وضعیتی */
function TipBox({
 icon: Icon,
 tone = "info",
 children,
}: {
 icon?: LucideIcon;
 tone?: "info" | "emerald" | "amber";
 children: React.ReactNode;
}) {
 const toneCls =
 tone === "emerald"
 ? "border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
 : tone === "amber"
 ? "border-amber-200 bg-amber-50/70 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
 : "border-border bg-muted/50 text-muted-foreground";
 return (
 <div className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs leading-6 ${toneCls}`}>
 {Icon && <Icon className="h-4 w-4 shrink-0 translate-y-1" />}
 <div className="min-w-0">{children}</div>
 </div>
 );
}

/** چیپ وضعیت زندهٔ هر گام: «X کالا ثبت شده» + دکمهٔ تازه‌سازی */
function CountChip({
 count,
 label,
 onRefresh,
 refreshing,
}: {
 count: number | null;
 label: string;
 onRefresh: () => void;
 refreshing: boolean;
}) {
 const done = (count ?? 0) > 0;
 return (
 <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-border/70 bg-card/60 px-3.5 py-2.5">
 <span
 className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
 done
 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
 : "bg-muted text-muted-foreground"
 }`}
 >
 {done ? (
 <CheckCircle2 className="h-3.5 w-3.5" />
 ) : (
 <Circle className="h-3.5 w-3.5" />
 )}
 {count === null ? (
 <span className="inline-block h-3 w-10 animate-pulse rounded bg-muted-foreground/20" />
 ) : (
 <>
 {formatNumber(count)} {label}
 </>
 )}
 </span>
 <Button
 type="button"
 variant="ghost"
 size="sm"
 className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
 onClick={onRefresh}
 disabled={refreshing}
 aria-label="تازه‌سازی وضعیت"
 title="تازه‌سازی وضعیت"
 >
 {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
 </Button>
 </div>
 );
}

/** کارت گزینهٔ بزرگ (درون‌ریزی / ثبت دستی) */
function OptionCard({
 icon: Icon,
 title,
 desc,
 ctaLabel,
 onCta,
 recommended,
}: {
 icon: LucideIcon;
 title: string;
 desc: string;
 ctaLabel: string;
 onCta: () => void;
 recommended?: boolean;
}) {
 return (
 <div
 className={`group relative flex flex-col gap-3 rounded-xl border-2 p-4 transition-all hover:shadow-md hover:-translate-y-0.5 ${
 recommended
 ? "border-primary/40 bg-gradient-to-b from-primary/10 to-transparent"
 : "border-border bg-card/70 hover:border-primary/30"
 }`}
 >
 {recommended && (
 <Badge className="absolute -top-2.5 start-3 h-5 gap-1 bg-primary text-primary-foreground text-[10px] font-bold">
 <Sparkles className="h-3 w-3" />
 پیشنهاد ما
 </Badge>
 )}
 <div
 className={`flex h-12 w-12 items-center justify-center rounded-xl shadow-sm ${
 recommended
 ? "bg-primary text-primary-foreground"
 : "bg-muted text-foreground"
 }`}
 >
 <Icon className="h-6 w-6" />
 </div>
 <div className="space-y-1.5">
 <h4 className="text-sm font-bold leading-5">{title}</h4>
 <p className="text-xs leading-6 text-muted-foreground">{desc}</p>
 </div>
 <Button type="button" className="mt-auto h-9 w-full gap-1.5" onClick={onCta}>
 {ctaLabel}
 <ArrowLeft className="h-4 w-4" />
 </Button>
 </div>
 );
}

/** گرهٔ نقشهٔ راه صفحهٔ خوش‌آمدگویی */
function RoadmapNode({
 icon: Icon,
 index,
 label,
}: {
 icon: LucideIcon;
 index: number;
 label: string;
}) {
 return (
 <div className="flex flex-col items-center gap-1.5 text-center">
 <div className="relative flex h-11 w-11 items-center justify-center rounded-full border-2 border-primary/25 bg-primary/10 text-primary">
 <Icon className="h-5 w-5" />
 <span className="absolute -top-1 -end-1 flex h-4.5 w-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
 {toPersianDigits(index)}
 </span>
 </div>
 <span className="text-[11px] font-semibold leading-4">{label}</span>
 </div>
 );
}

/* ============ استپر ۵ گامی ============ */

function StepperHeader({
 current,
 doneMap,
}: {
 /** اندیس گام فعال (۰..۴) — یا ۱- وقتی هنوز در خوش‌آمدگویی هستیم */
 current: number;
 doneMap: Record<StepId, boolean>;
}) {
 return (
 <div className="flex items-start" aria-hidden="true">
 {STEP_ORDER.map((id, i) => {
 const meta = STEP_META[id];
 const done = doneMap[id];
 const isCurrent = i === current;
 const Icon = meta.icon;
 return (
 <React.Fragment key={id}>
 {i > 0 && (
 <div
 className={`mt-5 h-0.5 flex-1 rounded-full transition-colors ${
 done || isCurrent ? "bg-emerald-400/70" : "bg-border"
 }`}
 />
 )}
 <div className="flex w-14 flex-col items-center gap-1 sm:w-16">
 <div
 className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
 done
 ? "border-emerald-500 bg-emerald-500 text-white shadow-[0_0_12px_-2px] shadow-emerald-500/50"
 : isCurrent
 ? "border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px] shadow-primary/15 animate-in"
 : "border-border bg-muted/60 text-muted-foreground"
 }`}
 >
 {done ? (
 <Check className="h-5 w-5" />
 ) : isCurrent ? (
 <Icon className="h-4.5 w-4.5" />
 ) : (
 <span className="text-xs font-bold">{toPersianDigits(i + 1)}</span>
 )}
 {isCurrent && !done && (
 <span className="absolute inset-0 animate-ping rounded-full border-2 border-primary/40" />
 )}
 </div>
 <span
 className={`text-[10px] leading-3 sm:text-[11px] ${
 done
 ? "font-bold text-emerald-600 dark:text-emerald-400"
 : isCurrent
 ? "font-bold text-foreground"
 : "text-muted-foreground"
 }`}
 >
 {meta.short}
 </span>
 </div>
 </React.Fragment>
 );
 })}
 </div>
 );
}

/* ============ بدنهٔ گام‌ها ============ */

/** گام ۱ — خوش‌آمدگویی + نقشهٔ راه */
function WelcomeBody({
 data,
 userNameFallback,
 onDownloadProducts,
}: {
 data: OnboardingProgressData | null;
 userNameFallback?: string | null;
 onDownloadProducts: () => void;
}) {
 const name = data?.userName || userNameFallback || "کسب‌وکار عزیز";
 const trialEnds = data?.trialEndsAt ? new Date(data.trialEndsAt) : null;
 const trialDaysLeft =
 trialEnds && trialEnds.getTime() > Date.now()
 ? Math.max(1, Math.ceil((trialEnds.getTime() - Date.now()) / 86_400_000))
 : null;
 return (
 <div className="space-y-5">
 <div className="flex flex-col items-center gap-2 text-center">
 <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
 <Sparkles className="h-7 w-7" />
 </div>
 <h3 className="text-lg font-extrabold sm:text-xl">
 {name} عزیز، به هوش‌حساب خوش آمدید
 </h3>
 <p className="max-w-md text-xs leading-6 text-muted-foreground sm:text-[13px]">
 در ۱۵ دقیقه کسب‌وکارتان را راه می‌اندازیم. کافی است مسیر زیر را به ترتیب جلو بروید —
 اول کالا و انبار، بعد مشتری‌ها و در پایان اولین فاکتور. بقیهٔ کارها (سند حسابداری و
 موجودی انبار) خودکار ثبت می‌شوند.
 </p>
 <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
 {trialDaysLeft !== null && (
 <Badge className="h-6 gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">
 <Rocket className="h-3.5 w-3.5" />
 ۱۴ روز پلن حرفه‌ای رایگان — {toPersianDigits(trialDaysLeft)} روز باقی‌مانده
 </Badge>
 )}
 {data?.tenantName && (
 <Badge variant="secondary" className="h-6 max-w-full truncate">
 <Building2 className="h-3.5 w-3.5" />
 {data.tenantName}
 </Badge>
 )}
 {trialEnds && (
 <Badge variant="outline" className="h-6 font-normal text-muted-foreground">
 پایان دورهٔ رایگان: {toJalali(trialEnds)}
 </Badge>
 )}
 </div>
 </div>

 {/* نقشهٔ راه ۴ مرحله‌ای */}
 <div className="rounded-xl border border-border/70 bg-gradient-to-l from-primary/5 via-transparent to-primary/5 p-4">
 <div className="flex items-center justify-between gap-1 sm:gap-2">
 <RoadmapNode icon={Boxes} index={1} label="کالا و انبار" />
 <ArrowLeft className="hidden h-4 w-4 shrink-0 text-primary/50 sm:block" />
 <RoadmapNode icon={Users} index={2} label="مشتری‌ها" />
 <ArrowLeft className="hidden h-4 w-4 shrink-0 text-primary/50 sm:block" />
 <RoadmapNode icon={FileText} index={3} label="اولین فاکتور" />
 <ArrowLeft className="hidden h-4 w-4 shrink-0 text-primary/50 sm:block" />
 <RoadmapNode icon={LayoutDashboard} index={4} label="گزارش‌ها" />
 </div>
 </div>

 <div className="grid gap-2.5 sm:grid-cols-2">
 <TipBox icon={Upload} tone="emerald">
 از هلو، سپیدار، محک یا اکسل ساده درون‌ریزی کنید — فایل نمونه آماده داریم تا
 ساختار ستون‌ها را ببینید:
 <button
 type="button"
 onClick={onDownloadProducts}
 className="mt-1.5 inline-flex items-center gap-1 rounded-md font-bold text-primary hover:underline"
 >
 <Download className="h-3.5 w-3.5" />
 دانلود فایل نمونهٔ کالاها (CSV)
 </button>
 </TipBox>
 <TipBox icon={Bot}>
 هر جای مسیر که سوال داشتید، «دستیار هوشمند» را باز کنید و به زبان فارسی
 بپرسید — از ثبت کالا تا تحلیل سود، همراه شماست.
 </TipBox>
 </div>
 </div>
 );
}

/** گام ۲ — اطلاعات کسب‌وکار */
function CompanyBody({
 data,
 onEdit,
 onSkipChecked,
 skipChecked,
}: {
 data: OnboardingProgressData | null;
 onEdit: () => void;
 onSkipChecked: (checked: boolean) => void;
 skipChecked: boolean;
}) {
 const done = data?.hasCompanyInfo ?? false;
 const companyName = data?.companyName ?? null;
 return (
 <div className="space-y-4">
 <p className="text-xs leading-6 text-muted-foreground sm:text-[13px]">
 نام و اطلاعات کسب‌وکار شما روی همهٔ اسناد — فاکتور فروش و خرید، رسید چاپی و
 صورتحساب سامانهٔ مودیان — درج می‌شود. همین حالا یک بار آن را کامل کنید تا
 فاکتورهایتان از همان اول رسمی و حرفه‌ای خارج شوند.
 </p>

 <div className="rounded-xl border border-border/70 bg-card/70 p-4">
 <div className="mb-3 flex items-center justify-between gap-2">
 <span className="text-xs font-bold">وضعیت فعلی اطلاعات</span>
 <Badge
 className={
 done
 ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300"
 : "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300"
 }
 >
 {done ? "ثبت شده" : "تکمیل نشده"}
 </Badge>
 </div>
 <div className="grid gap-2.5 sm:grid-cols-2">
 <div className="rounded-lg bg-muted/50 px-3 py-2.5">
 <p className="text-[10px] text-muted-foreground">نام سازمان</p>
 <p className="mt-0.5 truncate text-sm font-bold">
 {data?.tenantName || "—"}
 </p>
 </div>
 <div className="rounded-lg bg-muted/50 px-3 py-2.5">
 <p className="text-[10px] text-muted-foreground">نام شرکت / کسب‌وکار</p>
 <p className={`mt-0.5 truncate text-sm font-bold ${companyName ? "" : "text-muted-foreground"}`}>
 {companyName || "ثبت نشده"}
 </p>
 </div>
 </div>
 {!done && (
 <p className="mt-2.5 text-[11px] leading-5 text-muted-foreground">
 در «حساب کاربری ← بخش پروفایل» می‌توانید نام شرکت، شناسه ملی و شمارهٔ تماس را ثبت کنید.
 </p>
 )}
 </div>

 <Button type="button" className="h-10 w-full gap-2 sm:w-auto" onClick={onEdit}>
 <Building2 className="h-4 w-4" />
 ویرایش اطلاعات شرکت
 <ArrowLeft className="h-4 w-4" />
 </Button>

 <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
 <Checkbox
 checked={skipChecked}
 onCheckedChange={(v) => onSkipChecked(v === true)}
 className="h-4 w-4"
 />
 فعلاً رد می‌کنم — بعداً از «حساب کاربری» کامل می‌کنم
 </label>
 </div>
 );
}

/** گام ۳ — کالا و انبار (مهم‌ترین گام) */
function InventoryBody({
 data,
 onNavigate,
 onRefresh,
 refreshing,
 onDownloadProducts,
}: {
 data: OnboardingProgressData | null;
 onNavigate: (m: string) => void;
 onRefresh: () => void;
 refreshing: boolean;
 onDownloadProducts: () => void;
}) {
 const count = data ? data.productsCount : null;
 const done = (count ?? 0) > 0;
 return (
 <div className="space-y-4">
 <p className="text-xs leading-6 text-muted-foreground sm:text-[13px]">
 <strong className="text-foreground">مهم‌ترین گام راه‌اندازی:</strong> قبل از صدور
 فاکتور، کالاها و خدمات باید در انبار ثبت باشند — چون اقلام هر فاکتور از همین
 لیست انتخاب می‌شوند. اگر از هلو، سپیدار یا محک مهاجرت می‌کنید، لازم نیست حتی
 یک کالا را دستی بنویسید.
 </p>

 <div className="grid gap-3 sm:grid-cols-2">
 <OptionCard
 icon={Upload}
 title="درون‌ریزی هوشمند با اکسل/CSV"
 desc="فایل خروجی هلو، سپیدار، محک یا اکسل ساده را بکشید و رها کنید — ستون‌ها خودکار تشخیص داده می‌شوند."
 ctaLabel="شروع درون‌ریزی"
 recommended
 onCta={() => onNavigate("data-import-export")}
 />
 <OptionCard
 icon={ClipboardList}
 title="ثبت دستی کالا"
 desc="برای انبارهای کوچک، کالاها را یکی‌یکی با قیمت خرید و فروش و موجودی ثبت کنید."
 ctaLabel="ثبت دستی کالا"
 onCta={() => onNavigate("inventory")}
 />
 </div>

 <CountChip count={count} label="کالا ثبت شده" onRefresh={onRefresh} refreshing={refreshing} />

 <div className="flex flex-wrap items-center gap-2">
 <Button
 type="button"
 variant="outline"
 size="sm"
 className="h-8 gap-1.5"
 onClick={onDownloadProducts}
 >
 <Download className="h-3.5 w-3.5" />
 دانلود فایل نمونه
 </Button>
 <span className="text-[11px] text-muted-foreground">
 هدرها: نام کالا، کد کالا، دسته‌بندی، واحد شمارش، قیمت خرید و فروش (ریال)، موجودی اولیه
 </span>
 </div>

 <TipBox icon={Warehouse} tone="emerald">
 موجودی اولیه در هنگام درون‌ریزی خودکار ثبت می‌شود — سند رسید انبار و موجودی
 هر کالا بدون کار اضافه ساخته می‌شود.
 </TipBox>
 {done && (
 <TipBox icon={CheckCircle2} tone="emerald">
 این گام تکمیل شده است — {formatNumber(count ?? 0)} کالا در انبار دارید.
 می‌توانید همین حالا «بعدی» را بزنید.
 </TipBox>
 )}
 </div>
 );
}

/** گام ۴ — مشتری‌ها و فروشندگان */
function PartiesBody({
 data,
 onNavigate,
 onRefresh,
 refreshing,
 onDownloadParties,
}: {
 data: OnboardingProgressData | null;
 onNavigate: (m: string) => void;
 onRefresh: () => void;
 refreshing: boolean;
 onDownloadParties: () => void;
}) {
 const count = data ? data.partiesCount : null;
 const done = (count ?? 0) > 0;
 return (
 <div className="space-y-4">
 <p className="text-xs leading-6 text-muted-foreground sm:text-[13px]">
 هر فاکتور به یک طرف‌حساب وصل است — مشتری برای فروش، فروشنده برای خرید.
 لیست مشتری‌ها و فروشندگان را از فایل اکسل قبلی بردارید یا چند مورد پرتکرار را
 دستی ثبت کنید تا اولین فاکتور بدون وقفه صادر شود.
 </p>

 <div className="grid gap-3 sm:grid-cols-2">
 <OptionCard
 icon={Upload}
 title="افزودن از اکسل/CSV"
 desc="لیست مشتریان فایل‌های هلو/سپیدار یا اکسل ساده را درون‌ریزی کنید — نوع «مشتری/فروشنده» خودکار تشخیص داده می‌شود."
 ctaLabel="شروع درون‌ریزی"
 recommended
 onCta={() => onNavigate("data-import-export")}
 />
 <OptionCard
 icon={UserPlus}
 title="ثبت دستی طرف‌حساب"
 desc="در ماژول «مشتریان (CRM)» طرف‌حساب جدید با شمارهٔ تماس و کد اقتصادی ثبت کنید."
 ctaLabel="ثبت دستی طرف‌حساب"
 onCta={() => onNavigate("crm")}
 />
 </div>

 <CountChip count={count} label="طرف‌حساب ثبت شده" onRefresh={onRefresh} refreshing={refreshing} />

 <div className="flex flex-wrap items-center gap-2">
 <Button
 type="button"
 variant="outline"
 size="sm"
 className="h-8 gap-1.5"
 onClick={onDownloadParties}
 >
 <Download className="h-3.5 w-3.5" />
 دانلود فایل نمونه
 </Button>
 <span className="text-[11px] text-muted-foreground">
 هدرها: نوع (مشتری/فروشنده)، نام/نام شرکت، کد اقتصادی، شمارهٔ تماس، ایمیل، آدرس، شهر
 </span>
 </div>

 {done && (
 <TipBox icon={CheckCircle2} tone="emerald">
 {formatNumber(count ?? 0)} طرف‌حساب ثبت شده — این گام تکمیل است.
 </TipBox>
 )}
 </div>
 );
}

/** گام ۵ — اولین فاکتور */
function InvoiceBody({
 data,
 onNavigate,
 onRefresh,
 refreshing,
}: {
 data: OnboardingProgressData | null;
 onNavigate: (m: string) => void;
 onRefresh: () => void;
 refreshing: boolean;
}) {
 const count = data ? data.invoicesCount : null;
 const done = (count ?? 0) > 0;
 const flow: { icon: LucideIcon; title: string; desc: string }[] = [
 { icon: Users, title: "انتخاب طرف‌حساب", desc: "مشتری (فروش) یا فروشنده (خرید)" },
 { icon: Package, title: "افزودن اقلام از انبار", desc: "کالا، تعداد و قیمت — موجودی چک می‌شود" },
 { icon: FileText, title: "ثبت و چاپ", desc: "فاکتور رسمی با اطلاعات کسب‌وکار شما" },
 ];
 return (
 <div className="space-y-4">
 <p className="text-xs leading-6 text-muted-foreground sm:text-[13px]">
 حالا که کالا و طرف‌حساب دارید، اولین فاکتور فروش یا خرید را ثبت کنید — فاکتورهای
 بعدی چند ثانیه‌ای خواهند بود.
 </p>

 {/* جریان فاکتور به‌صورت بصری */}
 <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
 {flow.map((f, i) => (
 <React.Fragment key={f.title}>
 <div className="flex flex-1 items-center gap-3 rounded-xl border border-border/70 bg-card/70 p-3">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <f.icon className="h-5 w-5" />
 </div>
 <div className="min-w-0">
 <p className="text-xs font-bold">
 {toPersianDigits(i + 1)}. {f.title}
 </p>
 <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{f.desc}</p>
 </div>
 </div>
 {i < flow.length - 1 && (
 <ArrowLeft className="hidden h-4 w-4 shrink-0 justify-self-center text-primary/50 sm:block" />
 )}
 </React.Fragment>
 ))}
 </div>

 <Button type="button" className="h-10 w-full gap-2 sm:w-auto" onClick={() => onNavigate("invoices")}>
 <FileText className="h-4 w-4" />
 ثبت اولین فاکتور
 <ArrowLeft className="h-4 w-4" />
 </Button>

 <CountChip count={count} label="فاکتور ثبت شده" onRefresh={onRefresh} refreshing={refreshing} />

 <TipBox icon={Info} tone="emerald">
 پس از فاکتور، سند حسابداری و کاهش موجودی انبار خودکار ثبت می‌شود — نیازی به
 کار دوباره در دفاتر نیست.
 </TipBox>
 {done && (
 <TipBox icon={CheckCircle2} tone="emerald">
 {formatNumber(count ?? 0)} فاکتور ثبت شده — چرخهٔ فروش شما راه افتاده است.
 </TipBox>
 )}
 </div>
 );
}

/** گام ۶ — پایان */
function FinishBody({
 data,
 doneMap,
 onDashboard,
 onAssistant,
}: {
 data: OnboardingProgressData | null;
 doneMap: Record<StepId, boolean>;
 onDashboard: () => void;
 onAssistant: () => void;
}) {
 const remaining = STEP_ORDER.filter((id) => !doneMap[id]);
 const allDone = remaining.length === 0;
 return (
 <div className="space-y-5">
 <div className="flex flex-col items-center gap-2 pt-2 text-center">
 <motion.div
 initial={{ scale: 0, rotate: -12 }}
 animate={{ scale: 1, rotate: 0 }}
 transition={{ type: "spring", stiffness: 260, damping: 16 }}
 className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-500/30"
 >
 <Check className="h-9 w-9" strokeWidth={3} />
 </motion.div>
 <h3 className="text-lg font-extrabold">
 {allDone ? "راه‌اندازی کامل شد" : "راهنمای راه‌اندازی تمام شد"}
 </h3>
 <p className="max-w-md text-xs leading-6 text-muted-foreground">
 {allDone
 ? "کسب‌وکار شما کاملاً آماده است. از این‌جا به بعد فقط کار کنید — همه‌چیز خودکار ثبت می‌شود."
 : `برنامه آماده است؛ ${toPersianDigits(remaining.length)} مورد از کارهای راه‌اندازی مانده که هر وقت خواستید از دکمهٔ «راهنمای راه‌اندازی» در منوی کاربری برگردید.`}
 </p>
 </div>

 {/* خلاصهٔ گام‌ها */}
 <div className="overflow-hidden rounded-xl border border-border/70">
 {STEP_ORDER.map((id, i) => {
 const meta = STEP_META[id];
 const done = doneMap[id];
 const hint: Record<StepId, string> = {
 "company-info": "از «حساب کاربری ← پروفایل»",
 inventory: "از ماژول «انبار و کالا» یا درون‌ریزی اکسل",
 customers: "از ماژول «مشتریان (CRM)»",
 "first-invoice": "از ماژول «خرید و فروش»",
 explore: "با گشتن در منوی کنار و داشبورد",
 };
 return (
 <div
 key={id}
 className={`flex items-center gap-3 px-4 py-2.5 ${
 i > 0 ? "border-t border-border/60" : ""
 } ${done ? "bg-emerald-50/50 dark:bg-emerald-950/20" : ""}`}
 >
 <span
 className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
 done
 ? "bg-emerald-500 text-white"
 : "bg-muted text-muted-foreground"
 }`}
 >
 {done ? <Check className="h-3.5 w-3.5" /> : <meta.icon className="h-3.5 w-3.5" />}
 </span>
 <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-1">
 <span className="text-xs font-bold">{data?.steps.find((s) => s.id === id)?.label ?? meta.short}</span>
 <span
 className={`text-[11px] ${done ? "font-bold text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
 >
 {done ? "انجام شد" : hint[id]}
 </span>
 </div>
 </div>
 );
 })}
 </div>

 <div className="grid gap-2.5 sm:grid-cols-2">
 <Button type="button" size="lg" className="h-11 gap-2" onClick={onDashboard}>
 <LayoutDashboard className="h-4.5 w-4.5" />
 مشاهده داشبورد
 </Button>
 <Button type="button" size="lg" variant="outline" className="h-11 gap-2" onClick={onAssistant}>
 <Bot className="h-4.5 w-4.5" />
 گفتگو با دستیار هوشمند
 </Button>
 </div>
 </div>
 );
}

/* ============ اسکلتون بارگذاری ============ */

function WizardLoadingBody() {
 return (
 <div className="space-y-3 py-2">
 {[72, 100, 88, 64].map((w, i) => (
 <div
 key={i}
 className="h-4 animate-pulse rounded bg-muted-foreground/15"
 style={{ width: `${w}%` }}
 />
 ))}
 <div className="grid gap-3 pt-2 sm:grid-cols-2">
 <div className="h-36 animate-pulse rounded-xl bg-muted-foreground/10" />
 <div className="h-36 animate-pulse rounded-xl bg-muted-foreground/10" />
 </div>
 </div>
 );
}

/* ============ ویزارد اصلی ============ */

export interface SetupWizardProps {
 open: boolean;
 onClose: () => void;
 /** توکن Bearer کاربر برای API پیشرفت */
 token: string;
 /** نام کاربر (fallback تا رسیدن پاسخ API) */
 userName?: string | null;
 /** goToModule اپ‌شل — هدایت به ماژول واقعی؛ ویزارد بعد از هدایت بسته می‌شود */
 onNavigate: (moduleId: string) => void;
}

export function SetupWizard({ open, onClose, token, userName, onNavigate }: SetupWizardProps) {
 const { toast } = useToast();
 const [screen, setScreen] = React.useState<Screen>(0);
 const [data, setData] = React.useState<OnboardingProgressData | null>(null);
 const [percent, setPercent] = React.useState(0);
 const [loading, setLoading] = React.useState(false);
 const [loadError, setLoadError] = React.useState<string | null>(null);
 const [skipCompany, setSkipCompany] = React.useState(false);
 const [exploreDone, setExploreDone] = React.useState(false);
 /** نسخهٔ ref از دادهٔ قبلی — بدون بازسازی useCallback در هر پاسخ API */
 const dataRef = React.useRef<OnboardingProgressData | null>(null);
 /** آیا پیش از این باز شدن، کاربر قبلاً ویزارد را دیده بود؟ (برای پرش به گام ناتمام) */
 const seenBeforeRef = React.useRef(false);
 /** آیا پاسخ اولیهٔ API رسیده تا بتوانیم به گام ناتمام بعدی بپریم */
 const resumeDoneRef = React.useRef(false);
 const dirRef = React.useRef<1 | -1>(1);

 /* ----- دریافت پیشرفت از API ----- */
 const loadProgress = React.useCallback(
 async (opts?: { silent?: boolean }) => {
 if (!token) return;
 if (!opts?.silent) setLoading(true);
 try {
 const res = await fetch("/api/onboarding/progress", {
 headers: { Authorization: `Bearer ${token}` },
 });
 const json = (await res.json()) as ProgressResponse;
 if (!res.ok || !json.success || !json.data) {
 setLoadError(json.error || "خطا در دریافت پیشرفت راه‌اندازی");
 return;
 }
 const prev = dataRef.current;
 dataRef.current = json.data;
 setData(json.data);
 setPercent(Math.min(100, Math.max(0, json.completionPercent ?? 0)));
 setLoadError(null);

 // پرش به اولین گام ناتمام — فقط بار اولِ هر باز شدن و فقط اگر ویزارد
 // را قبلاً دیده باشد (بار اول همیشه از خوش‌آمدگویی شروع می‌شود)
 if (!resumeDoneRef.current) {
 resumeDoneRef.current = true;
 if (seenBeforeRef.current) {
 const steps = json.data.steps;
 const firstUndone = ["company-info", "inventory", "customers", "first-invoice"].find(
 (id) => !steps.find((s) => s.id === id)?.done
 );
 if (firstUndone === "company-info") setScreen(1);
 else if (firstUndone === "inventory") setScreen(2);
 else if (firstUndone === "customers") setScreen(3);
 else if (firstUndone === "first-invoice") setScreen(4);
 else setScreen(5);
 }
 }

 // رویداد برای به‌روزرسانی دکمهٔ شناور هدر
 try {
 window.dispatchEvent(new CustomEvent(ONBOARDING_PROGRESS_CHANGED_EVENT));
 } catch {
 /* ignore */
 }

 // اگر همین حالا گام فعلی تازه تکمیل شده، خبر بده
 if (prev) {
 const announce = (prevCount: number, nextCount: number, label: string) => {
 if (prevCount === 0 && nextCount > 0) {
 toast({
 title: "این مرحله تکمیل شد",
 description: `اولین ${label} ثبت شد و این گام از چک‌لیست سبز شد.`,
 });
 }
 };
 announce(prev.productsCount, json.data.productsCount, "کالا");
 announce(prev.partiesCount, json.data.partiesCount, "طرف‌حساب");
 announce(prev.invoicesCount, json.data.invoicesCount, "فاکتور");
 }
 } catch {
 setLoadError("ارتباط با سرور برقرار نشد");
 } finally {
 setLoading(false);
 }
 },
 [token, toast]
 );

 /* ----- باز شدن: علامت «دیده‌شده» + دریافت وضعیت ----- */
 React.useEffect(() => {
 if (!open) return;
 // ترتیب مهم است: اول چک کنیم قبلاً دیده بوده، بعد علامت بزنیم —
 // وگرنه پرش به گام ناتمام حتی در اولین باز شدن هم فعال می‌شد
 seenBeforeRef.current = hasSeenWizard();
 markWizardSeen();
 resumeDoneRef.current = false;
 try {
 setExploreDone(window.localStorage.getItem(DONE_KEY) === "1");
 } catch {
 /* ignore */
 }
 loadProgress();
 }, [open, loadProgress]);

 /* ----- تازه‌سازی وقتی پنجره دوباره فوکوس می‌گیرد ----- */
 React.useEffect(() => {
 if (!open) return;
 const onFocus = () => loadProgress({ silent: true });
 window.addEventListener("focus", onFocus);
 return () => window.removeEventListener("focus", onFocus);
 }, [open, loadProgress]);

 /* ----- ریست موقع بسته شدن ----- */
 React.useEffect(() => {
 if (!open) {
 const t = setTimeout(() => {
 setScreen(0);
 setSkipCompany(false);
 }, 250);
 return () => clearTimeout(t);
 }
 }, [open]);

 /* ----- map وضعیت گام‌ها (merge با گام کلاینتی «کاوش») ----- */
 const doneMap: Record<StepId, boolean> = React.useMemo(() => {
 const base: Record<StepId, boolean> = {
 "company-info": false,
 inventory: false,
 customers: false,
 "first-invoice": false,
 explore: exploreDone,
 };
 for (const s of data?.steps ?? []) {
 if (s.id in base) base[s.id as StepId] = s.done;
 }
 return base;
 }, [data, exploreDone]);

 /* ----- ناوبری ----- */
 const goNext = React.useCallback(() => {
 dirRef.current = 1;
 setScreen((s) => Math.min(5, s + 1) as Screen);
 }, []);
 const goPrev = React.useCallback(() => {
 dirRef.current = -1;
 setScreen((s) => Math.max(0, s - 1) as Screen);
 }, []);

 /** هدایت به ماژول واقعی — ویزارد بسته می‌شود تا ماژول دیده شود */
 const handleNavigate = React.useCallback(
 (moduleId: string) => {
 onNavigate(moduleId);
 onClose();
 },
 [onNavigate, onClose]
 );

 /** «رد کردن» در خوش‌آمدگویی — ویزارد دیگر خودکار باز نمی‌شود */
 const handleSkip = React.useCallback(() => {
 markWizardDone();
 setExploreDone(true);
 onClose();
 }, [onClose]);

 /** پایان — «مشاهده داشبورد» */
 const handleFinishDashboard = React.useCallback(() => {
 markWizardDone();
 setExploreDone(true);
 onNavigate("dashboard");
 onClose();
 }, [onNavigate, onClose]);

 /** پایان — «گفتگو با دستیار هوشمند» */
 const handleFinishAssistant = React.useCallback(() => {
 markWizardDone();
 setExploreDone(true);
 try {
 window.dispatchEvent(new CustomEvent("hoshhesab:open-assistant"));
 } catch {
 /* ignore */
 }
 onClose();
 }, [onClose]);

 /* ----- دانلود فایل‌های نمونه ----- */
 const handleDownloadProducts = React.useCallback(() => {
 const ok = downloadCsv("hooshhesab-sample-products.csv", PRODUCTS_SAMPLE_CSV);
 toast(
 ok
 ? {
 title: "فایل نمونه ساخته شد",
 description: "فایل CSV کالاها دانلود شد — بعد از تکمیل، در «واردات و صادرکرد داده» درون‌ریزی کنید.",
 }
 : {
 title: "خطا در ساخت فایل",
 description: "مرورگر اجازهٔ دانلود نداد — دوباره تلاش کنید.",
 variant: "destructive",
 }
 );
 }, [toast]);

 const handleDownloadParties = React.useCallback(() => {
 const ok = downloadCsv("hooshhesab-sample-parties.csv", PARTIES_SAMPLE_CSV);
 toast(
 ok
 ? {
 title: "فایل نمونه ساخته شد",
 description: "فایل CSV طرف‌حساب‌ها دانلود شد — بعد از تکمیل، در «واردات و صادرکرد داده» درون‌ریزی کنید.",
 }
 : {
 title: "خطا در ساخت فایل",
 description: "مرورگر اجازهٔ دانلود نداد — دوباره تلاش کنید.",
 variant: "destructive",
 }
 );
 }, [toast]);

 const isWelcome = screen === 0;
 const isFinish = screen === 5;
 const stepperCurrent = isWelcome ? -1 : screen - 1;

 const bodyVariants = {
 enter: (dir: number) => ({ opacity: 0, x: dir === 1 ? -28 : 28 }),
 center: { opacity: 1, x: 0 },
 exit: (dir: number) => ({ opacity: 0, x: dir === 1 ? 28 : -28 }),
 };

 return (
 <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
 <DialogContent
 className="flex h-[min(90dvh,44rem)] w-[min(94vw,48rem)] max-w-3xl flex-col gap-0 overflow-hidden overflow-y-hidden p-0 sm:rounded-2xl"
 showCloseButton={false}
 >
 {/* هدر */}
 <div className="relative shrink-0 border-b border-border/60 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent px-4 py-3.5 sm:px-5">
 <div className="flex items-center justify-between gap-3">
 <div className="flex min-w-0 items-center gap-3">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
 <Sparkles className="h-5 w-5" />
 </div>
 <div className="min-w-0">
 <DialogTitle className="truncate text-sm font-extrabold sm:text-base">
 راه‌اندازی هوش‌حساب — {SCREEN_TITLES[screen]}
 </DialogTitle>
 <DialogDescription className="truncate text-[11px] text-muted-foreground">
 {isWelcome
 ? "مسیر ۱۵ دقیقه‌ای تا اولین فاکتور"
 : `گام ${toPersianDigits(screen)} از ${toPersianDigits(5)}`}
 </DialogDescription>
 </div>
 </div>
 <div className="flex shrink-0 items-center gap-2">
 <Badge
 variant="secondary"
 className="h-6 gap-1 font-bold"
 title="درصد پیشرفت راه‌اندازی (۴ گام اصلی)"
 >
 <ListChecks className="h-3.5 w-3.5 text-primary" />
 {toPersianDigits(percent)}٪
 </Badge>
 <button
 type="button"
 onClick={onClose}
 aria-label="بستن ویزارد"
 className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
 >
 <X className="h-4.5 w-4.5" />
 </button>
 </div>
 </div>
 </div>

 {/* استپر (فقط بعد از خوش‌آمدگویی) + نوار پیشرفت کلی */}
 {!isWelcome && (
 <div className="shrink-0 border-b border-border/60 px-4 pb-3.5 pt-3 sm:px-6">
 <StepperHeader current={stepperCurrent} doneMap={doneMap} />
 <div className="mt-3 flex items-center gap-2">
 <Progress value={percent} className="h-1.5" />
 <span className="shrink-0 text-[10px] font-bold text-muted-foreground">
 {toPersianDigits(percent)}٪ تکمیل
 </span>
 </div>
 </div>
 )}

 {/* بدنه */}
 <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
 {loadError && !data ? (
 <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
 <Info className="h-8 w-8 text-amber-500" />
 <p className="text-sm font-bold">وضعیت راه‌اندازی دریافت نشد</p>
 <p className="max-w-xs text-xs text-muted-foreground">{loadError}</p>
 <Button type="button" variant="outline" size="sm" onClick={() => loadProgress()}>
 <RefreshCw className="h-3.5 w-3.5" />
 تلاش مجدد
 </Button>
 </div>
 ) : loading && !data ? (
 <WizardLoadingBody />
 ) : (
 <AnimatePresence mode="wait" custom={dirRef.current} initial={false}>
 <motion.div
 key={screen}
 custom={dirRef.current}
 variants={bodyVariants}
 initial="enter"
 animate="center"
 exit="exit"
 transition={{ duration: 0.22, ease: "easeOut" }}
 >
 {isWelcome && (
 <WelcomeBody
 data={data}
 userNameFallback={userName}
 onDownloadProducts={handleDownloadProducts}
 />
 )}
 {screen === 1 && (
 <CompanyBody
 data={data}
 onEdit={() => handleNavigate("account")}
 onSkipChecked={(checked) => {
 setSkipCompany(checked);
 if (checked) goNext();
 }}
 skipChecked={skipCompany}
 />
 )}
 {screen === 2 && (
 <InventoryBody
 data={data}
 onNavigate={handleNavigate}
 onRefresh={() => loadProgress()}
 refreshing={loading}
 onDownloadProducts={handleDownloadProducts}
 />
 )}
 {screen === 3 && (
 <PartiesBody
 data={data}
 onNavigate={handleNavigate}
 onRefresh={() => loadProgress()}
 refreshing={loading}
 onDownloadParties={handleDownloadParties}
 />
 )}
 {screen === 4 && (
 <InvoiceBody
 data={data}
 onNavigate={handleNavigate}
 onRefresh={() => loadProgress()}
 refreshing={loading}
 />
 )}
 {isFinish && (
 <FinishBody
 data={data}
 doneMap={doneMap}
 onDashboard={handleFinishDashboard}
 onAssistant={handleFinishAssistant}
 />
 )}
 </motion.div>
 </AnimatePresence>
 )}
 </div>

 {/* فوتر */}
 <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-card/70 px-4 py-3 sm:px-6">
 <div className="flex items-center gap-2">
 {!isWelcome && (
 <Button type="button" variant="ghost" size="sm" className="h-9 gap-1.5" onClick={goPrev}>
 <ArrowRight className="h-4 w-4" />
 قبلی
 </Button>
 )}
 </div>
 <div className="flex flex-wrap items-center gap-2">
 {isWelcome && (
 <button
 type="button"
 onClick={handleSkip}
 className="rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
 >
 رد کردن
 </button>
 )}
 {!isWelcome && !isFinish && screen >= 2 && (
 <button
 type="button"
 onClick={onClose}
 className="rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
 title="ویزارد بسته می‌شود اما پیشرفت حفظ می‌شود"
 >
 بعداً ادامه می‌دهم
 </button>
 )}
 {isWelcome ? (
 <Button type="button" className="h-9 gap-1.5" onClick={goNext}>
 شروع راه‌اندازی
 <ArrowLeft className="h-4 w-4" />
 </Button>
 ) : isFinish ? (
 <Button type="button" className="h-9 gap-1.5" onClick={handleFinishDashboard}>
 <LayoutDashboard className="h-4 w-4" />
 مشاهده داشبورد
 </Button>
 ) : (
 <Button type="button" className="h-9 gap-1.5" onClick={goNext}>
 بعدی
 <ArrowLeft className="h-4 w-4" />
 </Button>
 )}
 </div>
 </div>
 </DialogContent>
 </Dialog>
 );
}

export default SetupWizard;

/* ============ دکمهٔ شناور «راه‌اندازی — X٪» (هدر) ============ */

/**
 * دکمهٔ جمع‌وجمرو همیشگی در هدر — راه‌اندازی را همیشه قابل ازسرگیری می‌کند.
 * فقط وقتی دیده می‌شود که: کاربر وارد شده باشد + پیشرفت < ۱۰۰٪ + ویزارد
 * رد/تکمیل نشده باشد. خودش پیشرفت را می‌گیرد (در فوکوس پنجره + رویداد
 * تغییر پیشرفت از ویزارد) تا اپ‌شل هیچ state اضافه‌ای لازم نداشته باشد.
 */
export function SetupWizardPill({ token, onOpen }: { token: string; onOpen: () => void }) {
 const [percent, setPercent] = React.useState<number | null>(null);
 const [visible, setVisible] = React.useState(false);

 const load = React.useCallback(async () => {
 if (!token) return;
 try {
 const res = await fetch("/api/onboarding/progress", {
 headers: { Authorization: `Bearer ${token}` },
 });
 if (!res.ok) {
 setVisible(false);
 return;
 }
 const json = (await res.json()) as ProgressResponse;
 if (!json.success || !json.data) {
 setVisible(false);
 return;
 }
 const pct = Math.min(100, Math.max(0, json.completionPercent ?? 0));
 setPercent(pct);
 setVisible(pct < 100 && !isSetupWizardDone());
 } catch {
 /* آفلاین/خطا → دکمه را نشان نده */
 setVisible(false);
 }
 }, [token]);

 React.useEffect(() => {
 load();
 }, [load]);

 React.useEffect(() => {
 const onChange = () => load();
 window.addEventListener(ONBOARDING_PROGRESS_CHANGED_EVENT, onChange as EventListener);
 window.addEventListener("focus", onChange);
 return () => {
 window.removeEventListener(ONBOARDING_PROGRESS_CHANGED_EVENT, onChange as EventListener);
 window.removeEventListener("focus", onChange);
 };
 }, [load]);

 if (!visible || percent === null) return null;

 return (
 <button
 type="button"
 onClick={onOpen}
 aria-label={`راه‌اندازی کسب‌وکار — ${toPersianDigits(percent)} درصد تکمیل`}
 title="راهنمای گام‌به‌گام راه‌اندازی کسب‌وکار"
 className="inline-flex h-9 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 text-xs font-bold text-primary shadow-sm transition-all hover:bg-primary/20 hover:shadow-md"
 >
 <Rocket className="h-3.5 w-3.5" />
 <span className="hidden sm:inline">راه‌اندازی</span>
 <span className="font-extrabold">{toPersianDigits(percent)}٪</span>
 </button>
 );
}
