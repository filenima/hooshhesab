import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ /api/pricing/social-proof ============
// v35.4 (پیشنهاد ۷ سند روانشناسی فروش — Social Proof زنده):
// آمار واقعی و به‌روزِ فعالیت پلتفرم برای صفحه قیمت‌گذاری.
// «۱۲ کسب‌وکار دیگر همین هفته پلن حرفه‌ای گرفتند» — از دادهٔ واقعی
// License (source=purchase)، بدون نام بردن از هیچ کسب‌وکاری.
//
// طراحی:
// - عمومی (بدون احراز هویت) — فقط اعداد تجمیعی، بدون PII.
// - کش درون‌حافظه‌ای ۶۰ ثانیه‌ای — در برابر بازدیدهای سنگین صفحه قیمت.
// - هر آمار فقط وقتی > 0 باشد در پاسخ می‌آید (صداقت: بدون دادهٔ ساختگی).

interface SocialProofStats {
 purchasesThisWeek: number;
 topPurchasedPlan: string | null;
 signupsThisWeek: number;
 invoicesThisWeek: number;
 activeBusinesses: number;
 trialActiveNow: number;
 updatedAt: string;
}

let cache: { at: number; data: SocialProofStats } | null = null;
const CACHE_TTL_MS = 60_000;

export async function GET() {
 try {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
   return NextResponse.json({ success: true, data: cache.data });
  }

  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  // خریدهای همین هفته (لایسنس واقعیِ پرداخت‌شده) + پلن پرتکرار
  const purchases = await db.license.findMany({
   where: { source: "purchase", createdAt: { gte: weekAgo } },
   select: { plan: true },
  });
  const planCounts = new Map<string, number>();
  for (const p of purchases) planCounts.set(p.plan, (planCounts.get(p.plan) || 0) + 1);
  let topPurchasedPlan: string | null = null;
  let best = 0;
  for (const [plan, count] of planCounts) {
   if (count > best) {
    best = count;
    topPurchasedPlan = plan;
   }
  }

  const [signupsThisWeek, invoicesThisWeek, activeLicenses, trialActiveNow] =
   await Promise.all([
    db.user.count({ where: { createdAt: { gte: weekAgo } } }),
    db.invoice.count({
     where: { createdAt: { gte: weekAgo }, deletedAt: null },
    }),
    db.license.findMany({
     where: { status: "ACTIVE", tenantId: { not: null } },
     select: { tenantId: true },
    }),
    db.user.count({ where: { isTrial: true, trialEndsAt: { gt: new Date(now) } } }),
   ]);

  const activeBusinesses = new Set(activeLicenses.map((l) => l.tenantId)).size;

  const data: SocialProofStats = {
   purchasesThisWeek: purchases.length,
   topPurchasedPlan: purchases.length > 0 ? topPurchasedPlan : null,
   signupsThisWeek,
   invoicesThisWeek,
   activeBusinesses,
   trialActiveNow,
   updatedAt: new Date(now).toISOString(),
  };

  cache = { at: now, data };
  return NextResponse.json({ success: true, data });
 } catch (error) {
  console.error("[social-proof] error:", error);
  return NextResponse.json(
   { success: false, error: "خطا در دریافت آمار" },
   { status: 500 }
  );
 }
}
