// ============================================================
// lib/installments.ts — سیستم پرداخت اقساطی لایسنس (v36 / Task 4)
// ============================================================
// مالک: «لایسنس سالانه بخرند و در ۳ قسط پرداخت کنن» — چک‌اوت دو مرحله‌ای،
// جدول اقساط با سررسید شمسی، تسویه زودهنگام با ۲٪ تخفیف، پرداخت یکجا
// با ۳٪ تخفیف، یادآوری‌های D-7/D-1/D0/OVD+3 و تعلیق لایسنس در OVD+7.
//
// اصول امنیتی (همان الگوی integrations/payment):
//  - رکورد ذخیره‌شده (Integration + LicenseInstallment) = حقیقت واحد
//  - مبلغ فقط از DB خوانده می‌شود — هرگز از body
//  - تسویه idempotent با گارد اتمیک updateMany(status: not PAID)
// ============================================================
import { db } from "@/lib/db";
import {
  getEffectivePlan,
  monthlyPriceOfYearly,
  getEffectiveLicenseDefaults,
  type Plan,
} from "@/lib/plans";
import { evaluateDiscountRules } from "@/lib/discount-rules";
import { evaluateCoupon, CouponError, recordCouponRedemption } from "@/lib/coupons";
import { toJalali, toPersianDigits } from "@/lib/persian";

// ============ ثابت‌های سیستم اقساط ============

/** گزینه‌های تعداد اقساط — پیش‌فرض همه پلن‌ها (قابل تنظیم از SystemSettings) */
export const INSTALLMENT_OPTIONS_DEFAULT: number[] = [1, 2, 3, 6];

/** حداکثر تعداد اقساط مجاز */
export const MAX_INSTALLMENTS = 6;

/** فاصلهٔ سررسید اقساط (روز) */
export const INSTALLMENT_INTERVAL_DAYS = 30;

/** تخفیف پرداخت یکجا (count=1) — انگیزهٔ خرید نقدی (درخواست مالک) */
export const FULL_PAY_DISCOUNT_PERCENT = 3;

/** تخفیف تسویهٔ زودهنگام باقیماندهٔ اقساط */
export const EARLY_PAYOFF_DISCOUNT_PERCENT = 2;

/** روز تعلیق لایسنس پس از سررسید قسط معوق */
export const SUSPEND_AFTER_DAYS = 7;

/** کلید SystemSettings برای گزینه‌های اقساط per-plan */
export const INSTALLMENT_OPTIONS_KEY = "installment_options";

// ============ انواع داده ============

export interface InstallmentQuoteInput {
  planId: string;
  period: "yearly" | "monthly";
  count: number;
  couponCode?: string | null;
  /** کاربر واردشده — برای تخفیف‌های خودکار (قدمت حساب) و کوپن per-user */
  userId?: string | null;
  userEmail?: string | null;
  tenantId?: string | null;
  userCreatedAt?: Date | null;
  userLastActiveAt?: Date | null;
  /** تاریخ مرجع سررسیدها — پیش‌فرض الان (فقط برای تست) */
  startsAt?: Date;
}

export interface InstallmentRow {
  seq: number;
  amountToman: number;
  dueDate: string; // ISO
  dueDateJalali: string; // ۱۴۰۴/۰۸/۱۲
  status?: string;
}

export interface InstallmentQuote {
  ok: true;
  planId: string;
  planName: string;
  period: "yearly" | "monthly";
  count: number;
  /** قیمت رسمی دوره (مؤثر) قبل از هر تخفیفی */
  baseAmountToman: number;
  /** جمع تخفیف‌های خودکار + کد تخفیف (بدون تخفیف پرداخت یکجا) */
  autoDiscountToman: number;
  couponCode: string | null;
  couponDiscountToman: number;
  couponLabelFa: string | null;
  /** تخفیف پرداخت یکجا — فقط وقتی count=1 */
  fullPayDiscountToman: number;
  /** مبلغ نهایی قابل‌تقسیط (پس از همهٔ تخفیف‌ها) */
  totalAmountToman: number;
  /** مبلغ هر قسط (قسط اول باقیمانده را هم می‌گیرد) */
  perInstallmentToman: number;
  installments: InstallmentRow[];
  /** گزینه‌های معتبر تعداد اقساط برای این پلن */
  availableCounts: number[];
  /** نرخ بهره یا کارمزد — صریح و صادقانه: صفر */
  feeToman: 0;
}

// ============ گزینه‌های اقساط per-plan (SystemSettings) ============

/**
 * گزینه‌های تعداد اقساط برای یک پلن — از SystemSettings کلید
 * `installment_options` خوانده می‌شود. فرمت‌های پشتیبانی‌شده:
 *   [1,2,3,6]                       — برای همهٔ پلن‌ها
 *   { "default": [1,2,3,6], "pro": [1,2,3] }  — per-plan (default = بقیه)
 * مقادیر نامعتبر بی‌صدا حذف می‌شوند؛ خروجی همیشه مرتب و یکتاست.
 */
