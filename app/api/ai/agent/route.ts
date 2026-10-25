// API عامل هوش‌یار — اجرای اکشن‌ها
// هوش — AI Agent Action Execution

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, getAuthContext } from "@/lib/auth";
import type { AgentAction } from "@/lib/ai-agent-parser";
// Task 3-B-۱۰: اجرای اکشن‌ها با همان موتور واقعی ایجنت (lib/ai-actions) —
// قبلاً این مسیر فاکتور با VAT ۹٪ و شمارهٔ INV-* ناسازگار و بدون سند/انبار می‌ساخت.
// FIX(BUG-v38-2): بلاک import دوم (double-paste راند ۱۰) حذف شد — «defined multiple
// times» کل گراف ماژول را می‌شکست و حتی /api/health را ۵۰۰ می‌کرد.
import {
  createInvoiceAction,
  addCustomerAction,
  createExpenseAction,
} from "@/lib/ai-actions";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/ai/agent
 * اجرای یک اکشن عامل هوش‌یار
 * بدنه: { action: AgentAction }
 */
export async function POST(req: NextRequest) {
 try {
 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 // Rate limit: 30 requests/minute
 if (!rateLimit(`agent:${ip}`, 30, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف درخواست پر شده است. لطفاً کمی بعد تلاش کنید." },
 { status: 429 }
 );
 }

 const body = await req.json();
 const { action } = body as { action: AgentAction };

 if (!action ||!action.type) {
 return NextResponse.json(
 { success: false, error: "اکشن الزامی است" },
 { status: 400 }
 );
 }

 // احراز هویت — برای اکشن‌های دیتابیس
 const ctx = await getAuthContext(req);
 const tenantId = ctx?.tenantId;

 switch (action.type) {
 case "CREATE_INVOICE": {
 if (!tenantId) {
 return NextResponse.json(
 { success: false, error: "برای ایجاد فاکتور ابتدا وارد شوید" },
 { status: 401 }
 );
 }
 if (!action.partyName) {
 return NextResponse.json(
 { success: false, error: "طرف‌حساب الزامی است" },
 { status: 400 }
 );
 }

 // Task 3-B-۱۰: همان موتور فاکتور ایجنت — VAT قانونی ۱۰٪، شماره‌گذاری
 // استاندارد (۱۴۰۵-۰۰۰NNN)، تطبیق کالا و اتصال سند/انبار خودکار.
 const outcome = await createInvoiceAction(
 tenantId,
 ctx?.userId,
 {
 type: "SALE",
 partyName: action.partyName,
 items: (action.items || []).map((it) => ({
 name: it.name,
 quantity: 1,
 unitPrice: it.amount,
 })),
 },
 req
 );

 if (!outcome.ok) {
 return NextResponse.json(
 { success: false, error: outcome.error || "ثبت فاکتور انجام نشد" },
 { status: outcome.status ?? 400 }
 );
 }
 const d = (outcome.data ?? {}) as Record<string, unknown>;

 return NextResponse.json({
 success: true,
 action: "CREATE_INVOICE",
 data: {
 invoiceId: d.invoiceId,
 number: d.number,
 partyName: action.partyName,
 itemCount: d.itemCount ?? (action.items || []).length,
 subtotal: d.subtotalToman,
 tax: d.taxToman,
 total: d.totalToman,
 url: d.url,
 },
 });
 }

 case "CREATE_PARTY": {
 if (!tenantId) {
 return NextResponse.json(
 { success: false, error: "برای ایجاد طرف‌حساب ابتدا وارد شوید" },
 { status: 401 }
 );
 }

 if (!action.name) {
 return NextResponse.json(
 { success: false, error: "نام طرف‌حساب الزامی است" },
 { status: 400 }
 );
 }

 // Task 3-B-۱۰: همان موتور ایجنت (ضد تکرار + کد استاندارد + audit)
 const typeMap: Record<string, string> = {
 customer: "CUSTOMER",
 supplier: "SUPPLIER",
 both: "BOTH",
 };
 const outcome = await addCustomerAction(
 tenantId,
 ctx?.userId,
 { name: action.name, type: typeMap[action.partyType] || "BOTH" },
 req
 );

 if (!outcome.ok) {
 return NextResponse.json(
 { success: false, error: outcome.error || "ثبت طرف‌حساب انجام نشد" },
 { status: outcome.status ?? 400 }
 );
 }
 const pd = (outcome.data ?? {}) as Record<string, unknown>;

 return NextResponse.json({
 success: true,
 action: "CREATE_PARTY",
 data: { partyId: pd.partyId, name: pd.name ?? action.name, code: pd.code, existing: pd.existing ?? false },
 });
 }

 case "CREATE_EXPENSE": {
 if (!tenantId) {
 return NextResponse.json(
 { success: false, error: "برای ثبت هزینه ابتدا وارد شوید" },
 { status: 401 }
 );
 }

 // Task 3-B-۱۰: همان موتور ایجنت (اعتبارسنجی مبلغ + دستهٔ استاندارد + audit)
 const outcome = await createExpenseAction(
 tenantId,
 ctx?.userId,
 {
 amount: action.amount || 0,
 description: action.description || "هزینه ثبت‌شده توسط هوش‌یار",
 category: action.category || "OTHER",
 },
 req
 );

 if (!outcome.ok) {
 return NextResponse.json(
 { success: false, error: outcome.error || "ثبت هزینه انجام نشد" },
 { status: outcome.status ?? 400 }
 );
 }
 const ed = (outcome.data ?? {}) as Record<string, unknown>;

 return NextResponse.json({
 success: true,
 action: "CREATE_EXPENSE",
 data: { expenseId: ed.expenseId, amount: ed.amountToman ?? action.amount, category: ed.category ?? action.category },
 });
 }

 case "SEARCH_PARTY": {
 if (!tenantId) {
 return NextResponse.json(
 { success: false, error: "برای جستجو ابتدا وارد شوید" },
 { status: 401 }
 );
 }

 const results = await db.party.findMany({
 where: {
 tenantId,
 deletedAt: null,
 OR: [
 { name: { contains: action.query } },
 { code: { contains: action.query } },
 { mobile: { contains: action.query } },
 { nationalId: { contains: action.query } },
 ],
 },
 take: 10,
 orderBy: { name: "asc" },
 select: { id: true, name: true, code: true, type: true, mobile: true },
 });

 return NextResponse.json({
 success: true,
 action: "SEARCH_PARTY",
 data: { results, count: results.length },
 });
 }

 case "CALCULATE_TAX": {
 const amount = action.amount;
 let result: Record<string, unknown>;

 if (action.taxType === "VAT") {
 // Task 3-B-۱۰: نرخ قانونی ۱۴۰۴+ = ۱۰٪ (قبلاً ۹٪ بود — ناسازگار با فاکتور)
 const vat = Math.round(amount * 0.1);
 result = { amount, vatRate: "10%", vat, totalWithVat: amount + vat };
 } else {
 // مالیات بر درآمد (ساده)
 const incomeTax = calculateIncomeTax(amount);
 result = { amount, incomeTax, effectiveRate: `${((incomeTax / amount) * 100).toFixed(1)}%` };
 }

 return NextResponse.json({
 success: true,
 action: "CALCULATE_TAX",
 data: result,
 });
 }

 case "CALCULATE_PAYROLL": {
 const baseSalary = action.baseSalary;
 const deductions = action.deductions;

 // محاسبه ساده حقوق
 const insuranceEmployee = Math.round(baseSalary * 0.07);
 const insuranceEmployer = Math.round(baseSalary * 0.23);
 const taxableIncome = baseSalary - insuranceEmployee - deductions;
 const incomeTax = calculateIncomeTax(taxableIncome > 0? taxableIncome: 0);
 const netSalary = baseSalary - insuranceEmployee - incomeTax - deductions;

 return NextResponse.json({
 success: true,
 action: "CALCULATE_PAYROLL",
 data: {
 baseSalary,
 insuranceEmployee,
 insuranceEmployer,
 incomeTax,
 otherDeductions: deductions,
 netSalary,
 },
 });
 }

 case "NAVIGATE": {
 // ناوبری فقط در سمت کلاینت اجرا می‌شود
 return NextResponse.json({
 success: true,
 action: "NAVIGATE",
 data: { path: action.path, label: action.label },
 });
 }

 default:
 return NextResponse.json(
 { success: false, error: `نوع اکشن پشتیبانی نمی‌شود` },
 { status: 400 }
 );
 }
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("AI Agent error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در اجرای اکشن. لطفاً دوباره تلاش کنید." },
 { status: 500 }
 );
 }
}

