import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/platform/anti-fraud/[id] — عملیات روی یک کلید (سوپرادمین)
// body: { blocked?: boolean, exempt?: boolean, note?: string, resetCount?: boolean }
//   blocked=true  → مسدود دستی (حتی با سقف صفر)
//   exempt=true   → معافیت دائمی از سقفِ لایهٔ خود (مثلاً دستگاه مشتری سازمانی)
//   resetCount    → صفرکردن شمارنده (کاملاً آزاد؛ معادل «حذف سابقهٔ این کلید»)
// DELETE /api/platform/anti-fraud/[id] — حذف کامل رکورد
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { blocked, exempt, note, resetCount } = body as {
      blocked?: boolean;
      exempt?: boolean;
      note?: string;
      resetCount?: boolean;
    };

    const existing = await db.registrationGuard.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "رکورد یافت نشد" },
        { status: 404 }
      );
    }

    const updated = await db.registrationGuard.update({
      where: { id },
      data: {
        ...(typeof blocked === "boolean" ? { blocked } : {}),
        ...(typeof exempt === "boolean" ? { exempt } : {}),
        ...(note !== undefined ? { note } : {}),
        ...(resetCount === true ? { count: 0 } : {}),
      },
    });

    // audit log
    await db.auditLog.create({
      data: {
        tenantId: "PLATFORM",
        action: "ANTI_FRAUD_UPDATE",
        entity: "RegistrationGuard",
        entityId: id,
        changes: JSON.stringify({
          guardKey: existing.guardKey,
          blockedBefore: existing.blocked,
          blockedAfter: updated.blocked,
          exemptBefore: existing.exempt,
          exemptAfter: updated.exempt,
          countBefore: existing.count,
          countAfter: updated.count,
          note: note || null,
        }),
      },
    }).catch(() => {
      /* audit نباید عملیات را متوقف کند */
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Anti-fraud update error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در به‌روزرسانی رکورد" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;
    const { id } = await params;

    const existing = await db.registrationGuard.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "رکورد یافت نشد" },
        { status: 404 }
      );
    }

    await db.registrationGuard.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        tenantId: "PLATFORM",
        action: "ANTI_FRAUD_DELETE",
        entity: "RegistrationGuard",
        entityId: id,
        changes: JSON.stringify({ guardKey: existing.guardKey, count: existing.count }),
      },
    }).catch(() => {
      /* audit نباید عملیات را متوقف کند */
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Anti-fraud delete error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در حذف رکورد" },
      { status: 500 }
    );
  }
}