export async function getInstallmentOptions(planId: string): Promise<number[]> {
  try {
    const row = await db.systemSettings.findUnique({
      where: { key: INSTALLMENT_OPTIONS_KEY },
      select: { value: true },
    });
    if (!row?.value) return [...INSTALLMENT_OPTIONS_DEFAULT];
    const parsed = JSON.parse(row.value) as unknown;
    let raw: unknown[] | undefined;
    if (Array.isArray(parsed)) {
      raw = parsed;
    } else if (parsed && typeof parsed === "object") {
      const map = parsed as Record<string, unknown>;
      if (Array.isArray(map[planId])) {
        raw = map[planId];
      } else if (Array.isArray(map.default)) {
        raw = map.default;
      }
    }
    if (!raw) return [...INSTALLMENT_OPTIONS_DEFAULT];
    const counts = raw
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= MAX_INSTALLMENTS);
    const unique = Array.from(new Set(counts)).sort((a, b) => a - b);
    return unique.length > 0 ? unique : [...INSTALLMENT_OPTIONS_DEFAULT];
  } catch {
    return [...INSTALLMENT_OPTIONS_DEFAULT];
  }
}

/** آیا تعداد قسط برای این پلن مجاز است؟ */
export async function isCountAllowed(planId: string, count: number): Promise<boolean> {
  const options = await getInstallmentOptions(planId);
  return options.includes(count);
}

// ============ جدول اقساط ============

/**
 * تقسیم مبلغ به N قسط: مبلغ هر قسط = floor(total/N)؛ باقیماندهٔ floor
 * روی قسط اول می‌نشیند (قسط اول ≥ بقیه). سررسید = start + (i-1)×۳۰ روز.
 */
export function buildInstallmentRows(
  totalToman: number,
  count: number,
  startsAt: Date = new Date()
): InstallmentRow[] {
  const n = Math.max(1, Math.min(MAX_INSTALLMENTS, Math.floor(count)));
  const total = Math.max(0, Math.round(totalToman));
  const base = Math.floor(total / n);
  const first = base + (total - base * n); // باقیمانده روی قسط اول
  const rows: InstallmentRow[] = [];
  for (let i = 1; i <= n; i++) {
    const due = new Date(startsAt.getTime());
    due.setDate(due.getDate() + (i - 1) * INSTALLMENT_INTERVAL_DAYS);
    rows.push({
      seq: i,
      amountToman: i === 1 ? first : base,
      dueDate: due.toISOString(),
      dueDateJalali: toJalali(due),
    });
  }
  return rows;
}

/** محاسبهٔ تسویهٔ زودهنگام: جمع اقساط باقیمانده − ۲٪ تخفیف */
export function earlyPayoffAmount(remainingToman: number): { amountToman: number; discountToman: number } {
  const remaining = Math.max(0, Math.round(remainingToman));
  const discount = Math.round((remaining * EARLY_PAYOFF_DISCOUNT_PERCENT) / 100);
  const amount = Math.max(0, remaining - discount);
  // کف درگاه زرین‌پال ۱٬۰۰۰ تومان
  const floorAmount = amount > 0 && amount < 1000 ? Math.min(remaining, 1000) : amount;
  return { amountToman: floorAmount, discountToman: remaining - floorAmount };
}

// ============ استعلام (quote) ============

/**
 * استعلام جدول اقساط — بدون هیچ side-effect (نه DB-write، نه درگاه).
 * زنجیرهٔ قیمت: قیمت مؤثر دوره → تخفیف اولین ۳ روز (اگر کاربر واردشده)
 * → قوانین تخفیف خودکار DB → کد تخفیف → تخفیف پرداخت یکجا (فقط count=1).
 */
