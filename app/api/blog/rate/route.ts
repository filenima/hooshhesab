import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * POST /api/blog/rate — ثبت امتیاز مقاله (v35.6 — بخش ۴ سند پیشنهادها)
 * ---------------------------------------------------------------
 * بدنه: { slug: string, rating: 1..5, helpful?: boolean }
 *
 * امنیت/سلامت:
 * - slug نرمال‌شده (طول + نویسه‌های مجاز) — تزریق مسیر ممکن نیست
 * - rating صرفاً عدد صحیح ۱..۵ — هر چیز دیگر 400
 * - ضد اسپم سبک: هر ۱۰ ثانیه حداکثر یک رأی از هر IP (پنجرهٔ کشیده‌شده
 *   در حافظه — برای این حجم کافی است؛ دیتابیس سنگین نمی‌شود)
 */

// ضد اسپم درون‌حافظه‌ای: ip → آخرین زمان رأی
const RATE_LIMIT_MS = 10 * 1000;
const recent = new Map<string, number>();
// پاک‌سازی دوره‌ای — prevent leak
if (typeof globalThis !== "undefined") {
  const g = globalThis as unknown as { __blogRateCleanup?: NodeJS.Timeout };
  if (!g.__blogRateCleanup) {
    g.__blogRateCleanup = setInterval(() => {
      const now = Date.now();
      for (const [k, t] of recent) {
        if (now - t > RATE_LIMIT_MS * 2) recent.delete(k);
      }
    }, 60 * 1000);
    g.__blogRateCleanup.unref?.();
  }
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
    const rating = Number(body?.rating);
    const helpful =
      typeof body?.helpful === "boolean" ? body.helpful : null;

    if (!slug || slug.length > 200 || !/^[\w\u0600-\u06FF-]+$/.test(slug)) {
      return NextResponse.json(
        { success: false, error: "شناسهٔ مقاله نامعتبر است." },
        { status: 400 }
      );
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { success: false, error: "امتیاز باید بین ۱ تا ۵ باشد." },
        { status: 400 }
      );
    }

    // ضد اسپم
    const ip = clientIp(req);
    const last = recent.get(ip) || 0;
    if (Date.now() - last < RATE_LIMIT_MS) {
      return NextResponse.json(
        { success: false, error: "لطفاً چند لحظه صبر کنید و دوباره امتیاز دهید." },
        { status: 429 }
      );
    }

    // مقاله وجود دارد؟ (ثبت امتیاز برای مقالهٔ ناموجود بی‌معنی است)
    const post = await db.blogPost.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!post) {
      return NextResponse.json(
        { success: false, error: "مقاله پیدا نشد." },
        { status: 404 }
      );
    }

    await db.blogArticleRating.create({
      data: { slug, rating, helpful: helpful ?? undefined },
    });
    recent.set(ip, Date.now());

    // میانگین به‌روزشده را هم برگردانیم (بدون درخواست دوم)
    const agg = await db.blogArticleRating.aggregate({
      where: { slug },
      _avg: { rating: true },
      _count: { _all: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        average: Math.round((agg._avg.rating || 0) * 10) / 10,
        count: agg._count._all,
      },
    });
  } catch (e) {
    console.error("[blog/rate] failed:", e);
    return NextResponse.json(
      { success: false, error: "ثبت امتیاز ناموفق بود — دوباره تلاش کنید." },
      { status: 500 }
    );
  }
}

/**
 * GET /api/blog/rate?slug=… — میانگین و تعداد رأی‌های یک مقاله
 * عمومی است (cache s=60) — برای رندر سمت کلاینت اگر لازم شد.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") || "";
  if (!slug || slug.length > 200 || !/^[\w\u0600-\u06FF-]+$/.test(slug)) {
    return NextResponse.json(
      { success: false, error: "شناسهٔ مقاله نامعتبر است." },
      { status: 400 }
    );
  }
  try {
    const agg = await db.blogArticleRating.aggregate({
      where: { slug },
      _avg: { rating: true },
      _count: { _all: true },
    });
    return NextResponse.json(
      {
        success: true,
        data: {
          average: Math.round((agg._avg.rating || 0) * 10) / 10,
          count: agg._count._all,
        },
      },
      { headers: { "Cache-Control": "public, max-age=60" } }
    );
  } catch (e) {
    console.error("[blog/rate] GET failed:", e);
    return NextResponse.json(
      { success: false, error: "خواندن امتیازها ناموفق بود." },
      { status: 500 }
    );
  }
}
