import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

/** سقف ردیف‌های برگشتی — مطابق قرارداد QueryExplorer (حداکثر ۱۰۰ ردیف) */
const MAX_ROWS = 100;

/**
 * تبدیل مقادیر خام SQLite به مقادیر JSON-سازگار
 * (BigInt → number، بافرها → رشته، Date می‌ماند و JSON خودش ISO می‌سازد)
 */
function serializeRow(row: Record<string, any>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "bigint") {
      out[k] = Number(v);
    } else if (v instanceof Uint8Array || v instanceof ArrayBuffer) {
      out[k] = `[باینری ${v instanceof Uint8Array ? v.length : v.byteLength} بایت]`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** آیا کوئری فقط خواندنی است؟ (SELECT / WITH) */
function isReadOnlyQuery(sql: string): boolean {
  const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
  if (!/^(select|with)\b/.test(normalized)) return false;
  // هیچ دستور تغییردهنده‌ای در میانه کوئری نباشد (multi-statement)
  if (/\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma)\b/.test(normalized)) {
    return false;
  }
  return true;
}

/**
 * GET /api/platform/db/inspect — اجرای کوئری فقط‌خواندنی یا پیش‌نمایش یک جدول
 *
 * دو حالت:
 * ۱) ?query=<SQL>     — اجرای SELECT خالص (Query Explorer) — سقف ۱۰۰ ردیف
 * ۲) ?table=X&take=50&skip=0 — پیش‌نمایش ردیف‌های یک جدول (نام camelCase مدل هم پذیرفته می‌شود)
 *
 * پاسخ: { success, data: { rows, rowCount, truncated, durationMs, executedQuery } }
 */
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query");
    const table = searchParams.get("table");
    const take = Math.min(Math.max(Number(searchParams.get("take") || 50) || 50, 1), MAX_ROWS);
    const skip = Math.max(Number(searchParams.get("skip") || 0) || 0, 0);

    let sql = "";

    if (table) {
      // ─── حالت ۲: پیش‌نمایش جدول — نام جدول باید واقعاً موجود باشد ───
      const tables = (await db.$queryRawUnsafe(
        "SELECT name FROM sqlite_master WHERE type='table'"
      )) as { name: string }[];
      const tableNames = tables.map((t) => t.name);
      const pascalCase = table.charAt(0).toUpperCase() + table.slice(1);
      const exact = tableNames.find((n) => n === table);
      const pascal = tableNames.find((n) => n === pascalCase);
      const target = exact ?? pascal;
      if (!target) {
        return NextResponse.json(
          { success: false, error: `جدول «${table}» وجود ندارد` },
          { status: 400 }
        );
      }
      sql = `SELECT * FROM "${target.replace(/"/g, '""')}" LIMIT ${take} OFFSET ${skip}`;
    } else if (query) {
      // ─── حالت ۱: کوئری آزاد فقط‌خواندنی ───
      const cleaned = query.trim().replace(/;\s*$/, "");
      if (!isReadOnlyQuery(cleaned)) {
        return NextResponse.json(
          {
            success: false,
            error: "فقط کوئری‌های SELECT/WITH مجاز هستند — دستورهای تغییردهنده مسدود شده‌اند",
          },
          { status: 403 }
        );
      }
      sql = cleaned;
      // اگر LIMIT ندارد، خودمان سقف بگذاریم
      if (!/\blimit\b/i.test(cleaned)) {
        sql = `SELECT * FROM (${cleaned}) LIMIT ${MAX_ROWS}`;
      } else {
        sql = `SELECT * FROM (${cleaned})`;
      }
    } else {
      return NextResponse.json(
        { success: false, error: "پارامتر query یا table الزامی است" },
        { status: 400 }
      );
    }

    const startedAt = Date.now();
    const rawRows = (await db.$queryRawUnsafe(sql)) as unknown[];
    const durationMs = Date.now() - startedAt;

    const rows = rawRows
      .map((r) => (r && typeof r === "object" ? serializeRow(r as Record<string, any>) : { value: r }))
      .slice(0, MAX_ROWS);

    return NextResponse.json({
      success: true,
      data: {
        rows,
        rowCount: rows.length,
        totalInResult: rawRows.length,
        truncated: rawRows.length > rows.length,
        durationMs,
        executedQuery: sql,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطا در اجرای کوئری";
    return NextResponse.json(
      { success: false, error: "خطا در اجرای کوئری", details: message.slice(0, 300) },
      { status: 500 }
    );
  }
}
