"use client";

// ============ CostCalculator — «ماشین‌حساب هزینهٔ نرم‌افزار من» ============
// v35.5 (نقشهٔ راه بخش ۲-۲ سند پیشنهادهای ارتقا + قاب‌بندی پیشنهاد ۶):
// بازدیدکننده نیاز خود را وارد می‌کند → پلن پیشنهادی + هزینهٔ سالانه +
// مقایسهٔ بصری هزینهٔ ۳ساله در برابر معادل نصبی هلو/سپیدار + صرفه‌جویی.
//
// طراحی:
// - منطق پیشنهاد پلن از قواعد واقعی پلن‌ها (کاربر/انبار/فاکتور/ماژول)
// - TCO رقبا از lib/competitor-deep-analysis (tco3y) — تخمینی و شفاف
// - بدون آبی/ایندیگو؛ پالت emerald/teal/amber؛ اعداد فارسی
// - دسترس‌پذیری: label برای هر ورودی + aria-pressed برای کلیدها
// - دو حالت CTA: onSelectPlan (داخل اپ) یا لینک /?buy=<plan> (صفحهٔ عمومی)

import * as React from "react";
import {
  Users,
  Warehouse,
  FileText,
  Minus,
  Plus,
  Check,
  Calculator,
  Sparkles,
  PiggyBank,
  ArrowLeft,
  Info,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber, toPersianDigits } from "@/lib/persian";
import { competitorAnalysis } from "@/lib/competitor-deep-analysis";

export interface CalculatorPlan {
  id: string;
  name: string;
  priceToman: number;
  maxUsers: number; // -1 = نامحدود
  maxWarehouses: number; // -1 = نامحدود
  maxInvoices: number; // سالانه؛ -1 = نامحدود
  popular?: boolean;
}

interface CostCalculatorProps {
  plans: CalculatorPlan[];
  /** داخل اپ: مستقیم چک‌اوت باز می‌شود؛ در صفحهٔ عمومی: لینک /?buy= */
  onSelectPlan?: (planId: string) => void;
}

// ---------- ورودی‌های تعاملی ----------

function Stepper({
  label,
  icon: Icon,
  value,
  min,
  max,
  unlimitedLabel,
  onChange,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  min: number;
  max: number;
  unlimitedLabel?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <span className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        {label}
        <span className="ms-auto rounded-md bg-muted px-2 py-0.5 text-[11px] font-bold tabular-nums text-primary">
          {value >= max && unlimitedLabel
            ? unlimitedLabel
            : toPersianDigits(value)}
        </span>
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`کاهش ${label}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Minus className="h-4 w-4" />
        </button>
        <div className="relative h-9 flex-1 overflow-hidden rounded-lg border border-border bg-muted/30">
          <div
            className="absolute inset-y-0 right-0 bg-primary/15 transition-all duration-300"
            style={{
              width: `${((value - min) / (max - min)) * 100}%`,
            }}
            aria-hidden="true"
          />
        </div>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={`افزایش ${label}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function InvoiceSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const min = 50;
  const max = 2000;
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <span className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <FileText className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        فاکتور در ماه
        <span className="ms-auto rounded-md bg-muted px-2 py-0.5 text-[11px] font-bold tabular-nums text-primary">
          {value >= max ? `${toPersianDigits(max)}+` : formatNumber(value)}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={50}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="تعداد فاکتور در ماه"
        className="h-9 w-full cursor-pointer accent-primary"
        style={{
          background: `linear-gradient(to left, hsl(var(--primary)) ${pct}%, hsl(var(--muted)) ${pct}%)`,
          borderRadius: "0.5rem",
          appearance: "none",
        }}
      />
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{formatNumber(min)}</span>
        <span>{formatNumber(max)}+</span>
      </div>
    </div>
  );
}