export async function quoteInstallments(
  input: InstallmentQuoteInput
): Promise<InstallmentQuote | { ok: false; error: string; errorCode?: string }> {
  const plan: Plan | undefined = await getEffectivePlan(input.planId);
  if (!plan || plan.priceToman <= 0) {
    return { ok: false, error: "پلن انتخابی معتبر نیست یا رایگان است", errorCode: "PLAN_INVALID" };
  }
  const period: "yearly" | "monthly" = input.period === "monthly" ? "monthly" : "yearly";
  const count = Math.round(input.count);
  if (!Number.isInteger(count) || count < 1 || count > MAX_INSTALLMENTS) {
    return {
      ok: false,
      error: `تعداد اقساط باید بین ۱ تا ${toPersianDigits(MAX_INSTALLMENTS)} باشد`,
      errorCode: "COUNT_INVALID",
    };
  }
  if (!(await isCountAllowed(plan.id, count))) {
    return {
      ok: false,
      error: `پرداخت در ${toPersianDigits(count)} قسط برای این پلن فعال نیست`,
      errorCode: "COUNT_NOT_ALLOWED",
    };
  }

  // ۱) قیمت پایهٔ دوره از منبع واحد
  let amountToman =
    period === "monthly" ? monthlyPriceOfYearly(plan.priceToman) : plan.priceToman;
  // v35.3 (پیشنهاد ۲ — Anchoring): «قیمت قفل‌شدهٔ مالک» — تمدید همان پلن با
  // قیمت همیشگی خرید قبلی (فقط اگر ارزان‌تر/مساوی قیمت روز باشد)؛ خرید اقساطی
  // هم مثل subscribe و payment/create به قفل احترام می‌گذارد.
  try {
    if (input.tenantId) {
      const lockedLicense = await db.license.findFirst({
        where: {
          tenantId: input.tenantId,
          plan: plan.id,
          source: "purchase",
          priceLockedToman: { not: null },
        },
        orderBy: { priceLockedAt: "desc" },
        select: { priceLockedToman: true },
      });
      const lockedYearly = lockedLicense?.priceLockedToman ?? 0;
      if (lockedYearly > 0) {
        const lockedBase =
          period === "yearly" ? lockedYearly : monthlyPriceOfYearly(lockedYearly);
        if (lockedBase > 0 && lockedBase <= amountToman) {
          amountToman = lockedBase;
        }
      }
    }
  } catch {
    /* خطای جستجو هرگز جریان را متوقف نمی‌کند — قیمت روز ملاک می‌ماند */
  }
  const baseAmountToman = amountToman;

  // ۲) تخفیف‌های خودکار (کاربر واردشده) — موتور تخفیف خودش قانون مجازی
  // «۵٪ سه روز اول» را هم ارزیابی می‌کند (FIX(v19-flash) در evaluateDiscountRules)
  // پس اینجا فقط یک‌بار صدا زده می‌شود — هیچ تخفیف فلش جداگانه‌ای اعمال نمی‌کنیم
  // تا دوبار کسر نشود. خطای موتور = بدون تخفیف خودکار.
  let autoDiscountToman = 0;
  try {
    if (input.userId) {
      const evaluation = await evaluateDiscountRules({
        userId: input.userId,
        planId: plan.id,
        billingCycle: period === "monthly" ? "monthly" : "annual",
        basePriceToman: amountToman,
        userCreatedAt: input.userCreatedAt ?? new Date(),
        lastActiveAt: input.userLastActiveAt ?? undefined,
      });
      const best = evaluation.bestRule;
      if (evaluation.applied && best && best.discountToman > 0) {
        // کف ۱٬۰۰۰ تومان (درگاه)
        let eff = best.discountToman;
        if (amountToman >= 1000 && amountToman - eff < 1000) {
          eff = amountToman - 1000;
        }
        if (eff > 0) {
          autoDiscountToman += eff;
          amountToman = Math.max(0, amountToman - eff);
        }
      }
    }
  } catch {
    /* خطای موتور تخفیف = بدون تخفیف خودکار */
  }

  // ۳) کد تخفیف — روی مبلغ پس از تخفیف‌های خودکار
  let couponCode: string | null = null;
  let couponDiscountToman = 0;
  let couponLabelFa: string | null = null;
  if (typeof input.couponCode === "string" && input.couponCode.trim()) {
    try {
      const couponEval = await evaluateCoupon(db, input.couponCode, {
        planId: plan.id,
        amountToman,
        userEmail: input.userEmail ?? null,
        tenantId: input.tenantId ?? null,
      });
      couponCode = couponEval.code;
      couponLabelFa = couponEval.labelFa;
      couponDiscountToman = couponEval.discountToman;
      amountToman = couponEval.finalToman;
    } catch (couponErr) {
      const reason =
        couponErr instanceof CouponError ? couponErr.message : "کد تخفیف معتبر نیست";
      return { ok: false, error: reason, errorCode: "COUPON_INVALID" };
    }
  }

  // ۴) تخفیف پرداخت یکجا — فقط count=1 (۳٪)
  let fullPayDiscountToman = 0;
  if (count === 1 && FULL_PAY_DISCOUNT_PERCENT > 0) {
    const raw = Math.round((amountToman * FULL_PAY_DISCOUNT_PERCENT) / 100);
    // کف درگاه ۱٬۰۰۰ تومان — تخفیف نباید مبلغ را زیر کف ببرد
    fullPayDiscountToman =
      amountToman - raw >= 1000 ? raw : Math.max(0, amountToman - 1000);
    amountToman -= fullPayDiscountToman;
  }

  const totalAmountToman = Math.max(0, Math.round(amountToman));
  const startsAt = input.startsAt ?? new Date();
  const rows = buildInstallmentRows(totalAmountToman, count, startsAt);
  const availableCounts = await getInstallmentOptions(plan.id);

  return {
    ok: true,
    planId: plan.id,
    planName: plan.name,
    period,
    count,
    baseAmountToman,
    autoDiscountToman,
    couponCode,
    couponDiscountToman,
    couponLabelFa,
    fullPayDiscountToman,
    totalAmountToman,
    perInstallmentToman: rows[0]?.amountToman ?? totalAmountToman,
    installments: rows,
    availableCounts,
    feeToman: 0,
  };
}

// ============ ساخت پلن اقساطی در DB ============

