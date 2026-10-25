import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// FIX(v32-B): بیدارکردن کرون ارز از روی ترافیک health — حداکثر یک‌بار در
// دقیقه (module-level)؛ خود کرون ارز هم scrape را به یک‌بار در ۵ دقیقه
// و فقط برای دادهٔ کهنی‌تر از ۱۰ دقیقه محدود می‌کند.
let lastCurrencyKickAt = 0;
function kickCurrencyCron() {
  const now = Date.now();
  if (now - lastCurrencyKickAt < 60_000) return;
  lastCurrencyKickAt = now;
  fetch("http://127.0.0.1:3000/api/cron/currency", { method: "POST" }).catch(
    () => undefined
  );
}

// v35.2 (پیشنهاد ۵ سند روانشناسی): بیدارکردن کرون یادآوری تریال از روی
// ترافیک health — حداکثر یک‌بار در ساعت (module-level). خود کرون هم
// ضدتکرار AuditLog دارد (هر یادآوری حداکثر یک‌بار در هر دورهٔ تریال).
let lastTrialReminderKickAt = 0;
function kickTrialRemindersCron() {
  const now = Date.now();
  if (now - lastTrialReminderKickAt < 60 * 60_000) return;
  lastTrialReminderKickAt = now;
  fetch("http://127.0.0.1:3000/api/cron/trial-reminders", {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
  }).catch(() => undefined);
}

// v35.5 (نقشهٔ راه ۶-۱): بیدارکردن کرون گزارش هفتگی مدیر از روی ترافیک
// health — حداکثر یک‌بار در ۶ ساعت. خود کرون فقط جمعه‌ها (تهران) و با
// AuditLog marker یکتا در هر هفته فعال می‌شود (idempotent).
let lastWeeklyDigestKickAt = 0;
function kickWeeklyDigestCron() {
  const now = Date.now();
  if (now - lastWeeklyDigestKickAt < 6 * 60 * 60_000) return;
  lastWeeklyDigestKickAt = now;
  fetch("http://127.0.0.1:3000/api/cron/weekly-digest", {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
  }).catch(() => undefined);
}

// ============================================================================
// v36 (Task 4 — سیستم اقساط): بیدارکردن کرون اقساط از روی ترافیک health.
// حداکثر یک‌بار در ساعت (module-level)؛ خود کرون (/api/cron/installments)
// کاملاً idempotent است (گارد اتمیک updateMany + AuditLog marker یکتای
// installment:{id}:{stage} + کول‌داون lastReminderAt). کارها: معوق‌سازی،
// یادآوری D-7/D-1/D0/OVD+3 و تعلیق لایسنس در OVD+7.
// (بخش جدا برای جلوگیری از تداخل با سایر kickers)
// ============================================================================
let lastInstallmentCronKickAt = 0;
function kickInstallmentsCron() {
  const now = Date.now();
  if (now - lastInstallmentCronKickAt < 60 * 60_000) return;
  lastInstallmentCronKickAt = now;
  fetch("http://127.0.0.1:3000/api/cron/installments", {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
  }).catch(() => undefined);
}

// FIX(3-a باگ #۴): بیدارکردن کرون انتشار زمان‌بندی‌شدهٔ بلاگ از روی ترافیک
// health — حداکثر یک‌بار در ۶ ساعت. قبلاً این کرون هیچ تریگر خودکار نداشت →
// ۴۴ پیشنویس نوبت‌دار هرگز منتشر نمی‌شدند مگر بازدید /api/blog/list (که
// صفِ ۱۵دقیقه‌ای خودش را دارد) یا cron خارجی. با autoschedule=1، پیشنویس‌های
// بدون نوبت (خروجی موتور سئو) هم به‌صورت خودکار نوبت می‌گیرند؛ خود
// publishDueScheduledPosts سقف catch-up دارد (۱ پست در هر اجرا) و وقتی صف
// pause شده باشد منتشر نمی‌کند.
let lastPublishScheduledKickAt = 0;
function kickPublishScheduledCron() {
  const now = Date.now();
  if (now - lastPublishScheduledKickAt < 6 * 60 * 60_000) return;
  lastPublishScheduledKickAt = now;
  fetch("http://127.0.0.1:3000/api/cron/publish-scheduled?autoschedule=1", {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
  }).catch(() => undefined);
}

