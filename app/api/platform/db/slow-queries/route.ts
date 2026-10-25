import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
  getSlowQueries,
  clearSlowQueries,
  getSlowQueryStats,
} from "@/lib/slow-query-tracker";

export const runtime = "nodejs";

/**
 * GET /api/platform/db/slow-queries — فهرست کوئری‌های کند از حافظهٔ پروسه
 * پارامترها: ?limit=50&thresholdMs=100
 *
 * پاسخ (مطابق قرارداد SlowQueriesPanel):
 * { success, data: SlowQueryEntry[], stats: { totalLogged, avgDurationMs, maxDurationMs, byModel, thresholdMs, bufferSize, maxBuffer, trackingEnabled } }
 */
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get("limit") || 50) || 50;
    const thresholdMs = Number(searchParams.get("thresholdMs") || 100) || 100;

    const { entries, stats } = getSlowQueries({ limit, thresholdMs });
    const bufferStats = getSlowQueryStats();

    return NextResponse.json({
      success: true,
      data: entries,
      stats: {
        ...stats,
        ...bufferStats,
        trackingEnabled: process.env.TRACK_SLOW_QUERIES === "true",
      },
    });
  } catch (error) {
    console.error("Slow queries error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت کوئری‌های کند" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/platform/db/slow-queries — پاک‌سازی بافر کوئری‌های کند
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const cleared = clearSlowQueries();
    return NextResponse.json({
      success: true,
      message: `${cleared} رکورد از بافر کوئری‌های کند پاک شد`,
    });
  } catch (error) {
    console.error("Slow queries clear error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در پاک‌سازی بافر" },
      { status: 500 }
    );
  }
}