function NeedToggle({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-all duration-200 ${
        active
          ? "border-primary/50 bg-primary/10 text-primary shadow-sm"
          : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
      }`}
    >
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-full transition-colors ${
          active ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
        aria-hidden="true"
      >
        {active && <Check className="h-2.5 w-2.5" />}
      </span>
      {label}
    </button>
  );
}

// ---------- منطق پیشنهاد پلن ----------

interface Needs {
  users: number;
  invoicesPerMonth: number;
  warehouses: number;
  payroll: boolean;
  ai: boolean;
  ecommerce: boolean;
  api: boolean;
}

function recommendPlan(needs: Needs, plans: CalculatorPlan[]): {
  plan: CalculatorPlan;
  reasons: string[];
} {
  const reasons: string[] = [];
  const yearlyInvoices = needs.invoicesPerMonth * 12;
  let recommended = "basic";

  if (
    needs.users > 4 ||
    needs.warehouses > 6 ||
    yearlyInvoices > 15000 ||
    needs.users >= 10
  ) {
    recommended = "enterprise";
    if (needs.users > 4) reasons.push("بیش از ۴ کاربر");
    if (needs.warehouses > 6) reasons.push("بیش از ۶ انبار");
    if (yearlyInvoices > 15000)
      reasons.push(`بیش از ${formatNumber(15000)} فاکتور در سال`);
  } else if (
    needs.users > 2 ||
    needs.warehouses > 4 ||
    needs.payroll ||
    needs.ai ||
    needs.ecommerce ||
    needs.api
  ) {
    recommended = "pro";
    if (needs.users > 2) reasons.push("بیش از ۲ کاربر");
    if (needs.warehouses > 4) reasons.push("بیش از ۴ انبار");
    if (needs.payroll) reasons.push("حقوق و دستمزد");
    if (needs.ai) reasons.push("هوش مصنوعی");
    if (needs.ecommerce) reasons.push("اتصال فروشگاه آنلاین");
    if (needs.api) reasons.push("API");
  } else {
    recommended = "basic";
    if (needs.users > 1) reasons.push("۲ کاربر");
    if (needs.warehouses > 2) reasons.push("انبار متعدد");
  }

  const plan =
    plans.find((p) => p.id === recommended) || plans[plans.length - 1];
  return { plan, reasons: reasons.slice(0, 4) };
}

// ---------- TCO رقبا ----------

function competitor3y(id: string): { name: string; total: number } | null {
  const c = competitorAnalysis.find((x) => x.id === id);
  if (!c?.tco3y) return null;
  const t = c.tco3y;
  return {
    name: c.name,
    total:
      t.licenseToman +
      t.yearlyUpgradeToman * 3 +
      t.serverToman +
      t.serverFailureRiskToman +
      t.trainingToman +
      t.support3yToman,
  };
}

function TcoBar({
  name,
  total,
  max,
  highlight,
  caption,
}: {
  name: string;
  total: number;
  max: number;
  highlight?: boolean;
  caption?: string;
}) {
  const pct = Math.max(8, Math.round((total / max) * 100));
  return (
    <div className="group">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span
          className={`text-xs font-semibold ${highlight ? "text-primary" : "text-foreground"}`}
        >
          {name}
        </span>
        <span
          className={`text-xs font-bold tabular-nums ${highlight ? "text-primary" : "text-muted-foreground"}`}
        >
          {formatNumber(total)} تومان
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/60">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            highlight
              ? "bg-gradient-to-l from-emerald-500 to-teal-400"
              : "bg-gradient-to-l from-rose-400/70 to-amber-400/70"
          }`}
          style={{ width: `${pct}%` }}
          role="img"
          aria-label={`${name}: ${formatNumber(total)} تومان در ۳ سال`}
        />
      </div>
      {caption && (
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          {caption}
        </p>
      )}
    </div>
  );
}

// ---------- کامپوننت اصلی ----------

