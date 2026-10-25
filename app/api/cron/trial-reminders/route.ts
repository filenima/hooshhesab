import { NextRequest, NextResponse } from "next/server";
import { sendTrialReminders } from "@/lib/trial-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET|POST /api/cron/trial-reminders — یادآوری چندکانالهٔ پایان تریال (v35.2).
 * پیاده‌سازی پیشنهاد ۵ سند روانشناسی فروش (پیشنهادهای-ارتقا-v35.md).
 *
 * لمس‌ها: روز ۳ (آخرین روز تخفیف ۵٪) • روز ۵ (دو روز مانده؛ ارزش و
 * داده) • روز ۷ (آخرین روز؛ قیمت قفل). کانال: اعلان درون‌برنامه‌ای + ایمیل.
 *
 * الگوی امنیتی مثل /api/cron/2fa-reminders: با هدر CRON_SECRET (اگر
 * تنظیم شده) یا open در development. هر یادآوری حداکثر یک‌بار در هر
 * دورهٔ تریال ارسال می‌شود (AuditLog marker) — فراخوانی مکرر بی‌خطر است.
 * پیشنهاد: هر ساعت یک‌بار.
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

    const result = await sendTrialReminders();
    return NextResponse.json({
      success: true,
      ...result,
      at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Trial reminders cron error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در اجرای یادآوری‌های تریال" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
