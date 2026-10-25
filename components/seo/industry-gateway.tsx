"use client";

// ============ IndustryGateway — «گت‌وی تشخیص صنف» ============
// v35.7 (نقشهٔ راه ۳-۴ سند پیشنهادهای ارتقا): بازدیدکنندهٔ /industries
// با ۳ سوال کوتاه به صنف خودش می‌رسد (شمولیت قیف — کسی که صنفش را
// نمی‌داند هم وارد صفحهٔ صنف اختصاصی می‌شود).
//
// طراحی — هم‌سبک PlanQuiz (v35.6):
// - ۳ سوال تک‌انتخابی (نوع کسب‌وکار / چالش اصلی / اندازهٔ تیم)
// - امتیازدهی وزنی به ۱۰ صنف واقعی lib/industry-data.ts
// - نتیجه: صنف مطابق + ماژول‌های کلیدی + لینک صفحهٔ صنف + CTA
// - ترنزیشن CSS خالص (بدون framer-motion — سبک برای سندباکس کم‌حافظه)
// - prefers-reduced-motion + اعداد فارسی + بدون آبی/ایندیگو
// ============================================================

import * as React from "react";
import {
        Store,
        Boxes,
        Factory,
        HardHat,
        Globe,
        Briefcase,
        Calculator,
        Stethoscope,
        Utensils,
        GraduationCap,
        CheckCircle2,
        ArrowRight,
        ArrowLeft,
        RotateCcw,
        HelpCircle,
        Coins,
        TrendingUp,
        MapPin,
        type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toPersianDigits } from "@/lib/persian";

// ---------- داده‌های صنف (آینهٔ lib/industry-data.ts — کلاینت‌ساید سبک) ----------

interface IndustryLite {
        slug: string;
        name: string;
        icon: LucideIcon;
        modules: string[];
}

const INDUSTRIES: IndustryLite[] = [
        { slug: "retail", name: "خرده‌فروشی", icon: Store, modules: ["صندوق فروش (POS)", "فاکتور سریع", "انبار"] },
        { slug: "wholesale", name: "عمده‌فروشی", icon: Boxes, modules: ["قیمت‌گذاری پلکانی", "پورتال تأمین", "چند انبار"] },
        { slug: "manufacturing", name: "تولیدی", icon: Factory, modules: ["BOM و ساخت", "حقوق و دستمزد", "کنترل کیفیت"] },
        { slug: "construction", name: "پیمانکاری", icon: HardHat, modules: ["حسابداری پروژه", "چک و خزانه", "سن فاکتور"] },
        { slug: "ecommerce", name: "فروشگاه آنلاین", icon: Globe, modules: ["اتصال ووکامرس", "داشبورد دیجی‌کالا", "پورتال مشتری"] },
        { slug: "services", name: "خدماتی", icon: Briefcase, modules: ["فاکتور خدماتی", "CRM", "اشتراک دوره‌ای"] },
        { slug: "accounting-firms", name: "دفاتر حسابداری", icon: Calculator, modules: ["چکارخانهٔ مشتریان", "اصلاحات سالانه", "قدرا"] },
        { slug: "clinic", name: "درمانی", icon: Stethoscope, modules: ["صورتحساب درمانی", "نوبت و بیمه", "دستمزد پزشکان"] },
        { slug: "restaurant", name: "رستوران", icon: Utensils, modules: ["POS رستوران", "موجودی مواد اولیه", "فروش شعبه"] },
        { slug: "education", name: "آموزشی", icon: GraduationCap, modules: ["شهریه و اقساط", "قرارداد مدرسان", "گزارش کلاس"] },
];

const BY_SLUG = new Map(INDUSTRIES.map((i) => [i.slug, i]));

// ---------- سوال ۱: نوع کسب‌وکار (وزن اصلی) ----------

type BizKind =
        | "physical"
        | "wholesale"
        | "production"
        | "online"
        | "service"
        | "health-ed";

