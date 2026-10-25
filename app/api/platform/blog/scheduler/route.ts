import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { cacheDeleteByPrefix } from "@/lib/cache";
import {
  autoScheduleDrafts,
  getPublishIntervalDays,
  setPublishIntervalDays,
  publishDueScheduledPosts,
  getScheduleStats,
  setPublishPaused,
  structureLibrary,
  at9am,
} from "@/lib/blog-scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/blog/scheduler — آمار صف انتشار + صف کامل + انتشارهای اخیر
 *   پاسخ: { stats: {...}, queue: [...], recent: [...] }
 *
 * PUT — تغییر بازهٔ انتشار / توقف-ادامهٔ صف / نوبت‌دهی خودکار / انتشار فوری
 *   body: { intervalDays?: number, autoSchedule?: boolean, publishNow?: boolean, paused?: boolean }
 *
 * POST — عملیات تک‌آیتمی صف:
 *   { action: "reorder", orderedIds: string[] }      — جابه‌جایی ترتیب صف (drag-reorder)
 *   { action: "reschedule", postId: string, date }    — تغییر تاریخ انتشار یک مقاله
 *   { action: "unschedule", postId: string }           — خروج از صف (برگشت به «بدون نوبت»)
 *   { action: "addToQueue", postId: string }          — افزودن پیش‌نویس به آخر صف
 *   { action: "publishNowOne", postId: string }        — انتشار فوری همان مقاله
 */

interface QueueItem {
  id: string;
  title: string;
  slug: string;
  category: string;
  scheduledPublishAt: string;
  scheduleOrder: number;
}

interface RecentItem {
  id: string;
  title: string;
  slug: string;
  publishedAt: string;
}

async function getQueue(): Promise<QueueItem[]> {
  const rows = await db.blogPost.findMany({
    where: { status: "DRAFT", scheduledPublishAt: { not: null } },
    orderBy: [{ scheduledPublishAt: "asc" }, { scheduleOrder: "asc" }],
    select: {
      id: true,
      title: true,
      slug: true,
      category: true,
      scheduledPublishAt: true,
      scheduleOrder: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    category: r.category,
    scheduledPublishAt: (r.scheduledPublishAt as Date).toISOString(),
    scheduleOrder: r.scheduleOrder ?? 0,
  }));
}

