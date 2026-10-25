import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getZarinpalMerchant, getPaymentSettings } from "@/lib/system-settings";
import { zarinpalErrorFa, enforcePaymentCallbackOrigin, zarinpalUrls } from "@/lib/zarinpal";
// v36 (Task 4): سیستم اقساط — ساخت پلن اقساطی + پرداخت قسط اول از طریق زرین‌پال
import { quoteInstallments, createPaymentPlanInDb } from "@/lib/installments";
import {
  hashPassword,
  generatePassword,
  generateUsername,
} from "@/lib/platform-auth";
import { checkRegistrationGuard, recordRegistrationSuccess, extractIp } from "@/lib/anti-fraud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/payment/installment-plans
// --------------------------------------------------------------
// خرید لایسنس به‌صورت اقساطی — دو حالت:
//  ۱) کاربر واردشده: پلن اقساطی برای tenant فعلی ساخته می‌شود.
//  ۲) مهمان (الگوی register-and-pay): tenant+user موقت pending_payment
//     ساخته می‌شود؛ پس از پرداخت قسط اول در verify فعال می‌شود.
// body: { planId, period?, count, couponCode?, callbackUrl,
//         name?, email?, companyName?, phone?, referralCode?, deviceFingerprint? }
//
// جریان: استعلام قیمت (تخفیف‌های خودکار + کوپن + تخفیف پرداخت یکجا)
//        → ساخت LicensePaymentPlan + اقساط در DB (اتمیک)
//        → درخواست پرداخت قسط اول از زرین‌پال → authority + StartPay URL
//        → رکورد Integration(PAYMENT) با flow:"installments"
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      planId?: string;
      period?: string;
      count?: number;
      couponCode?: string;
      callbackUrl?: string;
      name?: string;
      email?: string;
      companyName?: string;
      phone?: string;
      referralCode?: string;
      deviceFingerprint?: string;
    };

    const planId = (body.planId || "").trim();
    const period: "yearly" | "monthly" = body.period === "monthly" ? "monthly" : "yearly";
    const count = Math.round(Number(body.count) || 0);
    const couponCode = body.couponCode;
    const callbackUrl = body.callbackUrl;

    if (!planId) {
      return NextResponse.json(
        { success: false, error: "انتخاب پلن الزامی است" },
        { status: 400 }
      );
    }
    if (!count || count < 1) {
      return NextResponse.json(
        { success: false, error: "تعداد اقساط را انتخاب کنید" },
        { status: 400 }
      );
    }
    if (!callbackUrl || !/^https?:\/\//.test(callbackUrl)) {
      return NextResponse.json(
        { success: false, error: "آدرس بازگشت (callback) معتبر الزامی است" },
        { status: 400 }
      );
    }

    // ============ تشخیص کاربر: واردشده یا مهمان ============
    const ctx = await getAuthContext(req).catch(() => null);
    const isLoggedIn = !!ctx?.tenantId && ctx.source !== "anonymous";
    let tenantId = ctx?.tenantId ?? null;
    let userId: string | null = ctx?.userId ?? null;

    // ── داده‌های مهمان ──
    const trimmedName = (body.name || "").trim();
    const trimmedEmail = (body.email || "").trim().toLowerCase();
    const trimmedCompany = (body.companyName || "").trim();
    const trimmedPhone = (body.phone || "").trim() || undefined;

    if (!isLoggedIn) {
      // ANTI-FRAUD (v19): همان سد ثبت‌نام خرید بدون ورود
      const antiFraudIp = extractIp(req.headers);
      const userAgent = req.headers.get("user-agent") || undefined;
      const guard = await checkRegistrationGuard({
        deviceFingerprint: body.deviceFingerprint || null,
        phone: trimmedPhone || null,
        email: trimmedEmail || null,
        ip: antiFraudIp,
        userAgent,
      });
      if (!guard.allowed) {
        return NextResponse.json(
          { success: false, error: guard.reason, errorCode: guard.errorCode },
          { status: 429 }
        );
      }

      if (!trimmedName) {
        return NextResponse.json(
          { success: false, error: "نام و نام خانوادگی الزامی است" },
          { status: 400 }
        );
      }
      if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        return NextResponse.json(
          { success: false, error: "ایمیل معتبر الزامی است" },
          { status: 400 }
        );
      }
      if (!trimmedCompany) {
        return NextResponse.json(
          { success: false, error: "نام سازمان الزامی است" },
          { status: 400 }
        );
      }
      const existingUser = await db.user.findUnique({
        where: { email: trimmedEmail },
        select: { id: true },
      });
      if (existingUser) {
        return NextResponse.json(
          {
            success: false,
            error: "این ایمیل قبلاً ثبت شده است. لطفاً وارد شوید و سپس پلن را اقساطی خریداری کنید.",
            errorCode: "EMAIL_ALREADY_EXISTS",
          },
          { status: 409 }
        );
      }
    }

    // ============ استعلام نهایی قیمت (منبع واحد + تخفیف‌ها) ============
    let userCreatedAt: Date | null = null;
    let userLastActiveAt: Date | null = null;
    let userEmail: string | null = null;
    if (userId) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { email: true, createdAt: true, lastLogin: true },
      });
      userEmail = user?.email ?? null;
      userCreatedAt = user?.createdAt ?? null;
      userLastActiveAt = user?.lastLogin ?? null;
    } else {
      userEmail = trimmedEmail || null;
    }

    const quote = await quoteInstallments({
      planId,
      period,
      count,
      couponCode: couponCode ?? null,
      userId,
      userEmail,
      tenantId,
      userCreatedAt,
      userLastActiveAt,
    });
    if (!quote.ok) {
      return NextResponse.json(
        { success: false, error: quote.error, errorCode: quote.errorCode },
        { status: 400 }
      );
    }

    // ============ درگاه زرین‌پال — قبل از هر write معنادار ============
    const merchantId = await getZarinpalMerchant();
    if (!merchantId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "درگاه پرداخت پیکربندی نشده است. لطفاً با مدیر پلتفرم تماس بگیرید تا کد پذیرنده زرین‌پال را در پنل سوپرادمین تنظیم کند.",
          errorCode: "MERCHANT_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }

    const firstAmountToman = quote.installments[0]?.amountToman ?? 0;
    if (firstAmountToman < 1000) {
      return NextResponse.json(
        { success: false, error: "مبلغ قسط اول زیر حد مجاز درگاه است" },
        { status: 400 }
      );
    }
    const amountRial = firstAmountToman * 10;
    const effectiveCallbackUrl = await enforcePaymentCallbackOrigin(callbackUrl);
    const description = `خرید اقساطی پلن ${quote.planName} — قسط ${1} از ${quote.count} — هوش`;

    const zpUrls = zarinpalUrls((await getPaymentSettings()).zarinpal.sandbox === true);
    const zarinpalRes = await fetch(zpUrls.request, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        merchant_id: merchantId,
        amount: amountRial,
        description,
        callback_url: effectiveCallbackUrl,
      }),
      signal: AbortSignal.timeout(12_000),
    }).catch(() => null);

    const zpData = (await zarinpalRes?.json().catch(() => null)) as {
      data?: { authority?: string; code?: number; message?: string } | null;
      errors?: { code?: number; message?: string } | null;
    } | null;

    if (!zarinpalRes?.ok || !zpData?.data?.authority) {
      const errCode = zpData?.errors?.code ?? zarinpalRes?.status;
      const errMsg = zpData?.errors?.message || zpData?.data?.message || `HTTP ${zarinpalRes?.status}`;
      console.error("[installment-plans] Zarinpal create failed:", errCode, errMsg);
      const faErr = zarinpalErrorFa(errCode);
      return NextResponse.json(
        {
          success: false,
          error: `${faErr}. لطفاً دقایقی بعد تلاش کنید یا با پشتیبانی تماس بگیرید.`,
          errorCode: "ZARINPAL_REQUEST_FAILED",
          gatewayCode: errCode,
          details: errMsg,
        },
        { status: 502 }
      );
    }

    const authority = zpData.data.authority;
    const gatewayUrl = `${zpUrls.startPay}${authority}`;

    // ============ حساب موقت مهمان (بعد از موفقیت درگاه) ============
    let tempTenantId: string | null = null;
    let tempUserId: string | null = null;
    let rawPassword: string | null = null;
    if (!isLoggedIn) {
      const username = generateUsername("user");
      rawPassword = generatePassword(14);
      const hashedPassword = await hashPassword(rawPassword);

      const tentativeTenant = await db.tenant.create({
        data: {
          name: trimmedCompany,
          plan: quote.planId,
          status: "pending_payment",
          contactName: trimmedName,
          contactEmail: trimmedEmail,
          contactPhone: trimmedPhone || null,
        },
      });
      tempTenantId = tentativeTenant.id;

      // سال مالی از سال شمسی جاری (الگوی register-and-pay)
      const { getCurrentJalaliYear, jalaliToGregorian } = await import("@/lib/persian");
      const jy = getCurrentJalaliYear();
      const [sy, sm, sd] = jalaliToGregorian(jy, 1, 1);
      const [ey, em, ed] = jalaliToGregorian(jy + 1, 1, 1);
      await db.fiscalYear.create({
        data: {
          tenantId: tentativeTenant.id,
          name: `سال مالی ${jy}`,
          startDate: new Date(sy, sm - 1, sd),
          endDate: new Date(ey, em - 1, ed - 1),
          status: "OPEN",
          isCurrent: true,
        },
      });

      const tentativeUser = await db.user.create({
        data: {
          tenantId: tentativeTenant.id,
          email: trimmedEmail,
          username,
          name: trimmedName,
          password: hashedPassword,
          phone: trimmedPhone || null,
          company: trimmedCompany,
          role: "ADMIN",
          isActive: false, // تا تأیید پرداخت قسط اول
        },
      });
      tempUserId = tentativeUser.id;
      tenantId = tentativeTenant.id;
      userId = tentativeUser.id;

      // ANTI-FRAUD: ثبت موفقیت
      await recordRegistrationSuccess({
        deviceFingerprint: body.deviceFingerprint || null,
        phone: trimmedPhone || null,
        email: trimmedEmail || null,
        ip: extractIp(req.headers),
        userAgent: req.headers.get("user-agent") || undefined,
      });
    }

    // ============ ساخت پلن اقساطی + اقساط (اتمیک) ============
    const created = await createPaymentPlanInDb(tenantId!, quote);
    if ("error" in created) {
      // حساب موقت مهمان را پاک کن (پولی رد نشده)
      if (tempTenantId) {
        await db.tenant.delete({ where: { id: tempTenantId } }).catch(() => undefined);
      }
      return NextResponse.json(
        { success: false, error: created.error, errorCode: "PLAN_CREATE_FAILED" },
        { status: 500 }
      );
    }

    const paymentId = `INST-${Date.now().toString(36).toUpperCase()}`;

    // ============ رکورد Integration — حقیقت واحد برای verify ============
    await db.integration.create({
      data: {
        tenantId: tenantId!,
        type: "PAYMENT",
        name: `Installments - ${quote.planId} x${quote.count} - ${paymentId}`,
        status: "PENDING",
        config: JSON.stringify({
          authority,
          paymentId,
          // فلو اقساط — verify این شاخه را تشخیص می‌دهد
          flow: "installments",
          installmentPlanId: created.id,
          installmentId: created.firstInstallmentId,
          amountToman: firstAmountToman,
          amountRial,
          planId: quote.planId,
          period: quote.period,
          baseAmountToman: quote.baseAmountToman,
          autoDiscountToman: quote.autoDiscountToman,
          couponCode: quote.couponCode,
          couponDiscountToman: quote.couponDiscountToman,
          totalDiscountToman: quote.autoDiscountToman + quote.couponDiscountToman + quote.fullPayDiscountToman,
          installmentCount: quote.count,
          installmentSeq: 1,
          fullPayDiscountToman: quote.fullPayDiscountToman,
          description,
          gateway: "zarinpal",
          // فلو register-and-pay برای مهمان — فعال‌سازی حساب در verify
          ...(tempUserId
            ? {
                userId: tempUserId,
                email: trimmedEmail,
                companyName: trimmedCompany,
                referralCode: body.referralCode ? String(body.referralCode).trim().toUpperCase() : null,
              }
            : {}),
          createdAt: new Date().toISOString(),
        }),
      },
    }).catch((e) => {
      console.error("[installment-plans] Failed to persist integration record:", e);
      // ادامه — authority معتبر است؛ پلن و قسط در DB ثبت شده‌اند
    });

    // ============ Audit log ============
    await db.auditLog
      .create({
        data: {
          tenantId: tenantId!,
          userId,
          action: "INSTALLMENT_PLAN_CREATE",
          entity: "LicensePaymentPlan",
          entityId: created.id,
          changes: JSON.stringify({
            planId: quote.planId,
            period: quote.period,
            installmentCount: quote.count,
            totalAmountToman: quote.totalAmountToman,
            firstAmountToman,
            couponCode: quote.couponCode,
            authority,
            flow: !isLoggedIn ? "register-and-installments" : "installments",
          }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      })
      .catch(() => undefined);

    return NextResponse.json({
      success: true,
      authority,
      gatewayUrl,
      paymentId,
      installmentPlanId: created.id,
      firstInstallmentId: created.firstInstallmentId,
      amount: firstAmountToman,
      amountRial,
      planId: quote.planId,
      period: quote.period,
      count: quote.count,
      totalAmountToman: quote.totalAmountToman,
      couponCode: quote.couponCode,
      couponDiscountToman: quote.couponDiscountToman,
      autoDiscountToman: quote.autoDiscountToman,
      fullPayDiscountToman: quote.fullPayDiscountToman,
      quote,
      message: !isLoggedIn
        ? "پلن اقساطی ساخته شد. پس از پرداخت قسط اول، حساب شما فعال و لایسنس صادر می‌شود."
        : "پلن اقساطی ساخته شد. پس از پرداخت قسط اول، لایسنس شما فعال می‌شود.",
    });
  } catch (error) {
    console.error("[installment-plans] error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ایجاد پلن اقساطی" },
      { status: 500 }
    );
  }
}