/** خروجی ساخت پلن — برای endpoint POST /api/payment/installment-plans */
export interface CreatePlanResult {
  ok: boolean;
  error?: string;
  errorCode?: string;
  quote?: InstallmentQuote;
  plan?: { id: string; installmentCount: number; totalAmountToman: number };
  firstInstallment?: { id: string; seq: number; amountToman: number; dueDate: string };
}

/** ساخت LicensePaymentPlan + اقساطش در یک تراکنش اتمیک */
export async function createPaymentPlanInDb(
  tenantId: string,
  quote: InstallmentQuote
): Promise<{ id: string; firstInstallmentId: string } | { error: string }> {
  const lockBase =
    quote.period === "monthly" ? Math.round(quote.totalAmountToman * 12) : quote.totalAmountToman;
  const rows = quote.installments;
  const first = rows[0];
  if (!first) return { error: "جدول اقساط خالی است" };

  try {
    const planId = await db.$transaction(async (tx) => {
      const plan = await tx.licensePaymentPlan.create({
        data: {
          tenantId,
          planId: quote.planId,
          period: quote.period,
          status: "ACTIVE",
          totalAmountToman: quote.totalAmountToman,
          installmentCount: quote.count,
          paidCount: 0,
          couponCode: quote.couponCode,
          priceLockedToman: lockBase > 0 ? lockBase : null,
          startsAt: new Date(),
        },
      });
      await tx.licenseInstallment.createMany({
        data: rows.map((r) => ({
          paymentPlanId: plan.id,
          seq: r.seq,
          amountToman: r.amountToman,
          dueDate: new Date(r.dueDate),
          status: "PENDING",
        })),
      });
      return plan.id;
    });
    const firstRow = await db.licenseInstallment.findFirst({
      where: { paymentPlanId: planId, seq: 1 },
      select: { id: true },
    });
    if (!firstRow) return { error: "قسط اول ساخته نشد" };
    return { id: planId, firstInstallmentId: firstRow.id };
  } catch (e) {
    console.error("[installments] createPaymentPlanInDb failed:", e);
    return { error: "خطا در ثبت پلن اقساطی در دیتابیس" };
  }
}

// ============ تسویهٔ اقساط در verify (اتمیک + idempotent) ============

export interface SettleInstallmentResult {
  settled: boolean;
  alreadyPaid: boolean;
  licenseKey: string | null;
  planCompleted: boolean;
  licenseReactivated: boolean;
  message: string;
}

/** ریست isTrial کاربران تریال سازمان (فیکس B11 — مشترک هر دو مسیر تسویه) */
async function resetTrialUsers(tenantId: string): Promise<void> {
  try {
    await db.user.updateMany({
      where: { tenantId, isTrial: true },
      data: { isTrial: false, trialEndsAt: null },
    });
  } catch {
    /* non-blocking */
  }
}

/**
 * تسویهٔ یک قسط پس از verify موفق زرین‌پال.
 *  - گارد اتمیک: updateMany(status: not PAID) → callback تکراری هیچ‌وقت
 *    دوبار اعمال نمی‌شود (همان الگوی Integration CONNECTED).
 *  - قسط اول → صدور لایسنس کامل دوره (source:"purchase") + پلن tenant +
 *    ثبت کوپن + رفرال (بازدهی خرید) + ریست isTrial (فیکس B11).
 *  - قسط آخر → پلن COMPLETED.
 *  - قسط معوق (OVERDUE) → لایسنس SUSPENDED → ACTIVE برمی‌گردد.
 */
