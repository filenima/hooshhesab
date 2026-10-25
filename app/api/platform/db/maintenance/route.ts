import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

const VALID_ACTIONS = new Set(["vacuum", "integrity_check", "integrity", "optimize"]);

/**
 * POST /api/platform/db/maintenance — نگهداشت دیتابیس SQLite (سوپرادمین)
 * Body: { action: "vacuum" | "integrity_check" | "optimize" }
 *
 * پاسخ (مطابق قرارداد DatabaseManagerTab در superadmin-panel):
 * { success, data: { result } }
 *  - vacuum    → result: [{ action: "vacuum", ok: true }]
 *  - integrity_check → result: [{ integrity_check: "ok" }, ...]
 *  - optimize  → result: [{ action: "optimize", ok: true }]
 */
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const action = (body?.action || "").toString().trim();
    if (!VALID_ACTIONS.has(action)) {
      return NextResponse.json(
        {
          success: false,
          error: "action نامعتبر است — مجاز: vacuum | integrity_check | optimize",
        },
        { status: 400 }
      );
    }

    if (action === "vacuum") {
      // VACUUM داخل تراکنش اجرا نمی‌شود — $executeRawUnsafe بدون تراکنش است
      const startedAt = Date.now();
      await db.$executeRawUnsafe("VACUUM");
      return NextResponse.json({
        success: true,
        data: {
          result: [{ action: "vacuum", ok: true }],
          durationMs: Date.now() - startedAt,
        },
        message: "عملیات VACUUM با موفقیت اجرا شد — فایل دیتابیس فشرده شد",
      });
    }

    if (action === "integrity_check" || action === "integrity") {
      const startedAt = Date.now();
      const rows = (await db.$queryRawUnsafe(
        "PRAGMA integrity_check"
      )) as Record<string, unknown>[];
      return NextResponse.json({
        success: true,
        data: {
          result: rows.length > 0 ? rows : [{ integrity_check: "ok" }],
          durationMs: Date.now() - startedAt,
        },
        message: "بررسی یکپارچگی انجام شد",
      });
    }

    // optimize
    const startedAt = Date.now();
    await db.$executeRawUnsafe("PRAGMA optimize");
    return NextResponse.json({
      success: true,
      data: {
        result: [{ action: "optimize", ok: true }],
        durationMs: Date.now() - startedAt,
      },
      message: "PRAGMA optimize اجرا شد — آمار کوئری‌پلنر SQLite به‌روزرسانی شد",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطا در عملیات دیتابیس";
    console.error("DB maintenance error:", error);
    return NextResponse.json(
      { success: false, error: `خطا در عملیات دیتابیس: ${message.slice(0, 200)}` },
      { status: 500 }
    );
  }
}
