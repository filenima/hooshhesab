// ============ blog-scheduler.ts — موتور انتشار زمان‌بندی‌شده بلاگ (v19 → v36) ============
// ----------------------------------------------------------------------------
// درخواست مالک: «۲۷ وبلاگ در حالت پیشنویس باشد و بشونه انتخاب کرد که مثلاً
// هر دو روز یک وبلاگ منتشر بشه.»
//
// سازوکار:
//   ۱) autoScheduleDrafts() — به همهٔ پیشنویس‌های بدونِ زمان‌بندی،
//      نوبت‌های هر-N-روزه اختصاص می‌دهد (بر اساس scheduleOrder یا createdAt).
//      اولین نوبت = فردا ساعت ۹ صبح؛ بعدی‌ها هر N روز.
//   ۲) publishDueScheduledPosts(maxPublish = 1) — پیشنویس‌هایی که موعدشان رسیده
//      را منتشر می‌کند. FIX(3-a باگ #۳): حداکثر ۱ پست در هر اجرا — اگر سرور
//      مدتی خاموش بوده باشد «سیل انتشار» اتفاق نمی‌افتد (سیگنال بد سئو).
//      کرون هر ۳۰ دقیقه اجرا می‌شود → ۴۸ اجرا/روز = حداکثر ۴۸ انتشار/روز؛
//      تریگر فرصت‌طلبانهٔ /api/blog/list هم همین سقف را اعمال می‌کند.
//   ۳) تریگرها: cron endpoint (/api/cron/publish-scheduled — با kicker خودکار
//      از /api/health هر ۶ ساعت) + فراخوانی فرصت‌طلبانه در /api/blog/list
//      (بدون تأخیر محسوس — حداکثر هر ۱۵ دقیقه یک‌بار).
//   ۴) FIX(3-a): توقف/ادامهٔ کل صف (pause) — کلید «blog_publish_paused».
//      وقتی صف متوقف است هیچ پیشنویسی منتشر نمی‌شود (نوبت‌ها سرجایشان می‌مانند).
//
// تنظیمات در SystemSettings:
//   «blog_publish_interval_days» — بازهٔ انتشار؛ پیش‌فرض = ۲ روز.
//   «blog_publish_paused»        — "1" = صف متوقف؛ "0"/ندارد = فعال.
// ============================================================================

import { db } from "@/lib/db";

const INTERVAL_SETTING_KEY = "blog_publish_interval_days";
const PAUSED_SETTING_KEY = "blog_publish_paused";
export const DEFAULT_INTERVAL_DAYS = 2;

/** خواندن بازهٔ انتشار از تنظیمات (پیش‌فرض ۲ روز) */
export async function getPublishIntervalDays(): Promise<number> {
  try {
    const row = await db.systemSettings.findUnique({
      where: { key: INTERVAL_SETTING_KEY },
    });
    const n = Number(row?.value);
    if (Number.isFinite(n) && n >= 1 && n <= 30) return Math.round(n);
  } catch {
    /* ignore */
  }
  return DEFAULT_INTERVAL_DAYS;
}

/** ذخیرهٔ بازهٔ انتشار (سوپرادمین) */
export async function setPublishIntervalDays(days: number): Promise<void> {
  const clamped = Math.max(1, Math.min(30, Math.round(days)));
  await db.systemSettings.upsert({
    where: { key: INTERVAL_SETTING_KEY },
    create: { key: INTERVAL_SETTING_KEY, value: String(clamped) },
    update: { value: String(clamped) },
  });
}

/** آیا صف انتشار متوقف است؟ */
export async function isPublishPaused(): Promise<boolean> {
  try {
    const row = await db.systemSettings.findUnique({
      where: { key: PAUSED_SETTING_KEY },
    });
    return row?.value === "1";
  } catch {
    return false;
  }
}

/** توقف/ادامهٔ کل صف انتشار */
export async function setPublishPaused(paused: boolean): Promise<void> {
  await db.systemSettings.upsert({
    where: { key: PAUSED_SETTING_KEY },
    create: { key: PAUSED_SETTING_KEY, value: paused ? "1" : "0" },
    update: { value: paused ? "1" : "0" },
  });
}