export async function settleInstallmentOnVerify(params: {
  installmentId: string;
  tenantId: string;
  refId: string | null;
  amountToman: number;
}): Promise<SettleInstallmentResult> {
  const { installmentId, tenantId, refId, amountToman } = params;
  const base: SettleInstallmentResult = {
    settled: false,
    alreadyPaid: false,
    licenseKey: null,
    planCompleted: false,
    licenseReactivated: false,
    message: "",
  };

  const inst = await db.licenseInstallment.findUnique({
    where: { id: installmentId },
    include: { paymentPlan: true },
  });
  if (!inst || !inst.paymentPlan) {
    return { ...base, message: "قسط یافت نشد" };
  }
  if (inst.paymentPlan.tenantId !== tenantId) {
    return { ...base, message: "این قسط به این سازمان تعلق ندارد" };
  }
  // مبلغ رکورد = حقیقت واحد (نه مبلغ بازگشتی از درگاه/بدی)
  if (inst.amountToman !== amountToman) {
    return {
      ...base,
      message: "مبلغ پرداختی با مبلغ قسط ثبت‌شده مطابقت ندارد — قسط تسویه نشد",
    };
  }

  // ── گارد اتمیک idempotent: فقط بار اول ──
  const guard = await db.licenseInstallment.updateMany({
    where: { id: installmentId, status: { not: "PAID" } },
    data: {
      status: "PAID",
      paidAt: new Date(),
      refId: refId ?? inst.refId,
    },
  });
  if (guard.count === 0) {
    return { ...base, alreadyPaid: true, message: "این قسط قبلاً پرداخت و تسویه شده است" };
  }

  const plan = inst.paymentPlan;
  const isFirst = inst.seq === 1;
  const newPaidCount = plan.paidCount + 1;
  const isLast = newPaidCount >= plan.installmentCount;

  let licenseKey: string | null = null;
  let licenseReactivated = false;

  // ── قسط اول: صدور لایسنس کامل + فعال‌سازی tenant + کوپن + رفرال ──
  if (isFirst) {
    const { generateLicenseKey, hashLicenseKey } = await import("@/lib/license-security");
    licenseKey = generateLicenseKey();
    const defaults = await getEffectiveLicenseDefaults(plan.planId);
    const endDate = new Date();
    if (plan.period === "monthly") {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }
    const lockBase =
      plan.priceLockedToman ?? (plan.period === "monthly" ? plan.totalAmountToman * 12 : plan.totalAmountToman);

    const license = await db.license.create({
      data: {
        key: licenseKey,
        keyHash: hashLicenseKey(licenseKey),
        tenantId,
        plan: plan.planId,
        maxUsers: defaults.maxUsers,
        maxInvoices: defaults.maxInvoices,
        maxWarehouses: defaults.maxWarehouses,
        features: JSON.stringify(defaults.features),
        source: "purchase",
        status: "ACTIVE",
        startDate: new Date(),
        endDate,
        amountToman: inst.amountToman,
        priceLockedAt: lockBase > 0 ? new Date() : null,
        priceLockedToman: lockBase > 0 ? lockBase : null,
      },
    });

    await db.tenant.update({
      where: { id: tenantId },
      data: { plan: plan.planId, status: "active" },
    });

    // اتصال لایسنس به پلن اقساطی
    await db.licensePaymentPlan.update({
      where: { id: plan.id },
      data: { licenseId: license.id },
    });

    // فیکس B11: خرید موفق → ریست isTrial/trialEndsAt همهٔ کاربران تریال سازمان
    await resetTrialUsers(tenantId);

    // ثبت استفادهٔ کوپن (non-blocking)
    if (plan.couponCode) {
      try {
        const admin = await db.user.findFirst({
          where: { tenantId, role: "ADMIN" },
          select: { email: true },
        });
        await recordCouponRedemption(db, {
          couponCode: plan.couponCode,
          tenantId,
          userEmail: admin?.email ?? null,
          amountToman: 0,
          invoiceNumber: `INSTALLMENT-${plan.id.slice(-8).toUpperCase()}`,
        });
      } catch (e) {
        console.warn("[installments] coupon redemption failed (non-blocking):", e);
      }
    }

    // رفرال: خرید اقساطی هم «تبدیل پرداختی» است (non-blocking)
    try {
      const { rewardReferralsOnPaidConversion } = await import("@/lib/referral-engine");
      await rewardReferralsOnPaidConversion(db, { tenantId, planId: plan.planId });
    } catch (e) {
      console.warn("[installments] referral reward failed (non-blocking):", e);
    }

    // اعلان درون‌برنامه‌ای
    try {
      const { getPlanName } = await import("@/lib/plans");
      await db.notification.create({
        data: {
          tenantId,
          title: "لایسنس شما فعال شد",
          message: `پرداخت قسط ${toPersianDigits(1)} از ${toPersianDigits(plan.installmentCount)} با موفقیت ثبت شد و لایسنس پلن «${getPlanName(plan.planId)}» فعال گردید. کد پیگیری: ${refId ?? "—"}`,
          type: "SUCCESS",
          link: "/?module=license",
        },
      });
    } catch {
      /* اعلان اختیاری است */
    }
  } else {
    // ── اقساط بعدی: اگر لایسنس به‌خاطر معوقی SUSPENDED شده، فعال برگردد ──
    if (plan.licenseId) {
      const upd = await db.license.updateMany({
        where: { id: plan.licenseId, status: "SUSPENDED" },
        data: { status: "ACTIVE" },
      });
      licenseReactivated = upd.count > 0;
    }
    try {
      await db.notification.create({
        data: {
          tenantId,
          title: "قسط شما ثبت شد",
          message: `پرداخت قسط ${toPersianDigits(inst.seq)} از ${toPersianDigits(plan.installmentCount)} با موفقیت ثبت شد. کد پیگیری: ${refId ?? "—"}`,
          type: "SUCCESS",
          link: "/?module=account",
        },
      });
    } catch {
      /* ignore */
    }
  }

  // ── آپدیت شمارندهٔ پلن + تکمیل در قسط آخر ──
  await db.licensePaymentPlan.update({
    where: { id: plan.id },
    data: {
      paidCount: newPaidCount,
      status: isLast ? "COMPLETED" : plan.status,
    },
  });

  return {
    settled: true,
    alreadyPaid: false,
    licenseKey,
    planCompleted: isLast,
    licenseReactivated,
    message: isLast
      ? `پرداخت قسط ${toPersianDigits(inst.seq)} از ${toPersianDigits(plan.installmentCount)} ثبت شد — پلن اقساطی کامل تسویه شد.`
      : `پرداخت قسط ${toPersianDigits(inst.seq)} از ${toPersianDigits(plan.installmentCount)} با موفقیت ثبت شد.`,
  };
}