/**
 * محاسبه مالیات بر درآمد ساده (پله‌ای — سال ۱۴۰۳)
 * ورودی: درآمد مشمول مالیات (تومان/سال)
 */
function calculateIncomeTax(income: number): number {
 if (income <= 0) return 0;

 // پله‌های مالیات بر درآمد سالانه (مقادیر تقریبی — تومان)
 const brackets = [
 { limit: 30_000_000, rate: 0 }, // معاف تا ۳۰ میلیون
 { limit: 100_000_000, rate: 0.05 }, // ۵٪ تا ۱۰۰ میلیون
 { limit: 250_000_000, rate: 0.10 }, // ۱۰٪ تا ۲۵۰ میلیون
 { limit: 500_000_000, rate: 0.15 }, // ۱۵٪ تا ۵۰۰ میلیون
 { limit: 1_000_000_000, rate: 0.20 }, // ۲۰٪ تا ۱ میلیارد
 { limit: Infinity, rate: 0.25 }, // ۲۵٪ بیشتر از ۱ میلیارد
 ];

 let tax = 0;
 let remaining = income;
 let prevLimit = 0;

 for (const bracket of brackets) {
 if (remaining <= 0) break;
 const taxableInBracket = Math.min(remaining, bracket.limit - prevLimit);
 tax += taxableInBracket * bracket.rate;
 remaining -= taxableInBracket;
 prevLimit = bracket.limit;
 }

 return Math.round(tax);
}
