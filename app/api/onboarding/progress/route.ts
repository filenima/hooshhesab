import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/platform-auth";

export const runtime = "nodejs";

/**
 * ============ /api/onboarding/progress (R13-2-a) ============
 *
 * پیشرفت واقعی راه‌اندازی کسب‌وکار — برای «ویزارد راه‌اندازی» (SetupWizard).
 * برخلاف تور joyride (معرفی محیط)، این API می‌گوید کاربر در مسیر راه‌اندازی
 * واقعاً کجاست: کالا ثبت کرده؟ طرف‌حساب دارد؟ فاکتور زده؟
 *
 * - Bearer auth الزامی (همان الگوی /api/notifications — payload.type === "user")
 * - شمارش‌ها فقط رکوردهای زنده (deletedAt: null) را می‌شمارند
 * - گام ۵ (explore) فقط سمت کلاینت (localStorage) قابل تیک‌خوردن است؛
 *   سرور همیشه done: false برمی‌گرداند
 * - completionPercent بر مبنای ۴ گام قابل‌سنجش دیتابیسی محاسبه می‌شود
 *   (۰ تا ۱۰۰)؛ گام explore درصد سرور را تغییر نمی‌دهد تا دکمهٔ شناور
 *   «راه‌اندازی — X٪» تا پایان واقعی کارها (کالا/طرف‌حساب/فاکتور) دیده شود
 */
export async function GET(req: NextRequest) {
 try {
 const authHeader = req.headers.get("authorization");
 if (!authHeader?.startsWith("Bearer ")) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const payload = verifyToken(authHeader.substring(7));
 if (!payload || payload.type !== "user") {
 return NextResponse.json(
 { success: false, error: "توکن نامعتبر" },
 { status: 401 }
 );
 }

 const userId = payload.id as string;
 const user = await db.user.findUnique({
 where: { id: userId },
 select: {
 id: true,
 tenantId: true,
 name: true,
 family: true,
 company: true,
 isTrial: true,
 trialEndsAt: true,
 deletedAt: true,
 },
 });
 if (!user || user.deletedAt) {
 return NextResponse.json(
 { success: false, error: "کاربر یافت نشد" },
 { status: 404 }
 );
 }

 const tenantId = user.tenantId;
 const [tenant, productsCount, partiesCount, invoicesCount, warehouseCount] =
 await Promise.all([
 db.tenant.findUnique({
 where: { id: tenantId },
 select: { id: true, name: true, status: true },
 }),
 db.product.count({ where: { tenantId, deletedAt: null } }),
 db.party.count({ where: { tenantId, deletedAt: null } }),
 db.invoice.count({ where: { tenantId, deletedAt: null } }),
 db.warehouse.count({ where: { tenantId } }),
 ]);

 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "سازمان یافت نشد" },
 { status: 404 }
 );
 }

 // گام ۱ — اطلاعات کسب‌وکار: وقتی done است که نام شرکت روی پروفایل
 // کاربر ثبت شده باشد (نام tenant به‌تنهایی کافی نیست — موقع ثبت‌نام
 // همیشه یک tenant با نام پیش‌فرض ساخته می‌شود)
 const hasCompanyInfo = (user.company ?? "").trim().length > 0;
 const hasWarehouse = warehouseCount > 0;

 const steps: { id: string; label: string; done: boolean }[] = [
 { id: "company-info", label: "ثبت اطلاعات کسب‌وکار", done: hasCompanyInfo },
 { id: "inventory", label: "ثبت کالا و موجودی انبار", done: productsCount > 0 },
 { id: "customers", label: "ثبت مشتری‌ها و فروشندگان", done: partiesCount > 0 },
 { id: "first-invoice", label: "صدور اولین فاکتور", done: invoicesCount > 0 },
 // گام ۵ — کاوش محیط: فقط سمت کلاینت (localStorage) قابل تکمیل است
 { id: "explore", label: "آشنایی با محیط برنامه", done: false },
 ];

 // درصد پیشرفت بر مبنای ۴ گام قابل‌سنجش (هر گام ۲۵٪)
 const measurable = steps.filter((s) => s.id !== "explore");
 const doneCount = measurable.filter((s) => s.done).length;
 const completionPercent = Math.round((doneCount / measurable.length) * 100);

 return NextResponse.json({
 success: true,
 data: {
 tenantName: tenant.name,
 userName: [user.name, user.family].filter(Boolean).join(" ").trim() || user.name,
 companyName: user.company ?? null,
 productsCount,
 partiesCount,
 invoicesCount,
 hasWarehouse,
 hasCompanyInfo,
 isTrial: user.isTrial,
 trialEndsAt: user.trialEndsAt ? user.trialEndsAt.toISOString() : null,
 steps,
 },
 completionPercent,
 });
 } catch (error) {
 console.error("Onboarding progress error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت پیشرفت راه‌اندازی" },
 { status: 500 }
 );
 }
}
