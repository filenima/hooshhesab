"use client";

// ============ PlanQuiz — «کدام پلن برای من؟» ============
// v35.6 (نقشهٔ راه ۲-۴ سند پیشنهادهای ارتقا): کوییز ۵ سوالی تعاملی که
// بر اساس پاسخ‌ها پلن مناسب را پیشنهاد می‌دهد — کاهش بار شناختی خریدارِ
// مردد («کدام پلن؟») با تجربه‌ای شبیه گفت‌وگو با مشاور فروش.
//
// طراحی:
// - ۵ سوال تک‌مرحله‌ای + یک سوال چندانتخابی (قابلیت‌های ضروری)
// - نوار پیشرفت + شمارهٔ سوال + دکمهٔ بازگشت
// - منطق امتیازدهی همان قواعد واقعی پلن‌ها (سازگار با CostCalculator)
// - نتیجه: پلن پیشنهادی + دلایل + قیمت سالانه + CTA
// - انیمیشن CSS خالص (بدون framer-motion — سبک‌تر برای سندباکس کم‌حافظه)
// - احترام به prefers-reduced-motion
// - بدون آبی/ایندیگو؛ پالت emerald/teal/amber؛ اعداد فارسی

import * as React from "react";
import {
  Store,
  Wrench,
  Factory,
  Building2,
  User,
  Users,
  UsersRound,
  FileText,
  FileStack,
  Files,
  Coins,
  Sparkles,
  ShoppingCart,
  Plug,
  Minus,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  PartyPopper,
  HelpCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber, toPersianDigits } from "@/lib/persian";

// ---------- انواع ----------

export interface QuizPlan {
  id: string;
  name: string;
  priceToman: number;
  popular?: boolean;
}

interface PlanQuizProps {
  plans: QuizPlan[];
  /** داخل اپ: چک‌اوت باز می‌شود؛ صفحهٔ عمومی: لینک /?buy= */
  onSelectPlan?: (planId: string) => void;
}

type BizType = "retail" | "service" | "manufacturing" | "contractor";
type TeamSize = "solo" | "small" | "team";
type Volume = "low" | "mid" | "high";
type Growth = "stable" | "mild" | "fast";
type Feature = "payroll" | "ai" | "ecommerce" | "api";

interface Answers {
  bizType: BizType | null;
  team: TeamSize | null;
  volume: Volume | null;
  features: Feature[];
  growth: Growth | null;
}

// ---------- سوال‌ها ----------

const BIZ_TYPE_OPTIONS: {
  value: BizType;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub: string;
}[] = [
  { value: "retail", icon: Store, title: "فروشگاهی / خرده‌فروشی", sub: "فروش حضوری یا آنلاین کالا" },
  { value: "service", icon: Wrench, title: "خدماتی", sub: "مشاوره، کلینیک، آژانس و…" },
  { value: "manufacturing", icon: Factory, title: "تولیدی", sub: "خط تولید، مونتاژ، بسته‌بندی" },
  { value: "contractor", icon: Building2, title: "پیمانکاری / سازمانی", sub: "پروژه، صورت‌وضعیت، تیم بزرگ" },
];

const TEAM_OPTIONS: {
  value: TeamSize;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub: string;
}[] = [
  { value: "solo", icon: User, title: "فقط خودم", sub: "یک نفر همه‌کارها را انجام می‌دهد" },
  { value: "small", icon: Users, title: "۲ تا ۳ نفر", sub: "خودم + حسابدار یا انباردار" },
  { value: "team", icon: UsersRound, title: "۴ نفر یا بیشتر", sub: "تیم حسابداری و اداری" },
];