const Q1_OPTIONS: {
        value: BizKind;
        icon: LucideIcon;
        title: string;
        sub: string;
        scores: Partial<Record<string, number>>;
}[] = [
        {
                value: "physical",
                icon: Store,
                title: "فروش حضوری به مشتری",
                sub: "فروشگاه، سوپرمارکت، داروخانه، کافه یا رستوران",
                scores: { retail: 5, restaurant: 4, clinic: 1 },
        },
        {
                value: "wholesale",
                icon: Boxes,
                title: "فروش عمده به کسب‌وکارها",
                sub: "پخش، توزیع یا واردات با قیمت‌های متفاوت",
                scores: { wholesale: 5, retail: 2, ecommerce: 1 },
        },
        {
                value: "production",
                icon: Factory,
                title: "تولید یا تبدیل کالا",
                sub: "کارخانه، کارگاه تولیدی، بسته‌بندی",
                scores: { manufacturing: 5, wholesale: 2 },
        },
        {
                value: "online",
                icon: Globe,
                title: "فروش آنلاین",
                sub: "سایت، اینستاگرام، دیجی‌کالا یا ووکامرس",
                scores: { ecommerce: 5, retail: 3 },
        },
        {
                value: "service",
                icon: Briefcase,
                title: "ارائهٔ خدمات یا پروژه",
                sub: "مشاوره، پیمانکاری، آموزش، خدمات فنی",
                scores: { services: 5, construction: 3, education: 2, "accounting-firms": 2 },
        },
        {
                value: "health-ed",
                icon: Stethoscope,
                title: "درمانی یا آموزشی",
                sub: "کلینیک، مطب، مدرسه یا مؤسسهٔ آموزشی",
                scores: { clinic: 5, education: 5, services: 1 },
        },
];

// ---------- سوال ۲: چالش اصلی (تفکیک صنف‌های هم‌خانواده) ----------

type PainKind = "inventory" | "receivables" | "tax" | "payroll";

const Q2_OPTIONS: {
        value: PainKind;
        icon: LucideIcon;
        title: string;
        sub: string;
        scores: Partial<Record<string, number>>;
}[] = [
        {
                value: "inventory",
                icon: Boxes,
                title: "موجودی انبار و قیمت کالاها",
                sub: "ردیابی موجودی، کسری انبار، قیمت چندلایه",
                scores: { retail: 2, wholesale: 2, manufacturing: 2, ecommerce: 1, restaurant: 2 },
        },
        {
                value: "receivables",
                icon: Coins,
                title: "طلب از مشتری‌ها و چک‌ها",
                sub: "پیگیری بدهی، سررسید چک، نقدینگی",
                scores: { construction: 2, services: 2, "accounting-firms": 2, wholesale: 1 },
        },
        {
                value: "tax",
                icon: Calculator,
                title: "صورتحساب مودیان و مالیات",
                sub: "ارسال قانونی، ارزش افزوده، گزارش‌های دوره‌ای",
                scores: { retail: 1, wholesale: 1, manufacturing: 1, ecommerce: 1, services: 1, clinic: 1, education: 1 },
        },
        {
                value: "payroll",
                icon: TrendingUp,
                title: "حقوق پرسنل و دستمزد",
                sub: "لیست حقوق، بیمه، سنوات",
                scores: { manufacturing: 2, clinic: 2, education: 2, restaurant: 1, "accounting-firms": 1 },
        },
];

// ---------- سوال ۳: اندازهٔ تیم (پلن‌پیشنهاد در نتیجه) ----------

type TeamKind = "solo" | "small" | "multi";

const Q3_OPTIONS: {
        value: TeamKind;
        icon: LucideIcon;
        title: string;
        sub: string;
        scores: Partial<Record<string, number>>;
        planHint: string;
}[] = [
        {
                value: "solo",
                icon: MapPin,
                title: "فقط خودم",
                sub: "یک نفر کارهای مالی را انجام می‌دهد",
                scores: { retail: 1, services: 1 },
                planHint: "پلن پایه — تک‌کاربره با همهٔ ضروری‌ها",
        },
        {
                value: "small",
                icon: CheckCircle2,
                title: "۲ تا ۵ نفر",
                sub: "فروشنده، انباردار یا حسابدار داریم",
                scores: { wholesale: 1, manufacturing: 1, ecommerce: 1, education: 1 },
                planHint: "پلن حرفه‌ای — ۲ کاربر + هوش مصنوعی",
        },
        {
                value: "multi",
                icon: Boxes,
                title: "بیشتر یا چند شعبه",
                sub: "تیم مالی، چند شعبه یا چند شرکت",
                scores: { manufacturing: 1, "accounting-firms": 2, construction: 1, clinic: 1, restaurant: 1 },
                planHint: "پلن سازمانی — کاربر نامحدود + پشتیبانی اختصاصی",
        },
];

