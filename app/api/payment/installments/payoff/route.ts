import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getZarinpalMerchant, getPaymentSettings } from "@/lib/system-settings";
import { zarinpalErrorFa, enforcePaymentCallbackOrigin, zarinpalUrls } from "@/lib/zarinpal";
// v36 (Task 4): سیستم اقساط — تسویهٔ زودهنگام با ۲٪ تخفیف
import { earlyPayoffAmount, EARLY_PAYOFF_DISCOUNT_PERCENT } from "@/lib/installments";
import { getPlanName } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/payment/installments/payoff
// --------------------------------------------------------------
// تسویهٔ زودهنگام: جمع همهٔ اقساط باقیماندهٔ باز − ۲٪ تخفیف → یک پرداخت.
// مبلغ‌ها فقط از DB خوانده می‌شوند؛ ترتیب اقساط حفظ می‌شود (اقساط قبل از
// «بازها» باید PAID باشند — payoff همیشه از اولین قسط باز به بعد می‌گیرد).
// body: { installmentPlanId, callbackUrl }
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const body = (await req.json().catch(() => ({}))) as {
      installmentPlanId?: string;
      callbackUrl?: string;
    };
    const planId = (body.installmentPlanId || "").trim();
    const callbackUrl = body.callbackUrl;
    if (!planId) {
      return NextResponse.json(
        { success: false, error: "شناسهٔ پلن اقساطی الزامی است" },
        { status: 400 }
      );
    }
    if (!callbackUrl || !/^https?:\/\//.test(callbackUrl)) {
      return NextResponse.json(
        { success: false, error: "آدرس بازگشت (callback) معتبر الزامی است" },
        { status: 400 }
      );
    }

    const plan = await db.licensePaymentPlan.findUnique({
      where: { id: planId },
      include: { installments: { orderBy: { seq: "asc" } } },
    });
    if (!plan) {
      return NextResponse.json(
        { success: false, error: "پلن اقساطی یافت نشد" },
        { status: 404 }
      );
    }
    if (plan.tenantId !== tenantId) {
      return NextResponse.json(
        { success: false, error: "این پلن اقساطی به سازمان شما تعلق ندارد" },
        { status: 403 }
      );
    }
    if (plan.status === "CANCELED") {
      return NextResponse.json(
        { success: false, error: "این پلن اقساطی متوقف شده است" },
        { status: 409 }
      );
    }

    // همهٔ اقساط باز به ترتیب — payoff آنها را یک‌جا تسویه می‌کند
    const open = plan.installments.filter((i) => i.status !== "PAID");
    if (open.length === 0) {
      return NextResponse.json(
        { success: false, error: "هیچ قسط بازِ باقیمانده‌ای وجود ندارد" },
        { status: 409 }
      );
    }
    const remainingToman = open.reduce((s, i) => s + i.amountToman, 0);
    const payoff = earlyPayoffAmount(remainingToman);
    if (payoff.amountToman < 1000) {
      return NextResponse.json(
        { success: false, error: "مبلغ تسویه زیر حد مجاز درگاه است" },
        { status: 400 }
      );
    }

    const amountRial = payoff.amountToman * 10;
    const merchantId = await getZarinpalMerchant();
    if (!merchantId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "درگاه پرداخت پیکربندی نشده است. لطفاً با مدیر پلتفرم تماس بگیرید تا کد پذیرنده زرین‌پال را تنظیم کند.",
          errorCode: "MERCHANT_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }

    const description = `تسویهٔ زودهنگام ${open.length} قسط لایسنس ${getPlanName(
      plan.planId
    )} (با ${EARLY_PAYOFF_DISCOUNT_PERCENT}٪ تخفیف) — هوش`;

    const zpUrls = zarinpalUrls((await getPaymentSettings()).zarinpal.sandbox === true);
    const zarinpalRes = await fetch(zpUrls.request, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        merchant_id: merchantId,
        amount: amountRial,
        description,
        callback_url: await enforcePaymentCallbackOrigin(callbackUrl),
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
      console.error("[installments/payoff] Zarinpal create failed:", errCode, errMsg);
      return NextResponse.json(
        {
          success: false,
          error: `${zarinpalErrorFa(errCode)}. لطفاً دقایقی بعد تلاش کنید یا با پشتیبانی تماس بگیرید.`,
          errorCode: "ZARINPAL_REQUEST_FAILED",
          gatewayCode: errCode,
          details: errMsg,
        },
        { status: 502 }
      );
    }

    const authority = zpData.data.authority;
    const gatewayUrl = `${zpUrls.startPay}${authority}`;
    const paymentId = `PAYOFF-${Date.now().toString(36).toUpperCase()}`;
    const openIds = open.map((i) => i.id);

    // authority روی همهٔ اقساط باز ذخیره می‌شود (ردیابی درون‌برنامه‌ای)
    await db.licenseInstallment
      .updateMany({
        where: { id: { in: openIds } },
        data: { authority },
      })
      .catch(() => undefined);

    // رکورد Integration — فلو payoff با فهرست کامل اقساط
    await db.integration.create({
      data: {
        tenantId,
        type: "PAYMENT",
        name: `Installments-Payoff - ${plan.planId} - ${paymentId}`,
        status: "PENDING",
        config: JSON.stringify({
          authority,
          paymentId,
          flow: "installments-payoff",
          installmentPlanId: plan.id,
          installmentIds: openIds,
          installmentSeqs: open.map((i) => i.seq),
          payoffAmountToman: payoff.amountToman,
          payoffDiscountToman: payoff.discountToman,
          remainingToman,
          amountToman: payoff.amountToman,
          amountRial,
          planId: plan.planId,
          period: plan.period,
          description,
          gateway: "zarinpal",
          createdAt: new Date().toISOString(),
        }),
      },
    }).catch((e) => {
      console.error("[installments/payoff] Failed to persist integration record:", e);
    });

    await db.auditLog
      .create({
        data: {
          tenantId,
          userId: auth.user.userId,
          action: "INSTALLMENT_PAYOFF_CREATE",
          entity: "LicensePaymentPlan",
          entityId: plan.id,
          changes: JSON.stringify({
            openCount: open.length,
            remainingToman,
            payoffAmountToman: payoff.amountToman,
            discountToman: payoff.discountToman,
            authority,
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
      installmentPlanId: plan.id,
      installmentIds: openIds,
      amount: payoff.amountToman,
      amountRial,
      remainingToman,
      discountToman: payoff.discountToman,
      discountPercent: EARLY_PAYOFF_DISCOUNT_PERCENT,
      message: `درخواست تسویهٔ زودهنگام ${open.length} قسط ساخته شد`,
    });
  } catch (error) {
    console.error("[installments/payoff] error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ایجاد درخواست تسویهٔ زودهنگام" },
      { status: 500 }
    );
  }
}
