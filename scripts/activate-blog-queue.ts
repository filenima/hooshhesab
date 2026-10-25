// ============================================================================
// scripts/activate-blog-queue.ts — فعال‌سازی صف انتشار ۴۴ پیش‌نویس بلاگ
// ----------------------------------------------------------------------------
// FIX(3-a باگ #۲): ۴۴ پست DRAFT بدون scheduledPublishAt/scheduleOrder در دیتابیس
// بودند → هرگز توسط زمان‌بند منتشر نمی‌شدند. این اسکریپت دقیقاً با همان منطق
// `autoScheduleDrafts` در lib/blog-scheduler.ts به همهٔ پیش‌نویس‌های بدونِ نوبت،
// نوبت هر-N-روزه می‌دهد (پیش‌فرض: هر ۲ روز، شروع از فردا ساعت ۹:۰۰ صبح).
//
// Idempotent: فقط پیش‌نویس‌های «بدون scheduledPublishAt» را تغییر می‌دهد —
// اجرای چندباره اثری ندارد. نوبت‌های جدید بعد از آخرین نوبتِ آیندهٔ موجود
// قرار می‌گیرند (با یک فاصلهٔ کامل، تا دو مقاله هم‌زمان منتشر نشوند —
// همان FIX(v30 date-overlap)).
//
// اجرا:
//   bun scripts/activate-blog-queue.ts
//   # یا با override صریح:
//   DATABASE_URL="file:/home/z/my-project/hooshhesab-work/extracted/hooshhesab/db/custom.db" bun scripts/activate-blog-queue.ts
// ============================================================================

import { readFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

// ─── تعیین مسیر مطلق دیتابیس پروژه (ضد-hijack متغیر محیطی سندباکس) ───
// سندباکس متغیر DATABASE_URL سراسری خودش را export می‌کند که به دیتابیس
// اسکلت پایه اشاره دارد — اگر به آن اعتماد کنیم، داده‌ها به DB غلط می‌روند.
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORCED_DB_URL = `file:${join(PROJECT_ROOT, "db", "custom.db")}`;
process.env.DATABASE_URL = FORCED_DB_URL;

const prisma = new PrismaClient({
  log: ["error", "warn"],
});

const INTERVAL_SETTING_KEY = "blog_publish_interval_days";
const DEFAULT_INTERVAL_DAYS = 2;

/** فردا ساعت ۹:۰۰ صبح (زمان محلی سرور) — مطابق lib/blog-scheduler.ts */
function nextRunAt9am(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

async function main() {
  console.log("== activate-blog-queue: نوبت‌دهی پیش‌نویس‌های بدون نوبت ==");
  console.log("DB:", FORCED_DB_URL);

  // ۱) بازهٔ انتشار از تنظیمات (پیش‌فرض ۲ روز)
  let intervalDays = DEFAULT_INTERVAL_DAYS;
  try {
    const row = await prisma.systemSettings.findUnique({
      where: { key: INTERVAL_SETTING_KEY },
    });
    const n = Number(row?.value);
    if (Number.isFinite(n) && n >= 1 && n <= 30) intervalDays = Math.round(n);
  } catch {
    /* ignore — همانند lib */
  }
  console.log(`بازهٔ انتشار: هر ${intervalDays} روز`);

  // ۲) پیش‌نویس‌های بدون نوبت (به‌ترتیب scheduleOrder سپس createdAt — مطابق lib)
  const drafts = await prisma.blogPost.findMany({
    where: { status: "DRAFT", scheduledPublishAt: null },
    orderBy: [{ scheduleOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true },
  });
  if (drafts.length === 0) {
    console.log("همهٔ پیش‌نویس‌ها نوبت دارند — کاری برای انجام نیست. ✓");
    return;
  }
  console.log(`پیش‌نویس بدون نوبت: ${drafts.length}`);

  // ۳) آخرین نوبت آیندهٔ «صف» (فقط پیشنویس‌ها) — نوبت‌های جدید بعد از آن.
  // scheduledPublishAtهای به‌جامانده از پست‌های منتشرشده (رکد در آینده)
  // نادیده گرفته می‌شوند — وگرنه صفِ جدید ماه‌ها به جلو می‌افتاد.
  const lastScheduled = await prisma.blogPost.findFirst({
    where: { status: "DRAFT", scheduledPublishAt: { not: null } },
    orderBy: { scheduledPublishAt: "desc" },
    select: { scheduledPublishAt: true },
  });
  const now = new Date();
  const hasFutureBase =
    lastScheduled?.scheduledPublishAt != null &&
    new Date(lastScheduled.scheduledPublishAt) > now;
  const base = hasFutureBase
    ? new Date(lastScheduled!.scheduledPublishAt as unknown as string)
    : nextRunAt9am();
  console.log(
    hasFutureBase
      ? `ادامهٔ صف از آخرین نوبت: ${base.toISOString()}`
      : `شروع صف از فردا ۹ صبح: ${base.toISOString()}`
  );

  // ۴) نوبت‌دهی — همان منطق autoScheduleDrafts (با گارد هم‌پوشانی v30)
  let scheduled = 0;
  for (let i = 0; i < drafts.length; i++) {
    const offsetIdx = hasFutureBase ? i + 1 : i;
    const slot = new Date(base.getTime() + offsetIdx * intervalDays * 24 * 60 * 60 * 1000);
    await prisma.blogPost.update({
      where: { id: drafts[i].id },
      data: { scheduledPublishAt: slot, scheduleOrder: i + 1 },
    });
    scheduled++;
    if (scheduled <= 5 || scheduled === drafts.length) {
      console.log(
        `  ${String(scheduled).padStart(2, "0")}/${drafts.length} ← «${drafts[i].title.slice(0, 50)}» @ ${slot.toISOString()}`
      );
    }
  }

  console.log(`\n✓ ${scheduled} پیش‌نویس نوبت‌دهی شد (هر ${intervalDays} روز).`);
  console.log("زمان‌بند خودکار (کرون publish-scheduled) از این پس آن‌ها را یکی‌یکی منتشر می‌کند.");
}

main()
  .catch((err) => {
    console.error("خطا در نوبت‌دهی صف بلاگ:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
