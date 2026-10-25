// ============ lib/mini-plan.ts ============
// v35.4 (پیشنهاد ۴ سند روانشناسی فروش — Foot-in-the-door):
// پلن «مینی» رایگانِ همیشگی پس از پایان دورهٔ آزمایش.
//
// به‌جای قفل کامل حساب بعد از تریال، کاربر به‌صورت خودکار به پلن مینی
// می‌رود: ۵ فاکتور در ماه، ۱ کاربر، ۱ انبار، مشاهدهٔ کامل داده‌ها.
// داده‌ها و عادت کاربر حفظ می‌شود؛ ارتقا از دل دادهٔ موجود بسیار
// آسان‌تر از جذب مشتری تازه است.
//
// پیاده‌سازی:
// - یک رکورد License دائمی (endDate=null, source="mini", status=ACTIVE)
// - tenant.plan به "mini" به‌روز می‌شود تا گیت ماژول‌ها (plan-features)
//   و /api/user/profile همان محدودیت را ببینند.
// - idempotent: اگر لایسنس مینی یا خریدِ فعال وجود داشته باشد، هیچ کاری نمی‌کند.
// - فراخوانی: /api/license/status وقتی تریال منقضی شده باشد (بنر هر ۶۰ ثانیه
//   این مسیر را می‌خواند؛ بنابراین سقوط به مینی حداکثر ~۱ دقیقه بعد از
//   انقضای تریال خودکار رخ می‌دهد) + هنگام لاگین.

import { db } from "@/lib/db";
import { getLicenseDefaults } from "@/lib/plans";
import { generateLicenseKeyLite, hashLicenseKeyLite } from "@/lib/session-lite";

export const MINI_PLAN_ID = "mini";

interface MiniUserLike {
 id: string;
 tenantId: string;
 isTrial: boolean;
 trialEndsAt: Date | string | null;
}

export interface MiniPlanResult {
 /** لایسنس مینی (تازه‌ساخته یا موجود) */
 licenseId: string;
 /** آیا در این فراخوانی تازه ساخته شد؟ */
 created: boolean;
 /** سقف فاکتور سالانهٔ پلن مینی */
 maxInvoices: number;
}

/** آیا کاربرِ داده‌شده شرایط سقوط به پلن مینی را دارد؟ */
export function shouldDowngradeToMini(user: MiniUserLike): boolean {
 if (!user.isTrial || !user.trialEndsAt) return false;
 const end = new Date(user.trialEndsAt).getTime();
 return Number.isFinite(end) && Date.now() > end;
}

/**
 * اطمینان از وجود لایسنس مینی برای tenant — idempotent.
 * فقط وقتی تریال منقضی شده باشد و هیچ لایسنس ACTIVE دیگری نباشد.
 */
export async function ensureMiniPlanAfterTrial(user: MiniUserLike): Promise<MiniPlanResult | null> {
 if (!shouldDowngradeToMini(user)) return null;

 // اگر لایسنس ACTIVE (خرید یا مینی قبلی) وجود دارد، کاری نکن
 const active = await db.license.findFirst({
  where: { tenantId: user.tenantId, status: "ACTIVE" },
  orderBy: { createdAt: "desc" },
  select: { id: true, plan: true, endDate: true, maxInvoices: true },
 });
 if (active) {
  const activeExpired =
   active.endDate !== null && new Date(active.endDate).getTime() < Date.now();
  if (!activeExpired) {
   // لایسنس مینی موجود — فقط tenant.plan را همگام کن
   if (active.plan === MINI_PLAN_ID) {
    await db.tenant
     .update({ where: { id: user.tenantId }, data: { plan: MINI_PLAN_ID } })
     .catch(() => { /* best-effort */ });
    return {
     licenseId: active.id,
     created: false,
     maxInvoices: active.maxInvoices ?? 60,
    };
   }
   // لایسنس فعال دیگری (خرید) — سقوط معنا ندارد
   return null;
  }
 }

 // ساخت لایسنس مینی دائمی
 const defaults = getLicenseDefaults(MINI_PLAN_ID);
 const key = generateLicenseKeyLite();
 const license = await db.license.create({
  data: {
   key,
   keyHash: hashLicenseKeyLite(key),
   tenantId: user.tenantId,
   plan: MINI_PLAN_ID,
   status: "ACTIVE",
   source: "mini",
   // endDate=null → دائمی؛ سهمیه‌چکر (license-quota) و security هر دو
   // رکوردهای ACTIVE با endDate-null را معتبر می‌دانند.
   endDate: null,
   maxUsers: defaults.maxUsers,
   maxInvoices: defaults.maxInvoices,
   maxWarehouses: defaults.maxWarehouses,
   features: JSON.stringify(defaults.features),
  },
 });

 // همگام‌سازی tenant.plan برای گیت ماژول‌ها و پروفایل
 await db.tenant
  .update({ where: { id: user.tenantId }, data: { plan: MINI_PLAN_ID } })
  .catch(() => { /* best-effort — گیت سهمیه از خود لایسنس می‌خواند */ });

 return {
  licenseId: license.id,
  created: true,
  maxInvoices: defaults.maxInvoices,
 };
}