const VOLUME_OPTIONS: {
  value: Volume;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub: string;
}[] = [
  { value: "low", icon: FileText, title: "کمتر از ۱۰۰", sub: "فروش کم‌تعداد اما پر‌مبلغ" },
  { value: "mid", icon: FileStack, title: "۱۰۰ تا ۵۰۰", sub: "فروش روزانهٔ معمول کسب‌وکار" },
  { value: "high", icon: Files, title: "بیشتر از ۵۰۰", sub: "فروش بالای فروشگاهی / عمده" },
];

const FEATURE_OPTIONS: {
  value: Feature;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub: string;
}[] = [
  { value: "payroll", icon: Coins, title: "حقوق و دستمزد", sub: "لیست حقوق کارمندان و بیمه" },
  { value: "ai", icon: Sparkles, title: "هوش مصنوعی", sub: "OCR فاکتور، پیش‌بینی نقدی، چت‌بات" },
  { value: "ecommerce", icon: ShoppingCart, title: "فروشگاه آنلاین", sub: "اتصال ووکامرس / دیجی‌کالا / باسلام" },
  { value: "api", icon: Plug, title: "API و یکپارچه‌سازی", sub: "اتصال به نرم‌افزارهای دیگر" },
];

const GROWTH_OPTIONS: {
  value: Growth;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub: string;
}[] = [
  { value: "stable", icon: Minus, title: "نه، فعلاً پایداریم", sub: "همین اندازه کافی است" },
  { value: "mild", icon: ArrowRight, title: "رشد ملایم", sub: "افزایش تدریجی مشتری و فروش" },
  { value: "fast", icon: PartyPopper, title: "رشد سریع", sub: "تیم بزرگ‌تر و فروش چندبرابر" },
];

const QUESTIONS = [
  { key: "bizType", title: "کسب‌وکار شما چه نوعی است؟", hint: "برای تنظیم ماژول‌های پیش‌فرض" },
  { key: "team", title: "چند نفر با نرم‌افزار کار می‌کنند؟", hint: "کاربر هم‌زمان با دسترسی جدا" },
  { key: "volume", title: "در ماه چند فاکتور صادر می‌کنید؟", hint: "تخمینی کافی است" },
  { key: "features", title: "کدام قابلیت‌ها برایتان ضروری است؟", hint: "چند گزینه هم‌زمان قابل انتخاب است" },
  { key: "growth", title: "برنامهٔ رشد سال آینده چطور است؟", hint: "پلن باید فردای شما را هم پوشش دهد" },
] as const;

// ---------- منطق پیشنهاد (سازگار با قواعد واقعی پلن‌ها) ----------

function scoreAnswers(a: Answers): {
  planId: string;
  reasons: string[];
} {
  const reasons: string[] = [];

  // نگاشت پاسخ‌ها به نیازهای عددی — همان مقیاس CostCalculator
  let users = a.team === "solo" ? 1 : a.team === "small" ? 3 : 6;
  const invoicesPerMonth = a.volume === "low" ? 80 : a.volume === "mid" ? 300 : 800;
  let warehouses = a.bizType === "retail" ? 2 : a.bizType === "manufacturing" ? 3 : 1;

  if (a.growth === "fast") {
    users += 1;
    reasons.push("برنامهٔ رشد سریع دارید");
  } else if (a.growth === "mild" && reasons.length === 0) {
    // دلیل اصلی نیست ولی در سکوت ذکر نمی‌شود
  }

  const yearlyInvoices = invoicesPerMonth * 12;
  const needPayroll = a.features.includes("payroll");
  const needAi = a.features.includes("ai");
  const needEcommerce = a.features.includes("ecommerce");
  const needApi = a.features.includes("api");

  let planId = "basic";

  if (users > 4 || warehouses > 6 || yearlyInvoices > 15000) {
    planId = "enterprise";
    if (users > 4) reasons.push("تیم ۴+ نفره یا رشد سریع");
    if (yearlyInvoices > 15000) reasons.push(`بیش از ${formatNumber(15000)} فاکتور در سال`);
  } else if (
    users > 2 ||
    warehouses > 4 ||
    needPayroll ||
    needAi ||
    needEcommerce ||
    needApi ||
    a.bizType === "contractor"
  ) {
    planId = "pro";
    if (users > 2) reasons.push("بیش از ۲ کاربر هم‌زمان");
    if (needPayroll) reasons.push("حقوق و دستمزد");
    if (needAi) reasons.push("هوش مصنوعی (OCR و پیش‌بینی)");
    if (needEcommerce) reasons.push("اتصال فروشگاه آنلاین");
    if (needApi) reasons.push("API و یکپارچه‌سازی");
    if (a.bizType === "contractor" && !needPayroll && !needAi && !needEcommerce && !needApi && users <= 2) {
      reasons.push("ماژول پیمانکاری و صورت‌وضعیت");
    }
  } else {
    planId = "basic";
    reasons.push("شروع سبک و مقرون‌به‌صرفه");
    if (a.team === "solo") reasons.push("کاربر تک‌نفره");
    if (a.volume === "low") reasons.push("حجم فاکتور کم");
  }

  return { planId, reasons: reasons.slice(0, 4) };
}

