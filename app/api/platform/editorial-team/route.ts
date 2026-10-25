import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { emitAuditEvent } from "@/lib/audit-bus";
import { getEditorialTeam, saveEditorialTeam, type EditorialMember } from "@/lib/editorial-team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// /api/platform/editorial-team — مدیریت تیم تحریریه (E-E-A-T)
// ============================================================
// GET  → اعضای فعلی (پیش‌فرض نقش‌محور اگر تنظیم نشده)
// PUT  → ذخیرهٔ اعضای واقعی: نام، سمت، سوابق، تخصص، بیو، sameAs (لینکدین)
// مالک از پنل سوپرادمین نام‌ها و لینک‌های واقعی را جایگزین پیش‌فرض می‌کند؛
// صفحهٔ /authors و Article schema مقالات از همین منبع تغذیه می‌شوند.

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;
  try {
    const team = await getEditorialTeam();
    return NextResponse.json({ success: true, data: team });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "خطا در خواندن تیم تحریریه" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;
  try {
    const body = (await req.json().catch(() => ({}))) as { team?: EditorialMember[] };
    if (!Array.isArray(body.team)) {
      return NextResponse.json(
        { success: false, error: "فیلد team باید آرایه‌ای از اعضا باشد" },
        { status: 400 }
      );
    }
    const saved = await saveEditorialTeam(body.team);
    // رویداد ممیزی (fire-and-forget) — سوپرادمین‌های آنلاین می‌بینند
    emitAuditEvent({
      tenantId: "platform",
      action: "EDITORIAL_TEAM_SAVE",
      entity: "SystemSettings",
      entityId: "editorial_team",
      changes: JSON.stringify({ count: saved.length }),
    });
    return NextResponse.json({ success: true, data: saved });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "خطا در ذخیرهٔ تیم تحریریه" },
      { status: 500 }
    );
  }
}
