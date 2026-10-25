import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/user-auth";
// v36 (Task 4): سیستم اقساط — وضعیت اقساط tenant فعلی
import { earlyPayoffAmount, EARLY_PAYOFF_DISCOUNT_PERCENT } from "@/lib/installments";
import { toJalali } from "@/lib/persian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/payment/installment-plans/mine
// --------------------------------------------------------------
// وضعیت پلن‌های اقساطی tenant فعلی + جدول اقساط + گزینهٔ تسویهٔ زودهنگام.
// احراز هویت الزامی (requireUser مثل subscribe).
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { tenantId } = auth.user;

    const plans = await db.licensePaymentPlan.findMany({
      where: { tenantId, status: { in: ["ACTIVE", "DEFAULTED", "COMPLETED"] } },
      orderBy: { createdAt: "desc" },
      include: { installments: { orderBy: { seq: "asc" } } },
    });

    const planNameMap: Record<string, string> = {
      basic: "پایه",
      pro: "حرفه‌ای",
      enterprise: "سازمانی",
    };

    const items = plans.map((p) => {
      const installments = p.installments.map((i) => ({
        id: i.id,
        seq: i.seq,
        amountToman: i.amountToman,
        dueDate: i.dueDate.toISOString(),
        dueDateJalali: toJalali(i.dueDate),
        status: i.status,
        paidAt: i.paidAt?.toISOString() ?? null,
        refId: i.refId,
        authority: i.authority,
      }));
      // قسط بعدی = اولین قسط باز (PENDING/OVERDUE)
      const open = installments.filter((i) => i.status !== "PAID");
      const next = open[0] ?? null;
      const remainingToman = open.reduce((s, i) => s + i.amountToman, 0);
      const payoff =
        next && open.length > 0
          ? { ...earlyPayoffAmount(remainingToman), remainingToman, installmentIds: open.map((i) => i.id) }
          : null;
      const hasOverdue = open.some((i) => i.status === "OVERDUE");
      return {
        id: p.id,
        planId: p.planId,
        planName: planNameMap[p.planId] ?? p.planId,
        period: p.period,
        status: p.status,
        totalAmountToman: p.totalAmountToman,
        installmentCount: p.installmentCount,
        paidCount: p.paidCount,
        couponCode: p.couponCode,
        priceLockedToman: p.priceLockedToman,
        startsAt: p.startsAt.toISOString(),
        licenseId: p.licenseId,
        installments,
        nextInstallment: next,
        remainingToman,
        payoff,
        payoffDiscountPercent: EARLY_PAYOFF_DISCOUNT_PERCENT,
        hasOverdue,
      };
    });

    return NextResponse.json({
      success: true,
      plans: items,
      count: items.length,
    });
  } catch (error) {
    console.error("[installment-plans/mine] error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت اقساط شما" },
      { status: 500 }
    );
  }
}