// ============ تسویهٔ زودهنگام (payoff) در verify ============

export interface SettlePayoffResult {
  settled: boolean;
  alreadyPaid: boolean;
  licenseKey: string | null;
  planCompleted: boolean;
  licenseReactivated: boolean;
  paidNow: number;
  discountToman: number;
  message: string;
}

/**
 * تسویهٔ زودهنگام همهٔ اقساط باقیماندهٔ یک پلن با یک پرداخت (−۲٪ تخفیف).
 *  - مبلغ ملاک: payoffAmountToman ذخیره‌شده در رکورد Integration (DB فقط).
 *  - گارد اتمیک: updateMany(id IN ids, status: not PAID) → idempotent.
 *  - اگر قسط اول هم در میان باشد و لایسنس هنوز صادر نشده → صادر می‌شود.
 *  - لایسنس SUSPENDED (معوقی قبلی) → ACTIVE برمی‌گردد.
 */
export async function settlePayoffOnVerify(params: {
  installmentIds: string[];
  tenantId: string;
  refId: string | null;
  expectedTotalToman: number;
}): Promise<SettlePayoffResult> {
  const { installmentIds, tenantId, refId, expectedTotalToman } = params;
  const base: SettlePayoffResult = {
    settled: false,
    alreadyPaid: false,
    licenseKey: null,
    planCompleted: false,
    licenseReactivated: false,
    paidNow: 0,
    discountToman: 0,
    message: "",
  };

  if (!Array.isArray(installmentIds) || installmentIds.length === 0) {
    return { ...base, message: "فهرست اقساط خالی است" };
  }

  const rows = await db.licenseInstallment.findMany({
    where: { id: { in: installmentIds } },
    include: { paymentPlan: true },
  });
  if (rows.length === 0 || rows.some((r) => !r.paymentPlan)) {
    return { ...base, message: "اقساط یافت نشد" };
  }
  const plan = rows[0].paymentPlan;
  if (plan.tenantId !== tenantId) {
    return { ...base, message: "این اقساط به این سازمان تعلق ندارد" };
  }
  // مجموع مبلغ اقساط باقیمانده (DB = حقیقت واحد) — برای گزارش تخفیف
  const remainingSum = rows.reduce((s, r) => s + r.amountToman, 0);

  // ── گارد اتمیک: فقط اقساط باز علامت می‌خورند (idempotent) ──
  const openIds = rows.filter((r) => r.status !== "PAID").map((r) => r.id);
  if (openIds.length === 0) {
    return {
      ...base,
      alreadyPaid: true,
      message: "همهٔ این اقساط قبلاً پرداخت و تسویه شده‌اند",
    };
  }
  const marked = await db.licenseInstallment.updateMany({
    where: { id: { in: openIds }, status: { not: "PAID" } },
    data: { status: "PAID", paidAt: new Date(), refId: refId ?? null },
  });
  if (marked.count === 0) {
    return { ...base, alreadyPaid: true, message: "این اقساط قبلاً تسویه شده‌اند" };
  }

  let licenseKey: string | null = null;
  let licenseReactivated = false;
  const firstIncluded = rows.some((r) => r.seq === 1 && openIds.includes(r.id));

  // ── اگر قسط اول هم تازه پرداخت شد و لایسنس هنوز صادر نشده ──
  if (firstIncluded && !plan.licenseId) {
    const { generateLicenseKey, hashLicenseKey } = await import("@/lib/license-security");
    licenseKey = generateLicenseKey();
    const defaults = await getEffectiveLicenseDefaults(plan.planId);
    const endDate = new Date();
    if (plan.period === "monthly") {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }
    const lockBase =
      plan.priceLockedToman ??
      (plan.period === "monthly" ? plan.totalAmountToman * 12 : plan.totalAmountToman);

    const license = await db.license.create({
      data: {
        key: licenseKey,
        keyHash: hashLicenseKey(licenseKey),
        tenantId,
        plan: plan.planId,
        maxUsers: defaults.maxUsers,
        maxInvoices: defaults.maxInvoices,
        maxWarehouses: defaults.maxWarehouses,
        features: JSON.stringify(defaults.features),
        source: "purchase",
        status: "ACTIVE",
        startDate: new Date(),
        endDate,
        amountToman: plan.totalAmountToman,
        priceLockedAt: lockBase > 0 ? new Date() : null,
        priceLockedToman: lockBase > 0 ? lockBase : null,
      },
    });
    await db.tenant.update({
      where: { id: tenantId },
      data: { plan: plan.planId, status: "active" },
    });
    await db.licensePaymentPlan.update({
      where: { id: plan.id },
      data: { licenseId: license.id },
    });
    await resetTrialUsers(tenantId);
  } else if (plan.licenseId) {
    // لایسنس معلق (معوقی قبلی) → فعال
    const upd = await db.license.updateMany({
      where: { id: plan.licenseId, status: "SUSPENDED" },
      data: { status: "ACTIVE" },
    });
    licenseReactivated = upd.count > 0;
    await resetTrialUsers(tenantId);
  }

  const newPaidCount = Math.min(plan.installmentCount, plan.paidCount + marked.count);
  const completed = newPaidCount >= plan.installmentCount;
  await db.licensePaymentPlan.update({
    where: { id: plan.id },
    data: { paidCount: newPaidCount, status: completed ? "COMPLETED" : plan.status },
  });

  try {
    await db.notification.create({
      data: {
        tenantId,
        title: "تسویهٔ زودهنگام اقساط انجام شد",
        message: `همهٔ ${toPersianDigits(marked.count)} قسط باقیمانده با ${toPersianDigits(EARLY_PAYOFF_DISCOUNT_PERCENT)}٪ تخفیف تسویه شد${completed ? " و پلن اقساطی کامل شد" : ""}. کد پیگیری: ${refId ?? "—"}`,
        type: "SUCCESS",
        link: "/?module=account",
      },
    });
  } catch {
    /* ignore */
  }

  return {
    settled: true,
    alreadyPaid: false,
    licenseKey,
    planCompleted: completed,
    licenseReactivated,
    paidNow: marked.count,
    discountToman: Math.max(0, remainingSum - expectedTotalToman),
    message: completed
      ? `تسویهٔ زودهنگام ${toPersianDigits(marked.count)} قسط با موفقیت انجام شد — پلن اقساطی کامل شد.`
      : `تسویهٔ زودهنگام ${toPersianDigits(marked.count)} قسط با موفقیت ثبت شد.`,
  };
}