export function CostCalculator({ plans, onSelectPlan }: CostCalculatorProps) {
  const [needs, setNeeds] = React.useState<Needs>({
    users: 2,
    invoicesPerMonth: 200,
    warehouses: 2,
    payroll: false,
    ai: true,
    ecommerce: false,
    api: false,
  });

  const { plan, reasons } = React.useMemo(
    () => recommendPlan(needs, plans),
    [needs, plans]
  );

  const hoosh3y = plan.priceToman * 3;
  const holoo3y = competitor3y("holoo");
  const sepidar3y = competitor3y("sepidar");
  const competitorTotal = Math.min(
    ...( [holoo3y?.total, sepidar3y?.total].filter(
      (x): x is number => typeof x === "number"
    ) as number[] )
  );
  const savings = competitorTotal > 0 ? competitorTotal - hoosh3y : 0;
  const maxTco = Math.max(hoosh3y, competitorTotal || 0);

  const planCta = onSelectPlan ? (
    <Button
      className="w-full gap-1.5"
      size="lg"
      onClick={() => onSelectPlan(plan.id)}
    >
      <Sparkles className="h-4 w-4" />
      شروع ۷ روز رایگان با پلن {plan.name}
    </Button>
  ) : (
    <Button className="w-full gap-1.5" size="lg" asChild>
      <a href={`/?buy=${plan.id}`}>
        <Sparkles className="h-4 w-4" />
        شروع ۷ روز رایگان با پلن {plan.name}
      </a>
    </Button>
  );

  return (
    <section aria-label="ماشین‌حساب هزینهٔ نرم‌افزار" className="mt-20">
      <div className="mb-8 text-center">
        <Badge variant="secondary" className="mb-3 bg-primary/10 text-primary">
          <Calculator className="ml-1 h-3 w-3" />
          ماشین‌حساب هوشمند
        </Badge>
        <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
          هزینهٔ نرم‌افزار شما چقدر می‌شود؟
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          در ۳۰ ثانیه نیاز خود را انتخاب کنید — پلن مناسب، هزینهٔ سالانه و
          مقایسهٔ واقعی با معادلِ نصبیِ رقبا را می‌بینید.
        </p>
      </div>

      <Card className="overflow-visible border-border/60 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-5">
          {/* ورودی‌ها */}
          <div className="space-y-6 border-b border-border/60 p-6 sm:p-8 lg:col-span-3 lg:border-b-0 lg:border-l">
            <Stepper
              label="تعداد کاربر (حسابدار، مدیر، انباردار…)"
              icon={Users}
              value={needs.users}
              min={1}
              max={10}
              unlimitedLabel="۱۰+ (نامحدود)"
              onChange={(v) => setNeeds((n) => ({ ...n, users: v }))}
            />
            <InvoiceSlider
              value={needs.invoicesPerMonth}
              onChange={(v) => setNeeds((n) => ({ ...n, invoicesPerMonth: v }))}
            />
            <Stepper
              label="تعداد انبار / فروشگاه"
              icon={Warehouse}
              value={needs.warehouses}
              min={1}
              max={8}
              unlimitedLabel="۸+ (نامحدود)"
              onChange={(v) => setNeeds((n) => ({ ...n, warehouses: v }))}
            />
            <div>
              <p className="mb-2 text-xs font-semibold text-foreground">
                چه امکاناتی لازم دارید؟
              </p>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="انتخاب امکانات مورد نیاز"
              >
                <NeedToggle
                  label="حقوق و دستمزد"
                  active={needs.payroll}
                  onToggle={() => setNeeds((n) => ({ ...n, payroll: !n.payroll }))}
                />
                <NeedToggle
                  label="هوش مصنوعی (OCR و پیش‌بینی)"
                  active={needs.ai}
                  onToggle={() => setNeeds((n) => ({ ...n, ai: !n.ai }))}
                />
                <NeedToggle
                  label="اتصال فروشگاه آنلاین"
                  active={needs.ecommerce}
                  onToggle={() =>
                    setNeeds((n) => ({ ...n, ecommerce: !n.ecommerce }))
                  }
                />
                <NeedToggle
                  label="API و یکپارچه‌سازی"
                  active={needs.api}
                  onToggle={() => setNeeds((n) => ({ ...n, api: !n.api }))}
                />
              </div>
            </div>
          </div>

          {/* نتیجه */}
          <div className="relative overflow-hidden bg-gradient-to-b from-emerald-50/70 to-teal-50/40 p-6 sm:p-8 dark:from-emerald-950/20 dark:to-teal-950/10 lg:col-span-2">
            <div
              className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-emerald-400/15 blur-3xl"
              aria-hidden="true"
            />
            <div className="relative">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                پلن پیشنهادی شما
              </p>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-2xl font-bold text-foreground">
                  پلن {plan.name}
                </p>
                {plan.popular && (
                  <Badge className="bg-primary text-primary-foreground text-[10px]">
                    محبوب‌ترین
                  </Badge>
                )}
              </div>
              {reasons.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {reasons.map((r) => (
                    <span
                      key={r}
                      className="rounded-full bg-card/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-5 rounded-xl border border-emerald-200/60 bg-card/80 p-4 dark:border-emerald-900/50">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">
                    هزینهٔ سالانه
                  </span>
                  <span className="text-lg font-bold tabular-nums text-foreground">
                    {formatNumber(plan.priceToman)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      تومان
                    </span>
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">
                    مجموع ۳ سال
                  </span>
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {formatNumber(hoosh3y)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      تومان
                    </span>
                  </span>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                  شامل به‌روزرسانی، پشتیبانی، بکاپ ابری و مهاجرت رایگان — بدون
                  هزینهٔ سرور و نصب
                </p>
              </div>

              {/* مقایسهٔ ۳ساله */}
              <div className="mt-5 space-y-3">
                <p className="text-xs font-semibold text-foreground">
                  هزینهٔ ۳سالهٔ مالکیت (تخمینی)
                </p>
                <TcoBar
                  name="هوش (ابری)"
                  total={hoosh3y}
                  max={maxTco}
                  highlight
                  caption="همه‌چیز داخل پلن — بدون هزینهٔ پنهان"
                />
                {holoo3y && (
                  <TcoBar
                    name={`معادل نصبی ${holoo3y.name}`}
                    total={holoo3y.total}
                    max={maxTco}
                    caption="لایسنس + ارتقای سالانه + سرور + پشتیبانی + آموزش"
                  />
                )}
                {sepidar3y && (
                  <TcoBar
                    name={`معادل ${sepidar3y.name}`}
                    total={sepidar3y.total}
                    max={maxTco}
                    caption="لایسنس ماژولار + پشتیبانی سالانه + سرور"
                  />
                )}
                {savings > 0 && (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200/70 bg-emerald-50/80 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                    <PiggyBank
                      className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                    <p className="text-[11px] font-semibold leading-relaxed text-emerald-800 dark:text-emerald-300">
                      تا {formatNumber(savings)} تومان صرفه‌جویی در ۳ سال —
                      بدون ریسک خرابی سرور و هزینهٔ پنهان
                    </p>
                  </div>
                )}
                <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground/80">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  اعداد رقبا بر اساس قیمت‌های اعلامی عمومی و هزینه‌های مستند
                  (سرور، ارتقا، آموزش) — تخمینی و شفاف؛ برای مقایسهٔ تصمیم‌گیری.
                </p>
              </div>

              <div className="mt-5">{planCta}</div>
              <p className="mt-2 flex items-center justify-center gap-1 text-center text-[10px] text-muted-foreground">
                <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                ۷ روز رایگان با تمام امکانات — بدون کارت بانکی
              </p>
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}