// GET /api/health — بررسی سلامت سرویس‌ها
// endpoint عمومی، بدون نیاز به احراز هویت
// پاسخ سریع (< 100ms)
export async function GET() {
 const startTime = Date.now();
 const timestamp = new Date().toISOString();

 // FIX(v31): بارگذاری تنبلِ ماژول موتور سئو را در اولین health-check بعد از
 // بوت تضمین می‌کند تا «ازسرگیری خودکار» اجراهای نیمه‌کاره (پس از
 // ری‌استارت سندباکس) بدون نیاز به بازدید پنل سوپرادمین فعال شود.
 // fire-and-forget — پاسخ health را کند نمی‌کند (import بعد از اولین بار cache می‌شود).
 void import("@/lib/seo/article-generator")
   .then((m) => m.ensureResumeHook())
   .catch(() => undefined);

 // FIX(v32-B): تازه‌ماندن نرخ‌های طلا/سکه/ارز — ترافیک خودِ سایت، کرون ارز
 // را بیدار می‌کند (fire-and-forget). این‌جا حداکثر یک‌بار در دقیقه صدا
 // زده می‌شود؛ خود کرون هم دو گارد ۵دقیقه/۱۰دقیقه‌ای دارد.
 kickCurrencyCron();

 // v35.2: یادآوری‌های چندکانالهٔ تریال (روز ۳/۵/۷) — ترافیک سایت کرون را
 // زنده نگه می‌دارد؛ کرون خودش idempotent است.
 kickTrialRemindersCron();

 // v35.5 (۶-۱): گزارش هفتگی مدیر — جمعه‌ها؛ idempotent با AuditLog.
 kickWeeklyDigestCron();

 // v36 (Task 4): کرون اقساط — معوق‌سازی/یادآوری/تعلیق؛ idempotent.
 kickInstallmentsCron();

 // FIX(3-a): انتشار زمان‌بندی‌شدهٔ بلاگ — هر ۶ ساعت؛ idempotent + سقف catch-up.
 kickPublishScheduledCron();

 // موازی بررسی همه سرویس‌ها
 const [database, realtime] = await Promise.all([
 checkDatabase(),
 checkRealtime(),
 ]);

 // AI service: در حال حاضر پیکربندی نشده، فرض می‌کنیم up
 // (می‌تواند با اضافه شدن z-ai-web-dev-sdk فعال شود)
 const ai = { status: "up" as const };

 // تعیین وضعیت کلی
 const allUp = database.status === "up" && realtime.status === "up";
 const dbUp = database.status === "up";
 let status: "healthy" | "degraded" | "down";
 if (allUp) {
 status = "healthy";
 } else if (dbUp) {
 status = "degraded"; // DB OK ولی realtime/AI مشکل دارد
 } else {
 status = "down";
 }

 const uptime = process.uptime();
 const version = process.env.npm_package_version || "1.0.0";

 // لاگ وضعیت غیرسالم
 if (status === "down") {
 logger.error("SYSTEM", "سلامت سیستم: DOWN", { database: database.status, realtime: realtime.status, dbLatency: database.latency });
 } else if (status === "degraded") {
 logger.warn("SYSTEM", "سلامت سیستم: DEGRADED", { database: database.status, realtime: realtime.status });
 }

 return NextResponse.json(
 {
 status,
 timestamp,
 services: {
 database,
 ai,
 realtime,
 },
 uptime,
 version,
 responseTimeMs: Date.now() - startTime,
 },
 {
 status: status === "down"? 503: 200,
 headers: {
 "Cache-Control": "no-store, no-cache, must-revalidate",
 },
 }
 );
}

// بررسی دیتابیس با query ساده
async function checkDatabase(): Promise<{
 status: "up" | "down";
 latency?: number;
 error?: string;
}> {
 const start = Date.now();
 try {
 // query ساده: SELECT 1 — در Prisma با $queryRaw
 await db.$queryRaw`SELECT 1`;
 return {
 status: "up",
 latency: Date.now() - start,
 };
 } catch (e) {
 return {
 status: "down",
 error: e instanceof Error? e.message: "Unknown DB error",
 latency: Date.now() - start,
 };
 }
}

// بررسی realtime service (websocket روی پورت 3032)
async function checkRealtime(): Promise<{
 status: "up" | "down";
 port: number;
 latency?: number;
 error?: string;
}> {
 const port = 3032;
 const start = Date.now();
 try {
 // تلاش برای اتصال به پورت socket.io
 // در محیط sandbox، localhost:3032 باید پاسخ بدهد
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 1500);

 const res = await fetch(`http://localhost:${port}/socket.io/?EIO=4&transport=polling`, {
 signal: controller.signal,
 method: "GET",
 });
 clearTimeout(timeout);

 if (res.ok || res.status === 400 || res.status === 404) {
 // socket.io معمولاً 400 یا 404 برمی‌گرداند اگر query parameters ناقص باشد
 // مهم این است که سرور پاسخ داده است
 return {
 status: "up",
 port,
 latency: Date.now() - start,
 };
 }
 return {
 status: "up", // اگر HTTP response گرفتیم، سرور بالا است
 port,
 latency: Date.now() - start,
 };
 } catch {
 // در محیط sandbox اگر realtime service راه‌اندازی نشده باشد،
 // این خطا طبیعی است — وضعیت down برمی‌گردد
 return {
 status: "down",
 port,
 latency: Date.now() - start,
 };
 }
}
