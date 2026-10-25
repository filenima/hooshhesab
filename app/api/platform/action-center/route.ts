import { NextRequest, NextResponse } from "next/server";
import { statSync } from "fs";
import { join } from "path";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { getAntiFraudLimits } from "@/lib/system-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── راند ۱۳ (R13-3) — مرکز اقدام‌ها ───
// GET /api/platform/action-center — یک فراخوانی سریع و فقط‌خواندنی که
// همهٔ شمارنده‌های «نیاز به توجه» سوپرادمین را با کوئری‌های count کارا
// جمع می‌کند تا داشبورد به‌جای ۶ fetch جدا، فقط یک fetch بزند.
//
// پاسخ: { success, data: {
//   ticketsOpen,          // تیکت‌های پشتیبانی باز
//   bugReportsPending,    // گزارش باگ OPEN + IN_REVIEW (بررسی‌نشده)
//   trialsExpiringSoon,   // تریال‌های ≤۳ روز مانده به انقضا
//   trialsExpired,        // تریال‌های منقضی‌شده (هنوز isTrial)
//   errorsToday,          // خطاهای ثبت‌شده از نیمه‌شب تهران
//   scheduledPosts,       // مقالات در صف انتشار بلاگ
//   antiFraudAtLimit,     // کلیدهای ثبت‌نام به سقف رسیده
//   dbSizeBytes,          // حجم فایل دیتابیس (برای نوار وضعیت)
//   generatedAt,          // ISO زمان محاسبه
// }}

/** نیمه‌شب امروز به وقت تهران تبدیل‌شده به UTC — مبنای «امروز» برای صاحب فارسی‌زبان */
function tehranStartOfToday(): Date {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tehran",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(now);
    const get = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value || 0);
    const tehranNowUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour") % 24,
      get("minute"),
      get("second")
    );
    const offsetMs = tehranNowUtc - now.getTime();
    return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), 0, 0, 0) - offsetMs);
  } catch {
    // fallback: نیمه‌شب ساعت سرور
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
}

/** حجم فایل دیتابیس (بایت) — فقط خواندن، بدون باز کردن هندل */
function getDbSizeBytes(): number | null {
  try {
    // DATABASE_URL=file:../db/custom.db نسبت به prisma/ — همان رزولوشن Prisma
    const dbPath = join(process.cwd(), "db", "custom.db");
    return statSync(dbPath).size;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const now = new Date();
    const DAY = 24 * 60 * 60 * 1000;

    const [ticketsOpen, bugReportsPending, trialsExpiringSoon, trialsExpired, errorsToday, scheduledPosts] =
      await Promise.all([
        // تیکت‌های باز — همان تعریف stats.open در /api/tickets/all
        db.supportTicket.count({ where: { status: "OPEN" } }),
        // باگ‌های بررسی‌نشده — OPEN (خوانده‌نشده) + IN_REVIEW (در جریان بررسی)
        db.bugReport.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } }),
        // تریال‌های ≤۳ روز مانده (غیردمو، حذف‌نشده، هنوز منقضی نشده)
        db.user.count({
          where: {
            isTrial: true,
            isDemo: false,
            deletedAt: null,
            trialEndsAt: { gte: now, lte: new Date(now.getTime() + 3 * DAY) },
          },
        }),
        // تریال‌های منقضی‌شده که هنوز isTrial دارند (فرصت پیگیری/تبدیل)
        db.user.count({
          where: {
            isTrial: true,
            isDemo: false,
            deletedAt: null,
            trialEndsAt: { lt: now },
          },
        }),
        // خطاهای امروز از نیمه‌شب تهران
        db.errorLog.count({ where: { createdAt: { gte: tehranStartOfToday() } } }),
        // مقالات در صف انتشار — همان تعریف صف در blog/scheduler
        db.blogPost.count({ where: { status: "DRAFT", scheduledPublishAt: { not: null } } }),
      ]);

    // کلیدهای ثبت‌نام به سقف رسیده — همان منطق /api/platform/anti-fraud
    let antiFraudAtLimit = 0;
    try {
      const limits = await getAntiFraudLimits();
      const guards = await db.registrationGuard.findMany({
        select: { guardType: true, count: true, exempt: true, blocked: true },
      });
      antiFraudAtLimit = guards.filter(
        (r) =>
          !r.exempt &&
          !r.blocked &&
          ((r.guardType === "device" && limits.device > 0 && r.count >= limits.device) ||
            (r.guardType === "phone" && limits.phone > 0 && r.count >= limits.phone) ||
            (r.guardType === "email" && limits.email > 0 && r.count >= limits.email) ||
            (r.guardType === "ip" && limits.ip > 0 && r.count >= limits.ip))
      ).length;
    } catch {
      antiFraudAtLimit = 0;
    }

    return NextResponse.json({
      success: true,
      data: {
        ticketsOpen,
        bugReportsPending,
        trialsExpiringSoon,
        trialsExpired,
        errorsToday,
        scheduledPosts,
        antiFraudAtLimit,
        dbSizeBytes: getDbSizeBytes(),
        generatedAt: now.toISOString(),
      },
    });
  } catch (error) {
    console.error("Action-center error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در محاسبهٔ مرکز اقدام‌ها" },
      { status: 500 }
    );
  }
}