// ============ کرون: معوق‌سازی + یادآوری + تعلیق ============

export interface InstallmentCronResult {
  scannedPlans: number;
  markedOverdue: number;
  reminders: number;
  suspended: number;
  skipped: number;
  errors: number;
}

/** مراحل یادآوری — کلید یکتای AuditLog: installment:{id}:{stage} */
type ReminderStage =
  | "D-7"
  | "D-1"
  | "D0"
  | "OVERDUE_MARKED"
  | "OVD+3"
  | "OVD+7_SUSPEND";

interface ReminderDef {
  kind: ReminderStage;
  title: string;
  message: string;
  type: "INFO" | "WARNING" | "ERROR";
}

/** آیا این مرحله قبلاً برای این قسط فرستاده شده؟ (AuditLog marker یکتا) */
async function reminderAlreadySent(installmentId: string, stage: ReminderStage): Promise<boolean> {
  const key = `installment:${installmentId}:${stage}`;
  const found = await db.auditLog.findFirst({
    where: { entity: "installment-reminder", entityId: key },
    select: { id: true },
  });
  return !!found;
}

async function markReminderSent(
  tenantId: string,
  installmentId: string,
  stage: ReminderStage
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        tenantId,
        action: "INSTALLMENT_REMINDER_SENT",
        entity: "installment-reminder",
        entityId: `installment:${installmentId}:${stage}`,
        changes: JSON.stringify({ stage, installmentId }),
      },
    });
  } catch {
    /* نباید جریان را متوقف کند */
  }
}

/** روزهای سپری‌شده از سررسید (منفی = مانده تا سررسید) */
function daysFromDue(due: Date, now: Date): number {
  return Math.floor((now.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * اسکن پلن‌های اقساطی فعال:
 *  ۱) اقساط PENDING با سررسید گذشته → OVERDUE
 *  ۲) یادآوری D-7 / D-1 / D0 (قبل یا روز سررسید) و OVD+3 (هشدار تعلیق)
 *  ۳) OVD+7 → License.status=SUSPENDED → کاربر LicenseLockScreen می‌گیرد
 * فراخوانی مکرر بی‌خطر است (AuditLog marker یکتا + گارد lastReminderAt).
 */
