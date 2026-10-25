import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { effectiveIsTrial } from "@/lib/license-trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// GET /api/dashboard/value-summary — «گزارش ارزش هفتگی» (v35.2)
// ============================================================
// پیاده‌سازی پیشنهاد شمارهٔ ۳ سند روانشناسی فروش
// (پیشنهادهای-ارتقا-v35.md): «اثبات ارزش ریالیِ دستیار».
//
// کاربر عدد می‌بیند، نه ادعا: «این هفته X فاکتور، Y هزینه و Z کار
// خودکارِ هوش‌یار ثبت شد — N ساعت کار شما صرفه‌جویی شد که ارزش
// ماهانه‌اش ≈ W تومان است (بر مبنای حق‌الزحمهٔ دفترداری بازار)».
//
// همهٔ اعداد از «رخدادهای واقعی دیتابیس» در ۷ روز اخیر شمرده می‌شوند:
//   - Invoice (فروش/خرید)      → ثبت دستی در نرم‌افزار سنتی ~۴ دقیقه
//   - ExpenseEntry             → ~۳ دقیقه
//   - Product / Party (تازه)   → ~۲ دقیقه
//   - AuditLog(action=AI_EXECUTE_*) → هوش‌یار کل کار را انجام داد ~۶ دقیقه
//   - AIMessage(role=USER)     → پرسش‌وپاسخ به‌جای تماس با حسابدار ~۱.۵ دقیقه
// ============================================================================

/** حق‌الزحمهٔ ساعتی دفترداری بازار ۱۴۰۵ — نرخ محافظه‌کارانه (تومان/ساعت) */
export const BOOKKEEPING_HOURLY_RATE_TOMAN = 250_000;

/** میانگین تعداد هفته در ماه برای تصویر ماهانه */
const WEEKS_PER_MONTH = 4.33;

/** حداقل دقیقهٔ صرفه‌جویی هفته برای نمایش بنر (کمتر از این، «شروع نکرده» است) */
export const WEEKLY_BANNER_MIN_MINUTES = 8;

/** نرخ دقیقه‌به‌ازای هر نوع رخداد */
const MINUTES_PER = {
  invoice: 4,
  expense: 3,
  product: 2,
  party: 2,
  aiAction: 6,
  aiMessage: 1.5,
} as const;

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }
    const { tenantId, userId } = auth;

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { isTrial: true, trialEndsAt: true, createdAt: true },
    });
    const activeLicense = await db.license.findFirst({
      where: { tenantId, status: "ACTIVE" },
      orderBy: { endDate: "desc" },
      select: { source: true, endDate: true },
    });
    const isTrial = !!user && effectiveIsTrial(user, activeLicense);

    // ─── شمارش رخدادهای واقعیِ ۷ روز اخیر + کل دوره (هم‌زمان) ───
    const [
      weekInvoices,
      weekExpenses,
      weekProducts,
      weekParties,
      weekAiActions,
      weekAiMessages,
      totalInvoices,
      totalAiActions,
      totalAiMessages,
    ] = await Promise.all([
      db.invoice.count({
        where: { tenantId, type: { in: ["SALE", "PURCHASE"] }, createdAt: { gte: weekAgo } },
      }),
      db.expenseEntry.count({ where: { tenantId, createdAt: { gte: weekAgo } } }),
      db.product.count({ where: { tenantId, createdAt: { gte: weekAgo } } }),
      db.party.count({ where: { tenantId, createdAt: { gte: weekAgo } } }),
      // کارهایی که هوش‌یار «خودش» انجام داد (فاکتور/هزینه/مشتری/کالا/...)
      db.auditLog.count({
        where: { tenantId, action: { startsWith: "AI_EXECUTE" }, createdAt: { gte: weekAgo } },
      }),
      db.aIMessage.count({
        where: { role: "USER", createdAt: { gte: weekAgo }, conversation: { tenantId } },
      }),
      db.invoice.count({ where: { tenantId, type: { in: ["SALE", "PURCHASE"] } } }),
      db.auditLog.count({ where: { tenantId, action: { startsWith: "AI_EXECUTE" } } }),
      db.aIMessage.count({ where: { role: "USER", conversation: { tenantId } } }),
    ]);

    const weekMinutes =
      weekInvoices * MINUTES_PER.invoice +
      weekExpenses * MINUTES_PER.expense +
      weekProducts * MINUTES_PER.product +
      weekParties * MINUTES_PER.party +
      weekAiActions * MINUTES_PER.aiAction +
      weekAiMessages * MINUTES_PER.aiMessage;

    const weekHours = weekMinutes / 60;
    // ارزش ماهانهٔ تخمینی: ساعت هفتگی × هفته‌های ماه × نرخ ساعتی دفترداری
    const monthValueToman = Math.round(weekHours * WEEKS_PER_MONTH * BOOKKEEPING_HOURLY_RATE_TOMAN);

    const totalMinutes =
      totalInvoices * MINUTES_PER.invoice +
      totalAiActions * MINUTES_PER.aiAction +
      totalAiMessages * MINUTES_PER.aiMessage;

    return NextResponse.json({
      success: true,
      data: {
        isTrial,
        showBanner: weekMinutes >= WEEKLY_BANNER_MIN_MINUTES,
        week: {
          invoices: weekInvoices,
          expenses: weekExpenses,
          products: weekProducts,
          parties: weekParties,
          aiActions: weekAiActions,
          aiMessages: weekAiMessages,
          minutesSaved: Math.round(weekMinutes),
          hoursSaved: Math.round(weekHours * 10) / 10,
        },
        monthValueToman,
        hourlyRateToman: BOOKKEEPING_HOURLY_RATE_TOMAN,
        totalMinutesSaved: Math.round(totalMinutes),
        totals: {
          invoices: totalInvoices,
          aiActions: totalAiActions,
          aiMessages: totalAiMessages,
        },
      },
    });
  } catch (error) {
    console.error("dashboard/value-summary error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت گزارش ارزش" },
      { status: 500 }
    );
  }
}