const QUESTIONS = [
        { key: "biz", title: "کسب‌وکار شما چگونه درآمد می‌سازد؟", hint: "نوع اصلی فعالیت را انتخاب کنید" },
        { key: "pain", title: "بزرگ‌ترین چالش مالی شما چیست؟", hint: "چیزی که بیشترین وقت شما را می‌گیرد" },
        { key: "team", title: "چند نفر با سیستم کار می‌کنند؟", hint: "برای پیشنهاد پلن مناسب" },
] as const;

// ---------- کامپوننت اصلی ----------

export function IndustryGateway() {
        const [step, setStep] = React.useState(0);
        const [dir, setDir] = React.useState<"fwd" | "back">("fwd");
        const [visible, setVisible] = React.useState(true);
        const [answers, setAnswers] = React.useState<{
                biz: BizKind | null;
                pain: PainKind | null;
                team: TeamKind | null;
        }>({ biz: null, pain: null, team: null });

        const reduceMotion =
                typeof window !== "undefined" &&
                window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

        const transition = (next: number, direction: "fwd" | "back") => {
                if (reduceMotion) {
                        setStep(next);
                        setDir(direction);
                        return;
                }
                setVisible(false);
                setDir(direction);
                window.setTimeout(() => {
                        setStep(next);
                        setVisible(true);
                }, 180);
        };

        const pick = (key: "biz" | "pain" | "team", value: string) => {
                setAnswers((a) => ({ ...a, [key]: value }));
                window.setTimeout(() => {
                        if (step < 2) transition(step + 1, "fwd");
                }, 240);
        };

        const goBack = () => {
                if (step > 0) transition(step - 1, "back");
        };

        const restart = () => {
                setAnswers({ biz: null, pain: null, team: null });
                transition(0, "back");
        };

        // ---------- امتیازدهی ----------
        const result = React.useMemo(() => {
                // FIX: نتیجه فقط بعد از پاسخ هر ۳ سوال محاسبه شود (قبلاً بعد از سوال ۱ می‌پرید)
                if (!answers.biz || !answers.pain || !answers.team) return null;
                const scores: Record<string, number> = {};
                const add = (map: Partial<Record<string, number>>) => {
                        for (const [k, v] of Object.entries(map)) scores[k] = (scores[k] ?? 0) + (v ?? 0);
                };
                const q1 = Q1_OPTIONS.find((o) => o.value === answers.biz);
                if (q1) add(q1.scores);
                const q2 = Q2_OPTIONS.find((o) => o.value === answers.pain);
                if (q2) add(q2.scores);
                const q3 = Q3_OPTIONS.find((o) => o.value === answers.team);
                if (q3) add(q3.scores);
                // قانون: نتیجه باید از خانوادهٔ سوال ۱ باشد (نوع کسب‌وکار تعیین‌کننده است)
                const family = q1 ? Object.keys(q1.scores) : [];
                let best: { slug: string; score: number } | null = null;
                for (const k of family) {
                        const s = scores[k] ?? 0;
                        if (!best || s > best.score) best = { slug: k, score: s };
                }
                if (!best) return null;
                const ind = BY_SLUG.get(best.slug);
                if (!ind) return null;
                const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
                const confidence = Math.min(97, Math.round((best.score / total) * 100));
                return { industry: ind, confidence, planHint: q3?.planHint ?? "" };
        }, [answers]);

        const progressPct = result ? 100 : (step / 3) * 100;

        return (
                <section
                        aria-label="گت‌وی تشخیص صنف"
                        className="relative mb-10 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm"
                >
                        {/* نوار لهجهٔ گرادیانی */}
                        <div
                                className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-emerald-500 via-teal-400 to-amber-400"
                                aria-hidden="true"
                        />
                        {/* بافت نقطه‌ای */}
                        <div
                                className="pointer-events-none absolute inset-0 opacity-25 dark:opacity-15"
                                style={{
                                        backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
                                        backgroundSize: "20px 20px",
                                        color: "rgb(16 185 129 / 0.07)",
                                        maskImage: "radial-gradient(ellipse 70% 60% at 50% 20%, black 20%, transparent 80%)",
                                        WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 20%, black 20%, transparent 80%)",
                                }}
                                aria-hidden="true"
                        />

                        <div className="relative p-5 sm:p-8">
                                {/* هدر */}
                                <div className="mb-6 flex flex-col items-center gap-2 text-center">
                                        <Badge className="bg-primary/10 text-primary" variant="secondary">
                                                <HelpCircle className="ml-1 h-3 w-3" />
                                                راهنمای انتخاب صنف
                                        </Badge>
                                        <h2 className="text-xl font-bold text-foreground sm:text-2xl">
                                                صنف کسب‌وکار خود را در ۳۰ ثانیه پیدا کنید
                                        </h2>
                                        <p className="max-w-xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
                                                ۳ سوال کوتاه — مستقیم به صفحهٔ راهکار اختصاصی صنف خودتان می‌رسید:
                                                ماژول‌های لازم، قالب‌های آماده و چک‌لیست راه‌اندازی.
                                        </p>
                                </div>

                                {/* نوار پیشرفت */}
                                {!result && (
                                        <div className="mb-6" aria-hidden="true">
                                                <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                                                        <span>
                                                                سوال {toPersianDigits(step + 1)} از {toPersianDigits(QUESTIONS.length)}
                                                        </span>
                                                        <span className="tabular-nums">{toPersianDigits(Math.round(progressPct))}٪</span>
                                                </div>
                                                <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
                                                        <div
                                                                className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-teal-400 transition-all duration-500"
                                                                style={{ width: `${Math.max(10, progressPct)}%` }}
                                                        />
                                                </div>
                                        </div>
                                )}

                                {/* بدنه */}
                                <div
                                        className={`transition-all duration-200 motion-reduce:transition-none ${
                                                visible
                                                        ? "translate-y-0 opacity-100"
                                                        : dir === "fwd"
                                                                ? "-translate-y-2 opacity-0"
                                                                : "translate-y-2 opacity-0"
                                        }`}
                                >
                                        {/* سوال‌ها */}
                                        {!result && step === 0 && (
                                                <div>
                                                        <h3 className="mb-1 text-base font-bold text-foreground sm:text-lg">
                                                                {QUESTIONS[0].title}
                                                        </h3>
                                                        <p className="mb-4 text-xs text-muted-foreground">{QUESTIONS[0].hint}</p>
                                                        <div className="grid gap-2.5 sm:grid-cols-2">
                                                                {Q1_OPTIONS.map((o) => (
                                                                        <OptionRow
                                                                                key={o.value}
                                                                                icon={o.icon}
                                                                                title={o.title}
                                                                                sub={o.sub}
                                                                                selected={answers.biz === o.value}
                                                                                onSelect={() => pick("biz", o.value)}
                                                                        />
                                                                ))}
                                                        </div>
                                                </div>
                                        )}

                                        {!result && step === 1 && (
                                                <div>
                                                        <h3 className="mb-1 text-base font-bold text-foreground sm:text-lg">
                                                                {QUESTIONS[1].title}
                                                        </h3>
                                                        <p className="mb-4 text-xs text-muted-foreground">{QUESTIONS[1].hint}</p>
                                                        <div className="grid gap-2.5 sm:grid-cols-2">
                                                                {Q2_OPTIONS.map((o) => (
                                                                        <OptionRow
                                                                                key={o.value}
                                                                                icon={o.icon}
                                                                                title={o.title}
                                                                                sub={o.sub}
                                                                                selected={answers.pain === o.value}
                                                                                onSelect={() => pick("pain", o.value)}
                                                                        />
                                                                ))}
                                                        </div>
                                                </div>
                                        )}

                                        {!result && step === 2 && (
                                                <div>
                                                        <h3 className="mb-1 text-base font-bold text-foreground sm:text-lg">
                                                                {QUESTIONS[2].title}
                                                        </h3>
                                                        <p className="mb-4 text-xs text-muted-foreground">{QUESTIONS[2].hint}</p>
                                                        <div className="grid gap-2.5 sm:grid-cols-3">
                                                                {Q3_OPTIONS.map((o) => (
                                                                        <OptionRow
                                                                                key={o.value}
                                                                                icon={o.icon}
                                                                                title={o.title}
                                                                                sub={o.sub}
                                                                                selected={answers.team === o.value}
                                                                                onSelect={() => pick("team", o.value)}
                                                                        />
                                                                ))}
                                                        </div>
                                                </div>
                                        )}

                                        {/* نتیجه */}
                                        {result && (
                                                <div className="text-center">
                                                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/15 to-teal-500/10 text-emerald-600 dark:text-emerald-400">
                                                                <result.industry.icon className="h-8 w-8" />
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">صنف مناسب شما</p>
                                                        <h3 className="mt-1 text-xl font-extrabold text-foreground sm:text-2xl">
                                                                {result.industry.name}
                                                        </h3>
                                                        <div className="mx-auto mt-3 flex max-w-md items-center justify-center gap-2">
                                                                <div className="h-1.5 w-36 overflow-hidden rounded-full bg-muted/60">
                                                                        <div
                                                                                className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-teal-400"
                                                                                style={{ width: `${result.confidence}%` }}
                                                                        />
                                                                </div>
                                                                <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                                                                        {toPersianDigits(result.confidence)}٪ تطابق
                                                                </span>
                                                        </div>

                                                        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                                                                {result.industry.modules.map((m) => (
                                                                        <span
                                                                                key={m}
                                                                                className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/5 px-3 py-1.5 text-[11px] font-medium text-foreground"
                                                                        >
                                                                                <CheckCircle2 className="h-3 w-3 text-emerald-500" aria-hidden="true" />
                                                                                {m}
                                                                        </span>
                                                                ))}
                                                        </div>

                                                        {result.planHint && (
                                                                <p className="mt-4 text-xs text-muted-foreground">
                                                                        پیشنهاد پلن: <span className="font-bold text-foreground">{result.planHint}</span>
                                                                </p>
                                                        )}

                                                        <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
                                                                <a
                                                                        href={`/industries/${result.industry.slug}`}
                                                                        className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-l from-primary to-primary/85 px-6 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 hover:shadow-xl"
                                                                >
                                                                        راهکار کامل {result.industry.name}
                                                                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                                                </a>
                                                                <button
                                                                        type="button"
                                                                        onClick={restart}
                                                                        className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-border/60 px-4 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                                                                >
                                                                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                                                                        تکرار آزمون
                                                                </button>
                                                        </div>
                                                </div>
                                        )}
                                </div>

                                {/* ناوبری پایین */}
                                {!result && step > 0 && (
                                        <div className="mt-5 flex items-center justify-between">
                                                <button
                                                        type="button"
                                                        onClick={goBack}
                                                        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                                                >
                                                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                                                        سوال قبلی
                                                </button>
                                                <span className="text-[10px] text-muted-foreground/60">
                                                        پاسخ‌ها ذخیره نمی‌شوند — فقط برای پیشنهاد
                                                </span>
                                        </div>
                                )}
                        </div>
                </section>
        );
}