export async function processInstallmentCron(): Promise<InstallmentCronResult> {
  const now = new Date();
  const result: InstallmentCronResult = {
    scannedPlans: 0,
    markedOverdue: 0,
    reminders: 0,
    suspended: 0,
    skipped: 0,
    errors: 0,
  };

  // همهٔ اقساط بازِ پلن‌های ACTIVE/DEFAULTED (PENDING یا OVERDUE)
  const openInstallments = await db.licenseInstallment.findMany({
    where: {
      status: { in: ["PENDING", "OVERDUE"] },
      paymentPlan: { status: { in: ["ACTIVE", "DEFAULTED"] } },
    },
    include: { paymentPlan: true },
    orderBy: [{ dueDate: "asc" }],
    take: 500,
  });
  result.scannedPlans = new Set(openInstallments.map((i) => i.paymentPlanId)).size;

  // ضد بمباران: هر قسط حداکثر یک یادآوری در ۲۰ ساعت از lastReminderAt
  const REMINDER_COOLDOWN_MS = 20 * 60 * 60 * 1000;

  for (const inst of openInstallments) {
    try {
      const plan = inst.paymentPlan;
      const d = daysFromDue(inst.dueDate, now);

      // ── ۱) معوق‌سازی ──
      if (inst.status === "PENDING" && d > 0) {
        const upd = await db.licenseInstallment.updateMany({
          where: { id: inst.id, status: "PENDING" },
          data: { status: "OVERDUE" },
        });
        if (upd.count > 0) {
          result.markedOverdue++;
          await db.licensePaymentPlan.updateMany({
            where: { id: plan.id, status: "ACTIVE" },
            data: { status: "DEFAULTED" },
          });
        }
      }

      // ── ۲) تعریف یادآورهای این لحظه ──
      const reminders: ReminderDef[] = [];
      if (inst.status === "PENDING" && d === -7) {
        reminders.push({
          kind: "D-7",
          title: "یک هفته تا سررسید قسط لایسنس",
          message: `قسط ${toPersianDigits(inst.seq)} از ${toPersianDigits(plan.installmentCount)} لایسنس شما تا ${toPersianDigits(7)} روز دیگر (${toJalali(inst.dueDate)}) سررسید می‌شود. از بخش «حساب کاربری ← اقساط من» می‌توانید آن را پرداخت کنید.`,
          type: "INFO",
        });
      }
      if (inst.status === "PENDING" && d === -1) {
        reminders.push({
          kind: "D-1",
          title: "فردا سررسید قسط لایسنس است",
          message: `قسط ${toPersianDigits(inst.seq)} از ${toPersianDigits(plan.installmentCount)} لایسنس شما فردا (${toJalali(inst.dueDate)}) سررسید می‌شود — با پرداخت به‌موقع، سرویس شما بدون وقفه فعال می‌ماند.`,
          type: "WARNING",
        });
      }
      if (inst.status === "PENDING" && d === 0) {
        reminders.push({
          kind: "D0",
          title: "امروز سررسید قسط لایسنس است",
          message: `امروز (${toJalali(inst.dueDate)}) روز پرداخت قسط ${toPersianDigits(inst.seq)} از ${toPersianDigits(plan.installmentCount)} است. لطفاً امروز پرداخت را انجام دهید تا لایسنس فعال بماند.`,
          type: "WARNING",
        });
      }
      if (inst.status === "OVERDUE" && d >= 3 && d < SUSPEND_AFTER_DAYS) {
        reminders.push({
          kind: "OVD+3",
          title: "قسط لایسنس معوق است — لایسنس در خطر تعلیق",
          message: `قسط ${toPersianDigits(inst.seq)} از ${toPersianDigits(plan.installmentCount)} (${toJalali(inst.dueDate)}) پرداخت نشده است. اگر تا ${toPersianDigits(SUSPEND_AFTER_DAYS)} روز پس از سررسید پرداخت نشود، لایسنس شما موقتاً تعلیق می‌شود.`,
          type: "ERROR",
        });
      }
      if (inst.status === "OVERDUE" && d >= SUSPEND_AFTER_DAYS) {
        // ── ۳) تعلیق لایسنس (یک‌بار) ──
        const sent = await reminderAlreadySent(inst.id, "OVD+7_SUSPEND");
        if (!sent && plan.licenseId) {
          const upd = await db.license.updateMany({
            where: { id: plan.licenseId, status: { not: "SUSPENDED" } },
            data: { status: "SUSPENDED" },
          });
          if (upd.count > 0) {
            result.suspended++;
            try {
              await db.notification.create({
                data: {
                  tenantId: plan.tenantId,
                  title: "لایسنس شما موقتاً تعلیق شد",
                  message: `قسط ${toPersianDigits(inst.seq)} بیش از ${toPersianDigits(SUSPEND_AFTER_DAYS)} روز معوق مانده است و لایسنس شما موقتاً تعلیق شد. با پرداخت همین یک قسط، لایسنس بلافاصله فعال می‌شود.`,
                  type: "ERROR",
                  link: "/?module=account",
                },
              });
            } catch {
              /* ignore */
            }
          }
          await markReminderSent(plan.tenantId, inst.id, "OVD+7_SUSPEND");
        }
      }

      // ── ارسال یادآورهای سررسیدشده (ضدتکرار + کول‌داون) ──
      for (const rem of reminders) {
        if (await reminderAlreadySent(inst.id, rem.kind)) {
          result.skipped++;
          continue;
        }
        const last = inst.lastReminderAt?.getTime() ?? 0;
        if (now.getTime() - last < REMINDER_COOLDOWN_MS) {
          result.skipped++;
          continue;
        }
        try {
          await db.notification.create({
            data: {
              tenantId: plan.tenantId,
              title: rem.title,
              message: rem.message,
              type: rem.type,
              link: "/?module=account",
            },
          });
        } catch {
          /* ignore */
        }
        await db.licenseInstallment.update({
          where: { id: inst.id },
          data: { lastReminderAt: now },
        });
        await markReminderSent(plan.tenantId, inst.id, rem.kind);
        result.reminders++;
      }
    } catch (e) {
      console.error("[installments] cron item failed:", e);
      result.errors++;
    }
  }

  return result;
}
