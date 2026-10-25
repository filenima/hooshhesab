import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

/**
 * POST /api/seo/revalidate — پاک‌سازی کش سئو/ISR
 *
 * احراز هویت (به‌ترتیب):
 * ۱) Authorization: Bearer <توکن سوپرادمین> — دکمه‌های «پاک‌سازی کش» پنل
 * ۲) هدر x-revalidate-token یا ?token=... مطابق env REVALIDATE_SECRET — برای کرون‌ها
 *
 * Body پشتیبانی‌شده:
 *  - { tag: "all" | "seo" | "api" | "pages" | "invoices" | "dashboard" } — کلیدهای پنل
 *  - { paths?: string[] } — مسیرهای مشخص (حداکثر ۵۰ مسیر)
 *  - { tags?: string[] } — تگ‌های کش نمادین
 *  - بدون body → پیش‌فرض sitemap/rss/blog
 */
const MAX_PATHS = 50;

const TAG_MAP: Record<
  string,
  { paths: string[]; tags: string[]; label: string }
> = {
  all: {
    label: "همهٔ کش‌ها",
    paths: [
      "/",
      "/blog",
      "/sitemap.xml",
      "/rss.xml",
      "/pricing",
      "/compare-plans",
      "/features",
      "/api/plans",
      "/api/blog/list",
    ],
    tags: ["blog", "sitemap", "seo", "pages", "plans", "landing", "api"],
  },
  seo: {
    label: "سئو (sitemap/rss/بلاگ)",
    paths: ["/sitemap.xml", "/rss.xml", "/blog", "/robots.txt"],
    tags: ["seo", "sitemap", "blog", "rss"],
  },
  api: {
    label: "APIها",
    paths: ["/api/plans", "/api/blog/list", "/api/health"],
    tags: ["api", "plans", "blog"],
  },
  pages: {
    label: "صفحات استاتیک",
    paths: ["/", "/pricing", "/features", "/compare-plans", "/blog"],
    tags: ["pages", "landing", "plans"],
  },
  invoices: {
    label: "فاکتور و داشبورد",
    paths: ["/", "/dashboard"],
    tags: ["invoices", "dashboard"],
  },
  dashboard: {
    label: "داشبورد",
    paths: ["/"],
    tags: ["dashboard", "landing"],
  },
};

async function isAuthorized(req: NextRequest): Promise<boolean> {
  // ─── ۱) توکن سوپرادمین (Bearer) — اول بررسی می‌شود ───
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const auth = await requireSuperAdmin(req);
    if (!("error" in auth)) return true;
  }

  // ─── ۲) راز REVALIDATE_SECRET (هدر یا query) ───
  const token =
    req.headers.get("x-revalidate-token") ||
    new URL(req.url).searchParams.get("token");
  if (!token) return false;
  const expectedToken = process.env.REVALIDATE_SECRET;
  if (!expectedToken) return false;
  return token === expectedToken;
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isAuthorized(req))) {
      return NextResponse.json(
        { success: false, error: "توکن نامعتبر — ورود سوپرادمین یا REVALIDATE_SECRET لازم است" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { tag, tags, paths } = (body || {}) as {
      tag?: string;
      tags?: string[];
      paths?: string[];
    };

    let targetPaths: string[] = [];
    let targetTags: string[] = [];
    let label = "پیش‌فرض";

    if (tag && TAG_MAP[tag]) {
      // ─── حالت کلیدهای پنل: { tag: "all" | "seo" | ... } ───
      targetPaths = TAG_MAP[tag].paths;
      targetTags = TAG_MAP[tag].tags;
      label = TAG_MAP[tag].label;
    } else if (tag) {
      // تگ ناشناخته — به‌عنوان تگ نمادین + تلاش برای revalidate مسیر هم‌نام
      targetPaths = [`/${tag.replace(/^\/+/, "")}`];
      targetTags = [tag];
      label = tag;
    } else {
      // ─── حالت صریح/پیش‌فرض ───
      targetPaths =
        paths && paths.length > 0 ? paths : ["/blog", "/sitemap.xml", "/rss.xml", "/"];
      targetTags = tags && tags.length > 0 ? tags : ["blog", "sitemap"];
      label = "مسیرهای صریح";
    }

    // سقف ۵۰ مسیر
    targetPaths = targetPaths.slice(0, MAX_PATHS);

    const revalidatedPaths: string[] = [];
    const revalidatedTags: string[] = [];
    const errors: string[] = [];

    for (const p of targetPaths) {
      if (typeof p !== "string" || !p.startsWith("/")) {
        errors.push(`مسیر نامعتبر: ${String(p).slice(0, 50)}`);
        continue;
      }
      try {
        revalidatePath(p);
        revalidatedPaths.push(p);
      } catch (e) {
        errors.push(`path ${p}: ${String(e).slice(0, 100)}`);
      }
    }

    for (const t of targetTags) {
      if (typeof t !== "string" || !t.trim()) continue;
      try {
        revalidateTag(t);
        revalidatedTags.push(t);
      } catch (e) {
        errors.push(`tag ${t}: ${String(e).slice(0, 100)}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        scope: label,
        revalidatedPaths,
        revalidatedTags,
        errors: errors.length > 0 ? errors : undefined,
        revalidatedAt: new Date().toISOString(),
      },
      message: `${label}: ${revalidatedPaths.length} مسیر و ${revalidatedTags.length} تگ revalidate شد`,
    });
  } catch (error) {
    console.error("Revalidate error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در revalidation" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/seo/revalidate — برای تست ساده (همان منطق POST، توکن از query)
 */
export async function GET(req: NextRequest) {
  return POST(req);
}