// ============================================================
// LIBRARY-STRUCTURE (v37) — ساختاردهی کتابخانهٔ بلاگ به هدف مالک:
// «۲۶۷ وبلاگ کامل: ۶۷ منتشرشده + ۲۰۰ پیشنویسِ زمان‌بندی‌شده»
// ============================================================
// درخواست مالک (راند ۱۰): ۶۷ مقاله منتشر بماند و ۲۰۰ مقاله در صف
// پیش‌نویس با انتشار خودکار هر-N-روزه (جدا از اپشن ساخت اتومات وبلاگ).
//
// منطق انتخابِ «۶۷ تای منتشر»:
//  ۱) مقاله‌های ستون (پیلار) خوشه‌ها همیشه منتشر می‌مانند (ستون‌های سئو)
//  ۲) بعد قدیمی‌ترین‌های منتشرشده (طولانی‌ترین سابقهٔ ایندکس/بک‌لینک)
// ۳) بقیهٔ منتشرشده‌ها → پیش‌نویس؛ اما در «ابتدای صف» قرار می‌گیرند تا
//    زودترین نوبت را بگیرند و URLهای قبلاً ایندکس‌شده سریع برگردند.
// ۴) همهٔ پیش‌نویس‌ها نوبت هر-N-روزه از فردا ۹ صبح می‌گیرند (idempotent).
// ============================================================
export async function structureLibrary(
  keepPublished = 67
): Promise<{
  keptPublished: number;
  unPublished: number;
  totalDrafts: number;
  scheduled: number;
  intervalDays: number;
  firstSlot: Date | null;
  lastSlot: Date | null;
}> {
  const intervalDays = await getPublishIntervalDays();
  const DAY_MS = 24 * 60 * 60 * 1000;

  // مقاله‌های ستون خوشه‌ها — همیشه منتشر
  let pillarSlugs: string[] = [];
  try {
    const { PILLAR_SLUGS } = await import("@/lib/seo/topic-bank");
    pillarSlugs = Object.values(PILLAR_SLUGS);
  } catch {
    pillarSlugs = [];
  }

  const published = await db.blogPost.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "asc" },
    select: { id: true, slug: true },
  });

  const keepSet = new Set<string>();
  for (const p of published) {
    if (pillarSlugs.includes(p.slug)) keepSet.add(p.id);
  }
  for (const p of published) {
    if (keepSet.size >= keepPublished) break;
    keepSet.add(p.id);
  }
  const toUnpublish = published.filter((p) => !keepSet.has(p.id));

  // تبدیل به پیش‌نویس (بدون از دست دادن publishedAt تاریخی — سابقه حفظ می‌شود)
  if (toUnpublish.length > 0) {
    await db.blogPost.updateMany({
      where: { id: { in: toUnpublish.map((p) => p.id) } },
      data: { status: "DRAFT", scheduledPublishAt: null, scheduleOrder: null },
    });
  }

  // صف‌بندی کامل: ex-published اول، بعد بقیهٔ پیش‌نویس‌ها (قدیمی‌ترین اول)
  const drafts = await db.blogPost.findMany({
    where: { status: "DRAFT" },
    orderBy: [{ createdAt: "asc" }],
    select: { id: true },
  });
  const exIds = new Set(toUnpublish.map((p) => p.id));
  const ordered = [
    ...drafts.filter((d) => exIds.has(d.id)),
    ...drafts.filter((d) => !exIds.has(d.id)),
  ];

  const base = nextRunAt9am();
  for (let i = 0; i < ordered.length; i++) {
    const slot = new Date(base.getTime() + i * intervalDays * DAY_MS);
    await db.blogPost.updateMany({
      where: { id: ordered[i].id, status: "DRAFT" },
      data: { scheduledPublishAt: slot, scheduleOrder: i + 1 },
    });
  }

  // ابطال کش‌های بلاگ
  try {
    const { cacheDeleteByPrefix } = await import("@/lib/cache");
    cacheDeleteByPrefix("blog:");
  } catch {
    /* ignore */
  }

  const kept = published.length - toUnpublish.length;
  return {
    keptPublished: kept,
    unPublished: toUnpublish.length,
    totalDrafts: drafts.length,
    scheduled: ordered.length,
    intervalDays,
    firstSlot: ordered.length > 0 ? base : null,
    lastSlot:
      ordered.length > 0
        ? new Date(base.getTime() + (ordered.length - 1) * intervalDays * DAY_MS)
        : null,
  };
}

/**
 * زمان‌بندی خودکار پیشنویس‌های بدون نوبت — هر N روز یک پست.
 * ترتیب: scheduleOrder موجود → createdAt. نوبت‌ها از فردا ۹:۰۰ صبح شروع می‌شوند.
 *
 * FIX(3-a): مبنای «آخرین نوبت» فقط از پیشنویس‌های هنوز-در-صف خوانده می‌شود؛
 * scheduledPublishAtهای به‌جامانده از پست‌های منتشرشده (رکد در آینده) صفِ
 * جدید را ماه‌ها به جلو نمی‌لغزانند.
 */