async function getRecent(): Promise<RecentItem[]> {
  const rows = await db.blogPost.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 5,
    select: { id: true, title: true, slug: true, publishedAt: true },
  });
  return rows
    .filter((r) => r.publishedAt)
    .map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      publishedAt: (r.publishedAt as Date).toISOString(),
    }));
}

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;
  try {
    const [stats, queue, recent] = await Promise.all([
      getScheduleStats(),
      getQueue(),
      getRecent(),
    ]);
    return NextResponse.json({ success: true, data: { stats, queue, recent } });
  } catch (error) {
    console.error("Blog scheduler stats error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت آمار زمان‌بند" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json().catch(() => ({}));
    const { intervalDays, autoSchedule, publishNow, paused, structureLibraryTo } = body as {
      intervalDays?: number;
      autoSchedule?: boolean;
      publishNow?: boolean;
      paused?: boolean;
      /** v37: ساختاردهی کتابخانه — «۶۷ منتشر + بقیه در صف» */
      structureLibraryTo?: number;
    };

    let scheduled = 0;
    let publishedNow = 0;

    if (typeof intervalDays === "number" && intervalDays >= 1) {
      await setPublishIntervalDays(intervalDays);
    }

    // FIX(3-a): توقف/ادامهٔ کل صف
    if (typeof paused === "boolean") {
      await setPublishPaused(paused);
    }

    if (autoSchedule) {
      const res = await autoScheduleDrafts();
      scheduled = res.scheduled;
    }

    // v37 — ساختاردهی کتابخانهٔ بلاگ (هدف مالک: ۶۷ منتشر + ۲۰۰ پیش‌نویس صف)
    let structured: {
      keptPublished: number;
      unPublished: number;
      totalDrafts: number;
      scheduled: number;
      intervalDays: number;
    } | undefined;
    if (typeof structureLibraryTo === "number" && structureLibraryTo >= 1) {
      const res = await structureLibrary(Math.round(structureLibraryTo));
      structured = res;
    }

    if (publishNow) {
      // انتشار فوری اولین پیشنویسِ نوبت‌دار (یا بدون نوبت)
      const next = await db.blogPost.findFirst({
        where: { status: "DRAFT" },
        orderBy: [
          { scheduledPublishAt: "asc" },
          { scheduleOrder: "asc" },
          { createdAt: "asc" },
        ],
        select: { id: true },
      });
      if (next) {
        // FIX(3-a — بهداشت نوبت): نوبت صف پس از انتشار پاک می‌شود (همانند کرون)
        await db.blogPost.updateMany({
          where: { id: next.id, status: "DRAFT" },
          data: {
            status: "PUBLISHED",
            publishedAt: new Date(),
            scheduledPublishAt: null,
            scheduleOrder: null,
          },
        });
        publishedNow = 1;
        cacheDeleteByPrefix("blog:");
      }
    }

    const [stats, queue, recent] = await Promise.all([
      getScheduleStats(),
      getQueue(),
      getRecent(),
    ]);
    return NextResponse.json({
      success: true,
      data: { stats, queue, recent, newlyScheduled: scheduled, publishedNow, structured },
      message: structured
        ? `کتابخانه ساختاردهی شد: ${structured.keptPublished} منتشر + ${structured.scheduled} پیش‌نویس در صف (هر ${structured.intervalDays} روز یک انتشار)`
        : typeof paused === "boolean"
          ? paused
            ? "صف انتشار متوقف شد — نوبت‌ها سرجایشان می‌مانند"
            : "صف انتشار فعال شد"
          : `تنظیمات ذخیره شد — بازهٔ انتشار هر ${stats.intervalDays} روز`,
    });
  } catch (error) {
    console.error("Blog scheduler update error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ذخیرهٔ تنظیمات زمان‌بند" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body as { action?: string };
    const intervalDays = await getPublishIntervalDays();
    const DAY_MS = 24 * 60 * 60 * 1000;

    // ─── reorder: بازچینی کل صف بر اساس ترتیب ارسالی ───
    if (action === "reorder") {
      const orderedIds = (body.orderedIds as string[] | undefined) || [];
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        return NextResponse.json(
          { success: false, error: "orderedIds الزامی است" },
          { status: 400 }
        );
      }
      // FIX(3-a — ضد stale): ترتیب ارسالی ممکن است از snapshot قدیمیِ کلاینت
      // بیاید؛ اگر meanwhile کرون پستی را منتشر کرده یا آیتمی از صف خارج/
      // حذف شده باشد، نباید نوبتِ تازه روی پست منتشرشده «بازآفرینی» شود و
      // حذف‌شده‌ها نباید 500 (P2025) بدهند. پس فقط آیتم‌هایِ فعلیِ صف
      // (DRAFT + نوبت‌دار) که در لیست آمده‌اند بازچینی می‌شوند؛ بقیه نادیده.
      const currentQueue = await db.blogPost.findMany({
        where: { status: "DRAFT", scheduledPublishAt: { not: null } },
        select: { id: true },
      });
      const currentIds = new Set(currentQueue.map((r) => r.id));
      const validIds = orderedIds.filter(
        (id) => typeof id === "string" && currentIds.has(id)
      );
      if (validIds.length === 0) {
        return NextResponse.json(
          { success: false, error: "هیچ آیتم معتبری از صف در لیست نیست" },
          { status: 400 }
        );
      }
      // پایهٔ صف = نوبت اولِ فعلی (قدیمی‌ترین سررسیده)؛ اگر صف خالی بود فردا ۹ صبح.
      const first = await db.blogPost.findFirst({
        where: { status: "DRAFT", scheduledPublishAt: { not: null } },
        orderBy: { scheduledPublishAt: "asc" },
        select: { scheduledPublishAt: true },
      });
      let base: Date;
      const now = new Date();
      if (first?.scheduledPublishAt && new Date(first.scheduledPublishAt) > now) {
        base = at9am(new Date(first.scheduledPublishAt));
      } else {
        base = at9am(new Date(now.getTime() + DAY_MS)); // فردا ۹ صبح
      }
      for (let i = 0; i < validIds.length; i++) {
        const slot = new Date(base.getTime() + i * intervalDays * DAY_MS);
        // updateMany با گارد status=DRAFT → idempotent؛ آیتمِ ناگهان منتشرشده
        // (توسط کرونِ موازی) نادیده گرفته می‌شود، نه خطا.
        await db.blogPost.updateMany({
          where: { id: validIds[i], status: "DRAFT" },
          data: { scheduledPublishAt: slot, scheduleOrder: i + 1 },
        });
      }
      const [stats, queue, recent] = await Promise.all([
        getScheduleStats(),
        getQueue(),
        getRecent(),
      ]);
      await db.platformAuditLog.create({
        data: {
          superAdminId: auth.admin.id,
          action: "BLOG_QUEUE_REORDER",
          entity: "BlogPost",
          entityId: null,
          details: JSON.stringify({
            count: validIds.length,
            staleSkipped: orderedIds.length - validIds.length,
          }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      });
      return NextResponse.json({
        success: true,
        data: { stats, queue, recent },
        message: "ترتیب صف انتشار ذخیره شد",
      });
    }

    // ─── reschedule: تغییر تاریخ انتشار یک مقاله ───
    if (action === "reschedule") {
      const postId = body.postId as string | undefined;
      const rawDate = body.date as string | undefined;
      if (!postId || !rawDate) {
        return NextResponse.json(
          { success: false, error: "postId و date الزامی است" },
          { status: 400 }
        );
      }
      const parsed = new Date(rawDate);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { success: false, error: "تاریخ نامعتبر است" },
          { status: 400 }
        );
      }
      const post = await db.blogPost.findUnique({ where: { id: postId } });
      if (!post || post.status !== "DRAFT") {
        return NextResponse.json(
          { success: false, error: "پیش‌نویس یافت نشد" },
          { status: 404 }
        );
      }
      const slot = at9am(parsed);
      await db.blogPost.update({
        where: { id: postId },
        data: { scheduledPublishAt: slot },
      });
      const [stats, queue, recent] = await Promise.all([
        getScheduleStats(),
        getQueue(),
        getRecent(),
      ]);
      await db.platformAuditLog.create({
        data: {
          superAdminId: auth.admin.id,
          action: "BLOG_QUEUE_RESCHEDULE",
          entity: "BlogPost",
          entityId: postId,
          details: JSON.stringify({ slot: slot.toISOString() }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      });
      return NextResponse.json({
        success: true,
        data: { stats, queue, recent },
        message: "نوبت انتشار مقاله به‌روزرسانی شد",
      });
    }

    // ─── unschedule: خروج از صف ───
    if (action === "unschedule") {
      const postId = body.postId as string | undefined;
      if (!postId) {
        return NextResponse.json(
          { success: false, error: "postId الزامی است" },
          { status: 400 }
        );
      }
      await db.blogPost.update({
        where: { id: postId },
        data: { scheduledPublishAt: null, scheduleOrder: null },
      });
      const [stats, queue, recent] = await Promise.all([
        getScheduleStats(),
        getQueue(),
        getRecent(),
      ]);
      return NextResponse.json({
        success: true,
        data: { stats, queue, recent },
        message: "مقاله از صف انتشار خارج شد",
      });
    }

    // ─── addToQueue: افزودن پیش‌نویسِ بدون نوبت به آخر صف ───
    if (action === "addToQueue") {
      const postId = body.postId as string | undefined;
      if (!postId) {
        return NextResponse.json(
          { success: false, error: "postId الزامی است" },
          { status: 400 }
        );
      }
      const post = await db.blogPost.findUnique({ where: { id: postId } });
      if (!post || post.status !== "DRAFT") {
        return NextResponse.json(
          { success: false, error: "پیش‌نویس یافت نشد" },
          { status: 404 }
        );
      }
      const last = await db.blogPost.findFirst({
        where: { status: "DRAFT", scheduledPublishAt: { not: null } },
        orderBy: { scheduledPublishAt: "desc" },
        select: { scheduledPublishAt: true },
      });
      const now = new Date();
      const hasFuture =
        last?.scheduledPublishAt && new Date(last.scheduledPublishAt) > now;
      const slot = hasFuture
        ? new Date(
            at9am(new Date(last!.scheduledPublishAt as unknown as string)).getTime() +
              intervalDays * DAY_MS
          )
        : at9am(new Date(now.getTime() + DAY_MS));
      const maxOrder = await db.blogPost.findFirst({
        where: { status: "DRAFT", scheduleOrder: { not: null } },
        orderBy: { scheduleOrder: "desc" },
        select: { scheduleOrder: true },
      });
      await db.blogPost.update({
        where: { id: postId },
        data: {
          scheduledPublishAt: slot,
          scheduleOrder: (maxOrder?.scheduleOrder ?? 0) + 1,
        },
      });
      const [stats, queue, recent] = await Promise.all([
        getScheduleStats(),
        getQueue(),
        getRecent(),
      ]);
      return NextResponse.json({
        success: true,
        data: { stats, queue, recent },
        message: "مقاله به انتهای صف انتشار اضافه شد",
      });
    }

    // ─── publishNowOne: انتشار فوری یک مقالهٔ مشخص ───
    if (action === "publishNowOne") {
      const postId = body.postId as string | undefined;
      if (!postId) {
        return NextResponse.json(
          { success: false, error: "postId الزامی است" },
          { status: 400 }
        );
      }
      const post = await db.blogPost.findUnique({ where: { id: postId } });
      if (!post || post.status !== "DRAFT") {
        return NextResponse.json(
          { success: false, error: "پیش‌نویس یافت نشد" },
          { status: 404 }
        );
      }
      await db.blogPost.update({
        where: { id: postId },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          scheduledPublishAt: null,
        },
      });
      cacheDeleteByPrefix("blog:");
      const [stats, queue, recent] = await Promise.all([
        getScheduleStats(),
        getQueue(),
        getRecent(),
      ]);
      await db.platformAuditLog.create({
        data: {
          superAdminId: auth.admin.id,
          action: "BLOG_PUBLISH_NOW",
          entity: "BlogPost",
          entityId: postId,
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      });
      return NextResponse.json({
        success: true,
        data: { stats, queue, recent },
        message: "مقاله همین حالا منتشر شد",
      });
    }

    return NextResponse.json(
      { success: false, error: "action نامعتبر است" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Blog scheduler action error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در اجرای عملیات زمان‌بند" },
      { status: 500 }
    );
  }
}
