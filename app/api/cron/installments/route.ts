import { NextRequest, NextResponse } from "next/server";
// v36 (Task 4): کرون اقساط — معوق‌سازی، یادآوری‌های D-7/D-1/D0/OVD+3 و تعلیق OVD+7
import { processInstallmentCron } from "@/lib/installments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET|POST /api/cron/installments — نگهداشت چرخهٔ اقساط لایسنس (v36).
 *
 * کارها در هر اجرا (هر فراخوانی idempotent است):
 *  ۱) اقساط PENDING با سررسید گذشته → OVERDUE (و پلن → DEFAULTED)
 *  ۲) یادآوری درون‌برنامه‌ای: D-7، D-1، روز سررسید، OVD+3 (هشدار تعلیق)
 *  ۳) OVD+7 → License.status=SUSPENDED → کاربر LicenseLockScreen می‌گیرد.
 *     پرداخت قسط معوق در verify لایسنس را دوباره ACTIVE می‌کند.
 *
 * الگوی امنیتی مثل /api/cron/trial-reminders: هدر CRON_SECRET (اگر تنظیم
 * شده) یا open در development. ضدتکرار با AuditLog marker یکتای
 * `installment:{installmentId}:{stage}` + کول‌داون ۲۰ ساعته lastReminderAt.
 * پیشنهاد: هر ساعت یک‌بار (kicker در /api/health).
 */
async function handle(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const provided =
        req.headers.get("x-cron-secret") ||
        new URL(req.url).searchParams.get("secret");
      if (provided !== secret) {
        return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
      }
    }

    const result = await processInstallmentCron();
    return NextResponse.json({
      success: true,
      ...result,
      at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron/installments] error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در اجرای کرون اقساط" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