// ---------- اجزای کوچک ----------

function OptionCard({
  icon: Icon,
  title,
  sub,
  selected,
  onSelect,
  compact,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub: string;
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border p-3.5 text-right transition-all duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 ${
        compact ? "sm:p-3" : "sm:p-4"
      } ${
        selected
          ? "border-emerald-500/70 bg-emerald-50/80 shadow-sm shadow-emerald-500/10 dark:border-emerald-500/50 dark:bg-emerald-950/30"
          : "border-border/80 bg-card hover:border-emerald-400/40 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/15"
      }`}
    >
      {/* نوار لهجهٔ انتخاب */}
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

// ---------- کامپوننت اصلی ----------

export function PlanQuiz({ plans, onSelectPlan }: PlanQuizProps) {
  const [step, setStep] = React.useState(0); // 0..4 سوال، 5 = نتیجه
  const [dir, setDir] = React.useState<"fwd" | "back">("fwd");
  const [answers, setAnswers] = React.useState<Answers>({
    bizType: null,
    team: null,
    volume: null,
    features: [],
    growth: null,
  });
  const [visible, setVisible] = React.useState(true);

  const result = React.useMemo(
    () => (step === 5 ? scoreAnswers(answers) : null),
    [step, answers]
  );
  const recommended = result
    ? plans.find((p) => p.id === result.planId) || plans[plans.length - 1]
    : null;

  const goNext = React.useCallback(() => {
    setDir("fwd");
    setVisible(false);
    window.setTimeout(() => {
      setStep((s) => Math.min(5, s + 1));
      setVisible(true);
    }, 180);
  }, []);

  const goBack = React.useCallback(() => {
    setDir("back");
    setVisible(false);
    window.setTimeout(() => {
      setStep((s) => Math.max(0, s - 1));
      setVisible(true);
    }, 180);
  }, []);

  const restart = React.useCallback(() => {
    setDir("back");
    setVisible(false);
    window.setTimeout(() => {
      setAnswers({ bizType: null, team: null, volume: null, features: [], growth: null });
      setStep(0);
      setVisible(true);
    }, 180);
  }, []);

  const q = QUESTIONS[step];
  const progressPct = (step / QUESTIONS.length) * 100;

  const resultCta = onSelectPlan && recommended ? (
    <Button
      onClick={() => onSelectPlan(recommended.id)}
      className="h-12 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-500 px-8 text-sm font-bold text-white shadow-lg shadow-emerald-500/25 transition-all hover:shadow-xl hover:shadow-emerald-500/30 motion-safe:hover:-translate-y-0.5"
    >
      شروع ۷ روز رایگان با پلن {recommended.name}
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
    </Button>
  ) : recommended ? (
    <a
      href={`/?buy=${recommended.id}`}
      className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-500 px-8 text-sm font-bold text-white shadow-lg shadow-emerald-500/25 transition-all hover:shadow-xl hover:shadow-emerald-500/30 motion-safe:hover:-translate-y-0.5"
    >
      شروع ۷ روز رایگان با پلن {recommended.name}
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
    </a>
  ) : null;

  return (
    <section
      aria-label="کوییز انتخاب پلن"
      className="relative mb-12 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm"
    >
      {/* نوار لهجهٔ گرادیانی بالای بخش */}
      <div
        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-emerald-500 via-teal-400 to-amber-400"
        aria-hidden="true"
      />
      {/* بافت نقطه‌ای پس‌زمینه */}
      <div
        className="pointer-events-none absolute inset-0 opacity-25 dark:opacity-15"
        style={{
          backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "20px 20px",
          color: "rgb(16 185 129 / 0.07)",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 20%, black 20%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 50% 20%, black 20%, transparent 80%)",
        }}
        aria-hidden="true"
      />

      <div className="relative p-5 sm:p-8">
        {/* هدر */}
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Badge className="bg-primary/10 text-primary" variant="secondary">
            <HelpCircle className="ml-1 h-3 w-3" />
            مشاور هوشمند انتخاب پلن
          </Badge>
          <h2 className="text-xl font-bold text-foreground sm:text-2xl">
            کدام پلن برای من مناسب است؟
          </h2>
          <p className="max-w-xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
            ۵ سوال کوتاه پاسخ دهید — بر اساس نیاز واقعی شما، پلن مناسب را با دلیل
            پیشنهاد می‌دهیم؛ نه گران‌ترین را.
          </p>
        </div>

        {/* نوار پیشرفت */}
        {step < 5 && (
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
                style={{ width: `${Math.max(6, progressPct)}%` }}
              />
            </div>
          </div>
        )}

        {/* بدنهٔ سوال/نتیجه با ترنزیشن */}
        <div
          className={`transition-all duration-200 motion-reduce:transition-none ${
            visible
              ? "translate-y-0 opacity-100"
              : dir === "fwd"
                ? "-translate-y-2 opacity-0"
                : "translate-y-2 opacity-0"
          }`}
        >
          {step < 5 && q && (
            <div>
              <h3 className="mb-1 text-base font-bold text-foreground sm:text-lg">{q.title}</h3>
              <p className="mb-4 text-xs text-muted-foreground">{q.hint}</p>

              {q.key === "bizType" && (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {BIZ_TYPE_OPTIONS.map((o) => (
                    <OptionCard
                      key={o.value}
                      {...o}
                      selected={answers.bizType === o.value}
                      onSelect={() => {
                        setAnswers((a) => ({ ...a, bizType: o.value }));
                        window.setTimeout(goNext, 220);
                      }}
                    />
                  ))}
                </div>
              )}

              {q.key === "team" && (
                <div className="grid gap-2.5 sm:grid-cols-3">
                  {TEAM_OPTIONS.map((o) => (
                    <OptionCard
                      key={o.value}
                      {...o}
                      compact
                      selected={answers.team === o.value}
                      onSelect={() => {
                        setAnswers((a) => ({ ...a, team: o.value }));
                        window.setTimeout(goNext, 220);
                      }}
                    />
                  ))}
                </div>
              )}

              {q.key === "volume" && (
                <div className="grid gap-2.5 sm:grid-cols-3">
                  {VOLUME_OPTIONS.map((o) => (
                    <OptionCard
                      key={o.value}
                      {...o}
                      compact
                      selected={answers.volume === o.value}
                      onSelect={() => {
                        setAnswers((a) => ({ ...a, volume: o.value }));
                        window.setTimeout(goNext, 220);
                      }}
                    />
                  ))}
                </div>
              )}

              {q.key === "features" && (
                <>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {FEATURE_OPTIONS.map((o) => (
                      <OptionCard
                        key={o.value}
                        {...o}
                        selected={answers.features.includes(o.value)}
                        onSelect={() =>
                          setAnswers((a) => ({
                            ...a,
                            features: a.features.includes(o.value)
                              ? a.features.filter((f) => f !== o.value)
                              : [...a.features, o.value],
                          }))
                        }
                      />
                    ))}
                  </div>
                  <div className="mt-3 text-center" aria-live="polite">
                    <p className="text-[11px] text-muted-foreground">
                      {answers.features.length === 0
                        ? "هیچ‌کدام را انتخاب نکنید اگر فعلاً به این‌ها نیاز ندارید — پلن سبک‌تر پیشنهاد می‌شود"
                        : `${toPersianDigits(answers.features.length)} قابلیت انتخاب شد`}
                    </p>
                  </div>
                  <Button
                    onClick={goNext}
                    className="mt-3 h-11 w-full rounded-xl bg-gradient-to-l from-emerald-600 to-teal-500 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-all hover:shadow-lg hover:shadow-emerald-500/30 sm:w-auto sm:px-10"
                  >
                    ادامه
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </>
              )}

              {q.key === "growth" && (
                <div className="grid gap-2.5 sm:grid-cols-3">
                  {GROWTH_OPTIONS.map((o) => (
                    <OptionCard
                      key={o.value}
                      {...o}
                      compact
                      selected={answers.growth === o.value}
                      onSelect={() => {
                        setAnswers((a) => ({ ...a, growth: o.value }));
                        window.setTimeout(goNext, 260);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ---------- نتیجه ---------- */}
          {step === 5 && result && recommended && (
            <div className="text-center">
              {/* کارت پلن پیشنهادی */}
              <div className="relative mx-auto max-w-md overflow-hidden rounded-2xl border border-emerald-300/60 bg-gradient-to-b from-emerald-50/90 to-teal-50/60 p-6 shadow-md shadow-emerald-500/10 dark:border-emerald-800/60 dark:from-emerald-950/40 dark:to-teal-950/20 sm:p-8">
                <div
                  className="pointer-events-none absolute -left-10 -top-10 h-32 w-32 rounded-full bg-emerald-400/20 blur-2xl"
                  aria-hidden="true"
                />
                <div
                  className="pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-teal-400/20 blur-2xl"
                  aria-hidden="true"
                />
                <div className="relative">
                  <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-400 text-white shadow-lg shadow-emerald-500/30">
                    <PartyPopper className="h-7 w-7" aria-hidden="true" />
                  </span>
                  <p className="text-xs font-semibold text-muted-foreground">پلن پیشنهادی برای شما</p>
                  <h3 className="mt-1 text-2xl font-extrabold text-foreground">
                    {recommended.name}
                  </h3>
                  {recommended.priceToman > 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      <span className="text-lg font-bold tabular-nums text-foreground">
                        {formatNumber(recommended.priceToman)}
                      </span>{" "}
                      تومان در سال
                    </p>
                  ) : (
                    <p className="mt-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      رایگان
                    </p>
                  )}

                  {/* دلایل */}
                  {result.reasons.length > 0 && (
                    <ul className="mt-4 space-y-1.5 text-right">
                      {result.reasons.map((r) => (
                        <li
                          key={r}
                          className="flex items-center gap-2 text-xs leading-relaxed text-foreground/85"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* CTA */}
              <div className="mt-6 flex flex-col items-center gap-3">
                {resultCta}
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  ۷ روز رایگان با تمام امکانات — بدون نیاز به کارت بانکی
                </p>
                <button
                  type="button"
                  onClick={restart}
                  className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  تکرار آزمون با پاسخ‌های دیگر
                </button>
              </div>
            </div>
          )}
        </div>

        {/* دکمهٔ بازگشت */}
        {step > 0 && step < 5 && (
          <button
            type="button"
            onClick={goBack}
            className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            سوال قبلی
          </button>
        )}
      </div>
    </section>
  );
}
