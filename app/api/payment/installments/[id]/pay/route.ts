import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
import { getZarinpalMerchant, getPaymentSettings } from "@/lib/system-settings";
import { zarinpalErrorFa, enforcePaymentCallbackOrigin, zarinpalUrls } from "@/lib/zarinpal";
// v36 (Task 4): سیستم اقساط — پرداخت قسط بعدی از طریق زرین‌پال
import { getPlanName } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/payment/installments/[id]/pay
// --------------------------------------------------------------
// پرداخت یک قسط باز (PENDING/OVERDUE) — فقط قسطِ «بعدی» قابل پرداخت آنلاین
// است (ترتیب حفظ می‌شود). مبلغ فقط از DB خوانده می‌شود — هرگز از body.
// body: { callbackUrl }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const body = (await req.json().catch(() => ({}))) as { callbackUrl?: string };
    const callbackUrl = body.callbackUrl;
    if (!callbackUrl || !/^https?:\/\//.test(callbackUrl)) {
      return NextResponse.json(
        { success: false, error: "آدرس بازگشت (callback) معتبر الزامی است" },
        { status: 400 }
      );
    }

    // ── مبلغ فقط از DB (حقیقت واحد) ──
    const inst = await db.licenseInstallment.findUnique({
      where: { id },
      include: { paymentPlan: true },
    });
    if (!inst || !inst.paymentPlan) {
      return NextResponse.json(
        { success: false, error: "قسط یافت نشد" },
        { status: 404 }
      );
    }
    if (inst.paymentPlan.tenantId !== tenantId) {
      return NextResponse.json(
        { success: false, error: "این قسط به سازمان شما تعلق ندارد" },
        { status: 403 }
      );
    }
    if (inst.status === "PAID") {
      return NextResponse.json(
        { success: false, error: "این قسط قبلاً پرداخت شده است" },
        { status: 409 }
      );
    }
    if (inst.paymentPlan.status === "CANCELED") {
      return NextResponse.json(
        { success: false, error: "این پلن اقساطی متوقف شده است" },
        { status: 409 }
      );
    }
    // ترتیب اقساط: قسط‌های قبل از این باید پرداخت شده باشند
    const unpaidBefore = await db.licenseInstallment.count({
      where: {
        paymentPlanId: inst.paymentPlanId,
        seq: { lt: inst.seq },
        status: { not: "PAID" },
      },
    });
    if (unpaidBefore > 0) {
      return NextResponse.json(
        { success: false, error: "ابتدا اقساط قبلی را پرداخت کنید" },
        { status: 409 }
      );
    }

    const amountToman = inst.amountToman; // DB فقط
    if (amountToman < 1000) {
      return NextResponse.json(
        { success: false, error: "مبلغ قسط زیر حد مجاز درگاه است" },
        { status: 400 }
      );
    }
    const amountRial = amountToman * 10;

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

    const description = `قسط ${inst.seq} از ${inst.paymentPlan.installmentCount} لایسنس ${getPlanName(
      inst.paymentPlan.planId
    )} — هوش`;

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
      console.error("[installments/pay] Zarinpal create failed:", errCode, errMsg);
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
    const paymentId = `INST-${Date.now().toString(36).toUpperCase()}`;

    // ذخیرهٔ authority روی خود قسط + رکورد Integration برای verify
    await db.licenseInstallment.update({
      where: { id: inst.id },
      data: { authority },
    }).catch(() => undefined);

    await db.integration.create({
      data: {
        tenantId,
        type: "PAYMENT",
        name: `Installment-${inst.seq} - ${inst.paymentPlan.planId} - ${paymentId}`,
        status: "PENDING",
        config: JSON.stringify({
          authority,
          paymentId,
          flow: "installments",
          installmentPlanId: inst.paymentPlanId,
          installmentId: inst.id,
          installmentSeq: inst.seq,
          installmentCount: inst.paymentPlan.installmentCount,
          amountToman,
          amountRial,
          planId: inst.paymentPlan.planId,
          period: inst.paymentPlan.period,
          description,
          gateway: "zarinpal",
          createdAt: new Date().toISOString(),
        }),
      },
    }).catch((e) => {
      console.error("[installments/pay] Failed to persist integration record:", e);
    });

    await db.auditLog
      .create({
        data: {
          tenantId,
          userId: auth.user.userId,
          action: "INSTALLMENT_PAY_CREATE",
          entity: "LicenseInstallment",
          entityId: inst.id,
          changes: JSON.stringify({
            seq: inst.seq,
            amountToman,
            authority,
            wasOverdue: inst.status === "OVERDUE",
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
      installmentId: inst.id,
      seq: inst.seq,
      amount: amountToman,
      amountRial,
      message: `درخواست پرداخت قسط ${inst.seq} ساخته شد`,
    });
  } catch (error) {
    console.error("[installments/pay] error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ایجاد درخواست پرداخت قسط" },
      { status: 500 }
    );
  }
}
