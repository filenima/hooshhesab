import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { getAntiFraudLimits, saveAntiFraudLimits } from "@/lib/system-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/platform/anti-fraud — مدیریت سد ضدتقلب ثبت‌نام (سوپرادمین)
// query: ?type=device|phone|email|ip — فیلتر نوع کلید
//        ?q=< substring جستجو
//        ?limit=50
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const url = new URL(req.url);
    const type = url.searchParams.get("type");
    const q = url.searchParams.get("q")?.trim();
    const limit = Math.min(200, Number(url.searchParams.get("limit")) || 50);

    const where: Record<string, unknown> = {};
    if (type && ["device", "phone", "email", "ip"].includes(type)) {
      where.guardType = type;
    }
    if (q) {
      where.guardKey = { contains: q };
    }

    const [guards, stats, limits] = await Promise.all([
      db.registrationGuard.findMany({
        where,
        orderBy: [{ lastSeen: "desc" }],
        take: limit,
      }),
      db.registrationGuard.groupBy({
        by: ["guardType"],
        _count: { _all: true },
        _sum: { count: true },
      }),
      getAntiFraudLimits(),
    ]);

    const total = stats.reduce((acc, s) => acc + s._count._all, 0);
    const blockedCount = await db.registrationGuard.count({ where: { blocked: true } });
    const exemptCount = await db.registrationGuard.count({ where: { exempt: true } });
    // کلیدهای «به سقف رسیده» — سقف لایهٔ خودشان را پر کرده‌اند و در حال رد شدن‌اند
    const atLimitCount = (
      await db.registrationGuard.findMany({
        select: { guardType: true, count: true, exempt: true, blocked: true },
      })
    ).filter(
      (r) =>
        !r.exempt &&
        !r.blocked &&
        ((r.guardType === "device" && r.count >= limits.device && limits.device > 0) ||
          (r.guardType === "phone" && r.count >= limits.phone && limits.phone > 0) ||
          (r.guardType === "email" && r.count >= limits.email && limits.email > 0) ||
          (r.guardType === "ip" && r.count >= limits.ip && limits.ip > 0))
    ).length;

    return NextResponse.json({
      success: true,
      data: {
        guards,
        stats: {
          total,
          blocked: blockedCount,
          exempt: exemptCount,
          atLimit: atLimitCount,
          byType: stats.map((s) => ({
            type: s.guardType,
            keys: s._count._all,
            registrations: s._sum.count ?? 0,
          })),
        },
        limits,
      },
    });
  } catch (error) {
    console.error("Anti-fraud list error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت فهرست ضدتقلب" },
      { status: 500 }
    );
  }
}

// PUT /api/platform/anti-fraud — به‌روزرسانی سقف‌های ثبت‌نام (سوپرادمین)
// body: { enabled?: boolean, device?: number, phone?: number, email?: number, ip?: number }
// اثر فوری — کش تنظیمات باطل می‌شود و ثبت‌نام بعدی با سقف جدید ارزیابی می‌شود.
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireSuperAdmin(req);
    if ("error" in auth) return auth.error;

    const body = (await req.json().catch(() => ({}))) as {
      enabled?: boolean;
      device?: number;
      phone?: number;
      email?: number;
      ip?: number;
    };

    const limits = await saveAntiFraudLimits(body);

    await db.auditLog
      .create({
        data: {
          tenantId: "PLATFORM",
          action: "ANTI_FRAUD_LIMITS_UPDATE",
          entity: "SystemSettings",
          entityId: "anti_fraud_limits",
          changes: JSON.stringify(limits),
        },
      })
      .catch(() => {
        /* audit نباید عملیات را متوقف کند */
      });

    return NextResponse.json({
      success: true,
      data: limits,
      message: "سقف‌های ثبت‌نام به‌روزرسانی شد",
    });
  } catch (error) {
    console.error("Anti-fraud limits update error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در به‌روزرسانی سقف‌ها" },
      { status: 500 }
    );
  }
}
