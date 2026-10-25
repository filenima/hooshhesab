import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { cacheGet, cacheSet } from "@/lib/cache";

export const runtime = "nodejs";

/**
 * GET /api/activities — فعالیت‌های اخیر کاربر از داده‌های واقعی کسب‌وکار
 * ============================================================================
 * v35 (درخواست مالک): هیچ دادهٔ فیک/دمویی — هر ردیف از رکوردهای واقعی
 * tenant فعلی ساخته می‌شود (فاکتور، مشتری، محصول، چک، سند).
 * کش ۳۰ ثانیه‌ای per-tenant برای پرفورمنس.
 */

const ACTIVITIES_CACHE_TTL_MS = 30_000;

interface ActivityDto {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string; // ISO
  amount?: number; // ریال
}

function formatInvoiceTitle(type: string): string {
  switch (type) {
    case "PURCHASE":
      return "فاکتور خرید ثبت شد";
    case "PRE_INVOICE":
      return "پیش‌فاکتور صادر شد";
    case "RETURN":
      return "فاکتور برگشتی ثبت شد";
    default:
      return "فاکتور فروش صادر شد";
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "15", 10) || 15, 5), 40);

    const auth = await getAuthContext(req);
    if (!auth) {
      return NextResponse.json({ success: false, error: "احراز هویت الزامی است" }, { status: 401 });
    }
    const tenantId = auth.tenantId;

    const cacheKey = `activities:${tenantId}:${limit}`;
    const cached = cacheGet<{ success: true; data: ActivityDto[] }>(cacheKey);
    if (cached) return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } });

    // ─── کوئری‌های موازی روی رکوردهای واقعی ───
    const [invoices, parties, products, checks, journals] = await Promise.all([
      db.invoice.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          number: true,
          type: true,
          total: true,
          currency: true,
          createdAt: true,
          party: { select: { name: true } },
        },
      }),
      db.party.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, name: true, type: true, createdAt: true },
      }),
      db.product.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, name: true, unit: true, createdAt: true, category: { select: { name: true } } },
      }),
      db.check.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 4,
        select: { id: true, number: true, type: true, amount: true, bankName: true, createdAt: true },
      }),
      db.journalEntry.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 4,
        select: { id: true, number: true, description: true, createdAt: true },
      }),
    ]);

    // ─── تبدیل به DTO یکسان ───
    const items: ActivityDto[] = [];

    for (const inv of invoices) {
      items.push({
        id: `inv-${inv.id}`,
        type: "invoice_created",
        title: formatInvoiceTitle(inv.type),
        description: `فاکتور شماره ${inv.number}${inv.party?.name ? ` — ${inv.party.name}` : ""}`,
        timestamp: inv.createdAt.toISOString(),
        amount: Number(inv.total),
      });
    }

    for (const p of parties) {
      const isSupplier = p.type === "SUPPLIER";
      items.push({
        id: `party-${p.id}`,
        type: "customer_added",
        title: isSupplier ? "تأمین‌کننده جدید ثبت شد" : "مشتری جدید ثبت شد",
        description: p.name,
        timestamp: p.createdAt.toISOString(),
      });
    }

    for (const pr of products) {
      items.push({
        id: `prod-${pr.id}`,
        type: "product_added",
        title: "محصول جدید اضافه شد",
        description: `${pr.name}${pr.category?.name ? ` (${pr.category.name})` : ""} — واحد: ${pr.unit}`,
        timestamp: pr.createdAt.toISOString(),
      });
    }

    for (const ch of checks) {
      const received = ch.type === "RECEIVED";
      items.push({
        id: `chk-${ch.id}`,
        type: received ? "payment_received" : "payment_sent",
        title: received ? "چک دریافت شد" : "چک صادر شد",
        description: `چک شماره ${ch.number} — بانک ${ch.bankName}`,
        timestamp: ch.createdAt.toISOString(),
        amount: Number(ch.amount),
      });
    }

    for (const j of journals) {
      items.push({
        id: `jrn-${j.id}`,
        type: "journal_created",
        title: "سند حسابداری ثبت شد",
        description: `سند شماره ${j.number}${j.description ? ` — ${j.description.slice(0, 60)}` : ""}`,
        timestamp: j.createdAt.toISOString(),
      });
    }

    // ─── مرتب‌سازی بر اساس زمان (تازه‌ترین اول) و برش ───
    items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const data = items.slice(0, limit);

    const payload = { success: true as const, data };
    cacheSet(cacheKey, payload, ACTIVITIES_CACHE_TTL_MS);
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[activities] خطا:", err);
    return NextResponse.json({ success: false, error: "خطای سرور" }, { status: 500 });
  }
}
