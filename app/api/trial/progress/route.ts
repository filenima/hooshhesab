import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { effectiveIsTrial, trialDaysRemaining } from "@/lib/license-trial";
import { TRIAL_DAYS } from "@/lib/plans";
import { toPersianDigits } from "@/lib/persian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// GET /api/trial/progress — «گام‌های طلایی تا ارزش کامل» (v35.1)
// ============================================================
// پیشنهاد شمارهٔ ۱ سند روانشناسی فروش (پیشنهادهای-ارتقا-v35.md):
// نشان پیشرفت «آخرین قدم تا ارتقا» (Goal Gradient + Loss Aversion).
//
// کارت پیشرفتِ تریال از «رخدادهای واقعی DB» ساخته می‌شود (نه سلیقه‌ای):
//   ۱. اولین فاکتور ثبت شد؟        → Invoice (tenant)
//   ۲. مشتری/طرف‌حساب ثبت شد؟      → Party (tenant)
//   ۳. کالا در انبار ثبت شد؟       → Product (tenant)
//   ۴. هزینه ثبت شد؟              → ExpenseEntry (tenant)
//   ۵. با هوش‌یار گفتگو کرد؟       → AIMessage (role=USER از مکالمات tenant)
//
// خروجی همچنین «اثبات ارزش ریالی» (پیشنهاد ۳) را حمل می‌کند:
// دقیقه‌های صرفه‌جویی‌شدهٔ تخمینی از شمارش واقعی رخدادها.
// ============================================================================

interface ProgressStep {
 id: string;
 title: string;
 description: string;
 /** مسیر ماژول برای انجام گام (navigate رویداد app-shell) */
 module: string;
 done: boolean;
 /** ترتیب اهمیت برای مرتب‌سازی نمایش */
 weight: number;
}

export async function GET(req: NextRequest) {
 try {
 const auth = await getAuthContext(req);
 if (!auth) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }
 const { tenantId, userId } = auth;

 // کاربر + لایسنس فعال (برای تشخیص تریالِ مؤثر — همان منطق /api/auth/me)
 const user = await db.user.findUnique({
 where: { id: userId },
 select: {
 isTrial: true,
 trialEndsAt: true,
 createdAt: true,
 },
 });
 const activeLicense = await db.license.findFirst({
 where: { tenantId, status: "ACTIVE" },
 orderBy: { endDate: "desc" },
 select: { source: true, endDate: true },
 });

 const isTrial =
 !!user && effectiveIsTrial(user, activeLicense);

 if (!isTrial || !user) {
 // کاربر تریال نیست — کارت نمایش داده نمی‌شود (204 سبک به‌جای خطا)
 return NextResponse.json({
 success: true,
 data: { isTrial: false, showCard: false },
 });
 }

 const daysRemaining = trialDaysRemaining(user) ?? 0;

 // ─── شمارش رخدادهای واقعی (همه در یک Promise.all — کوئری‌های count سبک) ───
 const [invoiceCount, partyCount, productCount, expenseCount, aiUserMsgCount] =
 await Promise.all([
 db.invoice.count({ where: { tenantId, type: { in: ["SALE", "PURCHASE"] } } }),
 db.party.count({ where: { tenantId } }),
 db.product.count({ where: { tenantId } }),
 db.expenseEntry.count({ where: { tenantId } }),
 db.aIMessage.count({
 where: {
 role: "USER",
 conversation: { tenantId },
 },
 }),
 ]);

 const steps: ProgressStep[] = [
 {
 id: "first-invoice",
 title: "اولین فاکتور را ثبت کنید",
 description: "فاکتور فروش یا خرید — همه‌چیز خودکار در انبار، خزانه و گزارش ثبت می‌شود.",
 module: "quick-invoice",
 done: invoiceCount > 0,
 weight: 1,
 },
 {
 id: "first-party",
 title: "مشتری خود را بسازید",
 description: "طرف‌حساب مشتری/تأمین‌کننده برای پیگیری طلب و بدهی و.crm",
 module: "crm",
 done: partyCount > 0,
 weight: 2,
 },
 {
 id: "first-product",
 title: "کالای خود را به انبار اضافه کنید",
 description: "کالا با قیمت و موجودی — کاردکس و هشدار اتمام موجودی فعال می‌شود.",
 module: "inventory",
 done: productCount > 0,
 weight: 3,
 },
 {
 id: "first-expense",
 title: "یک هزینه واقعی ثبت کنید",
 description: "هزینه‌های جاری — سود ماهانهٔ دقیق و گزارش پایان روز شکل می‌گیرد.",
 module: "quick-expense",
 done: expenseCount > 0,
 weight: 4,
 },
 {
 id: "first-ai",
 title: "با هوش‌یار حرف بزنید",
 description: "دستیار هوشمند — دستور بدهید یا سوال مالیاتی بپرسید؛ بدون تایپ هم (صدا) کار می‌کند.",
 module: "ai",
 done: aiUserMsgCount > 0,
 weight: 5,
 },
 ];

 const doneCount = steps.filter((s) => s.done).length;
 const progressPercent = Math.round((doneCount / steps.length) * 100);

 // ─── اثبات ارزش (پیشنهاد ۳ سند): دقیقه‌های صرفه‌جویی تخمینی ───
 // نرخ‌های محافظه‌کارانه بر اساس زمان ثبت دستی هر سند در نرم‌افزار سنتی:
 // فاکتور ~۴ دقیقه، مشتری ~۲، کالا ~۲، هزینه ~۳، پیام دستیار ~۱.۵ دقیقه
 const minutesSaved = Math.min(
 9_999,
 invoiceCount * 4 + partyCount * 2 + productCount * 2 + expenseCount * 3 + aiUserMsgCount * 1.5
 );

 // ─── پیشنهاد گام بعدی (اولین گام ناتمام با کمترین وزن) ───
 const nextStep = steps.find((s) => !s.done) ?? null;

 return NextResponse.json({
 success: true,
 data: {
 isTrial: true,
 showCard: true,
 daysRemaining: Math.max(0, daysRemaining),
 daysTotal: TRIAL_DAYS,
 progressPercent,
 doneCount,
 totalSteps: steps.length,
 steps,
 nextStep,
 minutesSaved: Math.round(minutesSaved),
 counts: {
 invoices: invoiceCount,
 parties: partyCount,
 products: productCount,
 expenses: expenseCount,
 aiMessages: aiUserMsgCount,
 },
 },
 });
 } catch (error) {
 console.error("trial/progress error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت پیشرفت تریال" },
 { status: 500 }
 );
 }
}

// helper کوچک برای استفادهٔ احتمالی آینده (بدون‌ استفادهٔ فعلی در فایل)
void toPersianDigits;
