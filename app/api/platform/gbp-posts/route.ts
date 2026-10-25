import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { db } from "@/lib/db";
import { saveSettings, invalidateSettingsCache, SETTING_KEYS } from "@/lib/system-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// /api/platform/gbp-posts — پست‌های گوگل بیزینس (Task 11-D)
// ============================================================
// درخواست مالک: کامپوزر هفتگی پست GBP (عنوان + متن + لینک آخرین مقاله)
// + فهرست پست‌های قبلی + کپی برای انتشار دستی در Google Business Profile.
// ذخیره‌سازی در SystemSettings (gbp_posts) — ارسال خودکار انجام نمی‌شود
// (API عمومی GBP نیاز به تأییدیهٔ گوگل دارد)؛ متن آماده کپی می‌شود.
//
// GET    → فهرست پست‌ها + آخرین مقالهٔ منتشرشده (برای لینک پیشنهادی)
// POST   → افزودن پست { title, body, link? }
// DELETE → حذف پست ?id=<postId>
// همهٔ مسیرها: requireSuperAdmin + خطاهای فارسی + رویداد ممیزی
// ============================================================

interface GbpPost {
  id: string;
  title: string;
  body: string;
  link: string;
  createdAt: string;
}

interface GbpPostsConfig {
  updatedAt: string;
  posts: GbpPost[];
}

const MAX_POSTS = 60;
const MAX_TITLE_LEN = 80;
const MAX_BODY_LEN = 1200;
const MAX_LINK_LEN = 500;

function parseConfig(raw: string | null | undefined): GbpPostsConfig | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GbpPostsConfig>;
    if (!parsed || !Array.isArray(parsed.posts)) return null;
    return parsed as GbpPostsConfig;
  } catch {
    return null;
  }
}

/** لینک امن http(s) */
function normalizeLink(link: unknown): string | null {
  if (typeof link !== "string") return null;
  const trimmed = link.trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return trimmed.length <= MAX_LINK_LEN ? trimmed : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const row = await db.systemSettings.findUnique({ where: { key: SETTING_KEYS.GBP_POSTS } });
    const config = parseConfig(row?.value);

    // آخرین مقالهٔ منتشرشده — لینک پیشنهادی برای پست هفتگی
    const latest = await db.blogPost.findFirst({
      where: { status: "PUBLISHED" },
      select: { slug: true, title: true, publishedAt: true },
      orderBy: [{ publishedAt: "desc" }],
    });
    let latestPost: { title: string; path: string } | null = null;
    if (latest) {
      latestPost = { title: latest.title, path: `/blog/${latest.slug}` };
    }

    return NextResponse.json({
      success: true,
      data: {
        posts: config?.posts ?? [],
        updatedAt: config?.updatedAt ?? null,
        latestPost,
      },
    });
  } catch (error) {
    console.error("gbp-posts GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت پست‌های گوگل بیزینس" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const title = typeof body.title === "string" ? body.title.trim().slice(0, MAX_TITLE_LEN) : "";
    const text = typeof body.body === "string" ? body.body.trim().slice(0, MAX_BODY_LEN) : "";
    if (!title || !text) {
      return NextResponse.json(
        { success: false, error: "عنوان و متن پست الزامی است" },
        { status: 400 }
      );
    }
    const link = normalizeLink(body.link);
    if (link === null) {
      return NextResponse.json(
        { success: false, error: "لینک باید آدرس http/https معتبر باشد" },
        { status: 400 }
      );
    }

    const row = await db.systemSettings.findUnique({ where: { key: SETTING_KEYS.GBP_POSTS } });
    const config = parseConfig(row?.value) ?? { updatedAt: new Date().toISOString(), posts: [] };
    if (config.posts.length >= MAX_POSTS) {
      return NextResponse.json(
        { success: false, error: `حداکثر ${MAX_POSTS} پست ذخیره می‌شود — قدیمی‌ها را حذف کنید` },
        { status: 400 }
      );
    }

    const post: GbpPost = {
      id: `gbp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      title,
      body: text,
      link: link || "",
      createdAt: new Date().toISOString(),
    };
    const next: GbpPostsConfig = {
      updatedAt: post.createdAt,
      posts: [post, ...config.posts],
    };
    await saveSettings([{ key: SETTING_KEYS.GBP_POSTS, value: JSON.stringify(next) }]);
    invalidateSettingsCache();

    await db.platformAuditLog.create({
      data: {
        superAdminId: admin.id,
        action: "CREATE_GBP_POST",
        entity: "SystemSettings",
        details: JSON.stringify({ key: SETTING_KEYS.GBP_POSTS, postId: post.id, title: post.title }),
        ipAddress: req.headers.get("x-forwarded-for") || null,
      },
    }).catch(() => {
      // ignore audit log failure
    });

    return NextResponse.json({
      success: true,
      message: "پست گوگل بیزینس ذخیره شد",
      data: next,
    });
  } catch (error) {
    console.error("gbp-posts POST error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ذخیرهٔ پست گوگل بیزینس" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { success: false, error: "شناسهٔ پست الزامی است" },
        { status: 400 }
      );
    }

    const row = await db.systemSettings.findUnique({ where: { key: SETTING_KEYS.GBP_POSTS } });
    const config = parseConfig(row?.value);
    if (!config || !config.posts.some((p) => p.id === id)) {
      return NextResponse.json(
        { success: false, error: "پست مورد نظر یافت نشد" },
        { status: 404 }
      );
    }

    const next: GbpPostsConfig = {
      updatedAt: new Date().toISOString(),
      posts: config.posts.filter((p) => p.id !== id),
    };
    await saveSettings([{ key: SETTING_KEYS.GBP_POSTS, value: JSON.stringify(next) }]);
    invalidateSettingsCache();

    await db.platformAuditLog.create({
      data: {
        superAdminId: admin.id,
        action: "DELETE_GBP_POST",
        entity: "SystemSettings",
        details: JSON.stringify({ key: SETTING_KEYS.GBP_POSTS, postId: id }),
        ipAddress: req.headers.get("x-forwarded-for") || null,
      },
    }).catch(() => {
      // ignore audit log failure
    });

    return NextResponse.json({
      success: true,
      message: "پست حذف شد",
      data: next,
    });
  } catch (error) {
    console.error("gbp-posts DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در حذف پست گوگل بیزینس" },
      { status: 500 }
    );
  }
}