// ---------- کارت گزینه (هم‌سبک PlanQuiz) ----------

function OptionRow({
        icon: Icon,
        title,
        sub,
        selected,
        onSelect,
}: {
        icon: React.ComponentType<{ className?: string }>;
        title: string;
        sub: string;
        selected: boolean;
        onSelect: () => void;
}) {
        return (
                <button
                        type="button"
                        onClick={onSelect}
                        aria-pressed={selected}
                        className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border p-3.5 text-right transition-all duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 sm:p-4 ${
                                selected
                                        ? "border-emerald-500/70 bg-emerald-50/80 shadow-sm shadow-emerald-500/10 dark:border-emerald-500/50 dark:bg-emerald-950/30"
                                        : "border-border/80 bg-card hover:border-emerald-400/40 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/15"
                        }`}
                >
                        <span
                                className={`absolute inset-y-0 right-0 w-1 transition-all duration-300 ${
                                        selected ? "bg-gradient-to-b from-emerald-500 to-teal-400" : "bg-transparent"
                                }`}
                                aria-hidden="true"
                        />
                        <span
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                                        selected
                                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                                : "bg-muted text-muted-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400"
                                }`}
                                aria-hidden="true"
                        >
                                <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-foreground">{title}</span>
                                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{sub}</span>
                        </span>
                        {selected && (
                                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden="true" />
                        )}
                </button>
        );
}