export async function autoScheduleDrafts(): Promise<{ scheduled: number; intervalDays: number }> {
  const intervalDays = await getPublishIntervalDays();

  // پیشنویس‌های بدون زمان‌بندی
  const drafts = await db.blogPost.findMany({
    where: { status: "DRAFT", scheduledPublishAt: null },
    orderBy: [{ scheduleOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (drafts.length === 0) return { scheduled: 0, intervalDays };

  // آخرین نوبتِ آیندهٔ «صف» (فقط پیشنویس‌ها) — نوبت‌های جدید بعد از آن
  const lastScheduled = await db.blogPost.findFirst({
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

  let scheduled = 0;
  // FIX(v30 — date overlap): نوبت اولِ پیشنویسِ جدید باید «یک بازه» بعد از
  // آخرین نوبتِ موجود باشد، نه هم‌روزِ آن — وگرنه دو مقاله هم‌زمان منتشر
  // می‌شدند (باگ دیده‌شده در ۲۰۲۶-۱۱-۲۰ و ۲۰۲۶-۱۲-۲۶).
  for (let i = 0; i < drafts.length; i++) {
    const offsetIdx = hasFutureBase ? i + 1 : i;
    const slot = new Date(base.getTime() + offsetIdx * intervalDays * 24 * 60 * 60 * 1000);
    await db.blogPost.update({
      where: { id: drafts[i].id },
      data: { scheduledPublishAt: slot, scheduleOrder: i + 1 },
    });
    scheduled++;
  }
  return { scheduled, intervalDays };
}

/** فردا ساعت ۹:۰۰ صبح (زمان محلی سرور) */
function nextRunAt9am(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

/** ساعت ۹ صبحِ تاریخِ ورودی (بدون تغییر روز) */
export function at9am(d: Date): Date {
  const c = new Date(d);
  c.setHours(9, 0, 0, 0);
  return c;
}

/**
 * انتشار پیشنویس‌های سررسیده — موعد رسیده → PUBLISHED.
 * FIX(3-a باگ #۳ — سقف catch-up): در هر اجرا حداکثر maxPublish پست
 * (پیش‌فرض ۱) منتشر می‌شود تا پس از خاموشیِ طولانی سرور، ده‌ها پست یک‌جا
 * منتشر نشود (سیگنال بد سئو). اولویت با قدیمی‌ترین نوبت است.
 * idempotent و امن برای فراخوانی هم‌زمان (updateMany با شرط status=DRAFT).
 */
export async function publishDueScheduledPosts(
  maxPublish = 1
): Promise<{
  published: number;
  nextSlot: Date | null;
  paused: boolean;
}> {
  const paused = await isPublishPaused();
  const now = new Date();
  let publishedCount = 0;

  if (!paused) {
    // فقط سررسیده‌های همان نوبت — سقف‌دار
    const take = Math.max(1, Math.min(10, Math.round(maxPublish)));
    const due = await db.blogPost.findMany({
      where: { status: "DRAFT", scheduledPublishAt: { lte: now } },
      orderBy: [{ scheduledPublishAt: "asc" }, { scheduleOrder: "asc" }],
      select: { id: true },
      take,
    });
    if (due.length > 0) {
      const res = await db.blogPost.updateMany({
        where: {
          id: { in: due.map((d) => d.id) },
          // گارد idempotent: فقط همین‌ها، فقط اگر هنوز پیشنویس‌اند
          status: "DRAFT",
          scheduledPublishAt: { lte: now },
        },
        // FIX(3-a — بهداشت نوبت): نوبت صف پس از انتشار پاک می‌شود تا روی
        // پست منتشرشده «رکد» نماند (نوبت‌های رکد باعث گیج‌شدن آمار صف و
        // مبناهای صف‌بندی می‌شدند؛ ۱۲۷ پست منتشرشده نوبت کهنه داشتند).
        data: {
          status: "PUBLISHED",
          publishedAt: now,
          scheduledPublishAt: null,
          scheduleOrder: null,
        },
      });
      publishedCount = res.count;
    }
  }

  // باطل‌کردن کش لیست بلاگ
  try {
    const { cacheDeleteByPrefix } = await import("@/lib/cache");
    cacheDeleteByPrefix("blog:");
  } catch {
    /* ignore */
  }

  const next = await db.blogPost.findFirst({
    where: { status: "DRAFT", scheduledPublishAt: { not: null } },
    orderBy: { scheduledPublishAt: "asc" },
    select: { scheduledPublishAt: true },
  });

  return {
    published: publishedCount,
    nextSlot: next?.scheduledPublishAt ? new Date(next.scheduledPublishAt) : null,
    paused,
  };
}

/** آمار صف انتشار برای پنل سوپرادمین */
export async function getScheduleStats(): Promise<{
  intervalDays: number;
  paused: boolean;
  drafts: number;
  scheduled: number;
  published: number;
  today: number;
  nextSlot: Date | null;
  lastPublishedAt: Date | null;
}> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [intervalDays, paused, drafts, scheduled, published, today, next, last] = await Promise.all([
    getPublishIntervalDays(),
    isPublishPaused(),
    db.blogPost.count({ where: { status: "DRAFT", scheduledPublishAt: null } }),
    db.blogPost.count({ where: { status: "DRAFT", scheduledPublishAt: { not: null } } }),
    db.blogPost.count({ where: { status: "PUBLISHED" } }),
    db.blogPost.count({
      where: { status: "PUBLISHED", publishedAt: { gte: todayStart } },
    }),
    db.blogPost.findFirst({
      where: { status: "DRAFT", scheduledPublishAt: { not: null } },
      orderBy: { scheduledPublishAt: "asc" },
      select: { scheduledPublishAt: true },
    }),
    db.blogPost.findFirst({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      select: { publishedAt: true },
    }),
  ]);
  return {
    intervalDays,
    paused,
    drafts,
    scheduled,
    published,
    today,
    nextSlot: next?.scheduledPublishAt ? new Date(next.scheduledPublishAt) : null,
    lastPublishedAt: last?.publishedAt ? new Date(last.publishedAt) : null,
  };
}
