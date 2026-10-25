import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";

/**
 * GET /api/platform/db/schema — اسکیمای کامل دیتابیس برای SchemaVisualizer
 *
 * منبع داده:
 * ۱) DMMF (Prisma model metadata) برای مدل‌ها/فیلدها/روابط — camelCase
 * ۲) sqlite_master برای فهرست جدول‌های واقعی + شمار رکورد هر جدول
 *
 * پاسخ (مطابق قرارداد components/views/superadmin/schema-visualizer.tsx):
 * { success, data: { models: [{ name, fields: [{name,type,pk?,fk?,unique?}], relations: [{to,type,field}], rowCount }], edges: [{from,to,type,field}], stats: { modelCount, edgeCount } } }
 */
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    // ─── ۱) فهرست جدول‌های واقعی SQLite ───
    const tables = (await db.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'"
    )) as { name: string }[];
    const tableSet = new Set(tables.map((t) => t.name));

    // ─── ۲) مدل‌های DMMF ───
    const dmmf = Prisma.dmmf;
    const models = dmmf.datamodel.models;

    // نگاشت فیلدهای FK: fieldName@modelName → مدل مقصد (برای برچسب fk روی ستون اسکالر)
    const fkMap = new Map<string, string>();
    const edges: { from: string; to: string; type: string; field: string }[] = [];
    const relationsByModel = new Map<
      string,
      { to: string; type: string; field: string }[]
    >();

    for (const m of models) {
      const rels: { to: string; type: string; field: string }[] = [];
      for (const f of m.fields) {
        if (f.kind !== "object") continue;
        const relType = f.isList ? "1-n" : "1-1";
        const fkField = f.relationFromFields?.[0] ?? f.name;
        // اگر relation از طریق یک ستون اسکالر برقرار است، آن ستون را FK علامت بزن
        if (f.relationFromFields?.length) {
          for (const rf of f.relationFromFields) {
            fkMap.set(`${rf}@${m.name}`, f.type);
          }
        }
        rels.push({ to: f.type, type: relType, field: fkField });
        edges.push({ from: m.name, to: f.type, type: relType, field: fkField });
      }
      relationsByModel.set(m.name, rels);
    }

    // ─── ۳) شمار رکورد هر مدل (parallel، مقاوم به خطا) ───
    const rowCounts = new Map<string, number | null>();
    await Promise.all(
      models.map(async (m) => {
        try {
          const delegate = m.name.charAt(0).toLowerCase() + m.name.slice(1);
          const count = await (db as any)[delegate]?.count?.();
          rowCounts.set(m.name, typeof count === "number" ? count : null);
        } catch {
          rowCounts.set(m.name, null);
        }
      })
    );

    // ─── ۴) ساخت خروجی مدل‌ها ───
    const outModels = models
      .filter((m) => tableSet.has(m.name))
      .map((m) => ({
        name: m.name,
        fields: m.fields
          .filter((f) => f.kind === "scalar")
          .map((f) => ({
            name: f.name,
            type: f.type,
            pk: f.isId || undefined,
            unique: f.isUnique || undefined,
            fk: fkMap.get(`${f.name}@${m.name}`) || undefined,
          })),
        relations: relationsByModel.get(m.name) ?? [],
        rowCount: rowCounts.get(m.name) ?? null,
      }));

    // جدول‌هایی که در DMMF نیستند (مثلاً جدول‌های خام) هم بدون فیلد اضافه شوند
    const dmmfNames = new Set(models.map((m) => m.name));
    for (const t of tables) {
      if (!dmmfNames.has(t.name)) {
        let count: number | null = null;
        try {
          const c = await db.$queryRawUnsafe(
            `SELECT COUNT(*) as c FROM "${t.name.replace(/"/g, '""')}"`
          );
          count = Number((c as { c: number | bigint }[])[0]?.c ?? 0);
        } catch {
          count = null;
        }
        outModels.push({ name: t.name, fields: [], relations: [], rowCount: count });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        models: outModels,
        edges,
        stats: {
          modelCount: outModels.length,
          edgeCount: edges.length,
          tableCount: tables.length,
        },
      },
    });
  } catch (error) {
    console.error("DB schema error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت اسکیمای دیتابیس" },
      { status: 500 }
    );
  }
}
