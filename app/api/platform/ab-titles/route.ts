import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { db } from "@/lib/db";
import { saveSettings, invalidateSettingsCache, SETTING_KEYS } from "@/lib/system-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// /api/platform/ab-titles — A/B تست تایتل صفحات کلیدی (Task 11-D)
// ============================================================
// درخواست مالک: جدول ۱۰ صفحهٔ مهم با دو واریانت تایتل + یادداشت؛
// چرخهٔ ارزیابی هر ۲۸ روز. ذخیره‌سازی در SystemSettings (ab_titles_config).
//
// GET  → پیکربندی ذخیره‌شده + پیشنهاد صفحات مهم (اگر جدول خالی باشد)
// PUT  → ذخیرهٔ کامل جدول { rows: [{ path, titleA, titleB, activeTitle, notes }] }
//        + رویداد ممیزی (الگوی settings/branding)
// ============================================================

interface AbTitleRow {
  path: string;
  titleA: string;
  titleB?: string;
  activeTitle: "A" | "B";
  notes?: string;
  updatedAt?: string;
}

interface AbTitlesConfig {
  updatedAt: string;
  rows: AbTitleRow[];
}

const MAX_ROWS = 30;
const MAX_TITLE_LEN = 70;
const MAX_NOTES_LEN = 300;

function parseConfig(raw: string | null | undefined): AbTitlesConfig | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AbTitlesConfig>;
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    return parsed as AbTitlesConfig;
  } catch {
    return null;
  }
}

/** مسیر امن (شروع با /، بدون کوئری، حداکثر طول) */
function normalizePath(p: unknown): string | null {
  if (typeof p !== "string") return null;
  const trimmed = p.trim();
  if (!trimmed.startsWith("/")) return null;
  try {
    const u = new URL(trimmed, "http://x.local");
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return path.length <= 300 ? path : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const row = await db.systemSettings.findUnique({ where: { key: SETTING_KEYS.AB_TITLES_CONFIG } });
    const config = parseConfig(row?.value);

    // پیشنهاد صفحات مهم — ۱۰ مقالهٔ منتشرشدهٔ مهم‌تر (جدیدترین‌ها).
    // فقط وقتی ردیفی ذخیره نشده، برای پُرکردن یک‌کلیکی جدول ارائه می‌شود.
    let suggestions: { path: string; currentTitle: string }[] = [];
    if (!config || config.rows.length === 0) {
      const posts = await db.blogPost.findMany({
        where: { status: "PUBLISHED" },
        select: { slug: true, title: true },
        orderBy: [{ publishedAt: "desc" }],
        take: 10,
      });
      suggestions = posts.map((p) => ({ path: `/blog/${p.slug}`, currentTitle: p.title }));
    }

    return NextResponse.json({
      success: true,
      data: {
        rows: config?.rows ?? [],
        updatedAt: config?.updatedAt ?? null,
        suggestions,
        cycleDays: 28,
      },
    });
  } catch (error) {
    console.error("ab-titles GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت پیکربندی A/B تایتل" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  try {
    const body = (await req.json().catch(() => ({}))) as { rows?: unknown };
    if (!body || !Array.isArray(body.rows)) {
      return NextResponse.json(
        { success: false, error: "فیلد rows الزامی است" },
        { status: 400 }
      );
    }
    if (body.rows.length > MAX_ROWS) {
      return NextResponse.json(
        { success: false, error: `حداکثر ${MAX_ROWS} ردیف مجاز است` },
        { status: 400 }
      );
    }

    const seenPaths = new Set<string>();
    const rows: AbTitleRow[] = [];
    for (const raw of body.rows) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const path = normalizePath(r.path);
      if (!path) {
        return NextResponse.json(
          { success: false, error: "مسیر صفحه باید با / شروع شود (مثل /pricing)" },
          { status: 400 }
        );
      }
      if (seenPaths.has(path)) {
        return NextResponse.json(
          { success: false, error: `مسیر ${path} تکراری است — هر صفحه یک ردیف` },
          { status: 400 }
        );
      }
      seenPaths.add(path);

      const titleA = typeof r.titleA === "string" ? r.titleA.trim().slice(0, MAX_TITLE_LEN) : "";
      if (!titleA) {
        return NextResponse.json(
          { success: false, error: `تایتل A برای ${path} الزامی است` },
          { status: 400 }
        );
      }
      const titleB = typeof r.titleB === "string" ? r.titleB.trim().slice(0, MAX_TITLE_LEN) : "";
      if (titleB && titleB === titleA) {
        return NextResponse.json(
          { success: false, error: `تایتل B برای ${path} نباید با تایتل A یکسان باشد` },
          { status: 400 }
        );
      }
      const activeTitle = r.activeTitle === "B" && titleB ? "B" : "A";
      const notes = typeof r.notes === "string" ? r.notes.trim().slice(0, MAX_NOTES_LEN) : "";

      rows.push({ path, titleA, titleB, activeTitle, notes, updatedAt: new Date().toISOString() });
    }

    const config: AbTitlesConfig = { updatedAt: new Date().toISOString(), rows };
    await saveSettings([{ key: SETTING_KEYS.AB_TITLES_CONFIG, value: JSON.stringify(config) }]);
    invalidateSettingsCache();

    // رویداد ممیزی — الگوی settings/branding
    await db.platformAuditLog.create({
      data: {
        superAdminId: admin.id,
        action: "UPDATE_AB_TITLES",
        entity: "SystemSettings",
        details: JSON.stringify({ key: SETTING_KEYS.AB_TITLES_CONFIG, rows: rows.length }),
        ipAddress: req.headers.get("x-forwarded-for") || null,
      },
    }).catch(() => {
      // ignore audit log failure
    });

    return NextResponse.json({
      success: true,
      message: `پیکربندی A/B تایتل ذخیره شد — ${rows.length} صفحه`,
      data: config,
    });
  } catch (error) {
    console.error("ab-titles PUT error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ذخیرهٔ پیکربندی A/B تایتل" },
      { status: 500 }
    );
  }
}
