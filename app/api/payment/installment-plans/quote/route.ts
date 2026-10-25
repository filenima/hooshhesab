import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
// v36 (Task 4): سیستم اقساط — استعلام جدول اقساط بدون side-effect
import { quoteInstallments } from "@/lib/installments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/payment/installment-plans/quote
// --------------------------------------------------------------
// عمومی (بدون احراز هویت الزامی) — body: { planId, period, count, couponCode? }
// جدول اقساط + مبالغ + سررسید شمسی برمی‌گرداند. هیچ رکوردی ساخته نمی‌شود.
// اگر کاربر واردشده باشد (Bearer)، تخفیف‌های خودکارِ حساب او هم اعمال می‌شود.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      planId?: string;
      period?: string;
      count?: number;
      couponCode?: string;
    };

    const planId = (body.planId || "").trim();
    if (!planId) {
      return NextResponse.json(
        { success: false, error: "انتخاب پلن الزامی است" },
        { status: 400 }
      );
    }
    const period: "yearly" | "monthly" = body.period === "monthly" ? "monthly" : "yearly";
    const count = Math.round(Number(body.count) || 3);

    // زمینهٔ کاربر واردشده (اختیاری) — برای تخفیف‌های خودکار و کوپن per-user
    let userId: string | null = null;
    let userEmail: string | null = null;
    let tenantId: string | null = null;
    let userCreatedAt: Date | null = null;
    let userLastActiveAt: Date | null = null;
    try {
      const ctx = await getAuthContext(req);
      if (ctx?.userId) {
        userId = ctx.userId;
        tenantId = ctx.tenantId;
        const user = await db.user.findUnique({
          where: { id: ctx.userId },
          select: { email: true, createdAt: true, lastLogin: true },
        });
        userEmail = user?.email ?? null;
        userCreatedAt = user?.createdAt ?? null;
        userLastActiveAt = user?.lastLogin ?? null;
      }
    } catch {
      /* مهمان — بدون تخفیف خودکار */
    }

    const quote = await quoteInstallments({
      planId,
      period,
      count,
      couponCode: body.couponCode ?? null,
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

    return NextResponse.json({
      success: true,
      quote,
      message: `استعلام اقساط پلن ساخته شد`,
    });
  } catch (error) {
    console.error("[installment-plans/quote] error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در استعلام جدول اقساط" },
      { status: 500 }
    );
  }
}
