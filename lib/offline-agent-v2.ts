// ============================================================================
// lib/offline-agent-v2.ts — موتور دستیار آفلاین هوش، نسخهٔ ۱۰× (Task v33-d)
// ----------------------------------------------------------------------------
// چیست؟
// لایهٔ دومِ موتور آفلاین (کنار lib/offline-agent.ts که دستورات اجرایی
// پیشین را داشت). این موتور یک «رجیستری ابزار تایپ‌دار» است:
// هر ابزار = { id, patterns[], run(tenantId, text) → { text, action?, followUps? } }
// و روی دادهٔ واقعی tenant با Prisma اجرا می‌شود — ۱۰۰٪ آفلاین، بدون LLM.
//
// خط لولهٔ runOfflineAssistantV2 (ترتیب اولویت):
//   1) smalltalk (سلام/تشکر/هویت/قابلیت‌ها)
//   2) ابزارهای فرمان (action): فاکتور جدید/کالای جدید/مشتری جدید/ناوبری/گزارش
//      — فقط وقتی آیتم/مبلغ مشخص نیستند (آیتم‌دارها به موتور اجرایی قبلی می‌روند)
//   2.۵) سوال «چطور انجامش بدهم؟» (فعل اول‌شخص) — نه فرمان؛ ابزار اجرایی نگیرد
//   3) ماشین‌حساب (درصد/فرمول/عبارت ریاضی با اعداد فارسی — eval ایمن)
//   ۳.۵) Task 3-B — اولویت جهش بر خواندن: متن از parser v1 (offlineParseIntent)
//      عبور می‌کند؛ اگر دستور ثبت/تغییر بود همان TOOL_CALL سنتزی برگردانده می‌شود
//      (agent-chat آن را وارد حلقه واقعی ابزار می‌کند؛ /api/ai/chat در fallback
//      همان‌جا اجرا می‌کند) — قبلاً «موجودی نان تست رو ۵ تا کن» به‌جای adjust_stock
//      کارت اطلاعات کالا برمی‌گشت.
//   4) ابزارهای داده (۲۵+ ابزار: شمارش/موجودی کالا، فروش، بهترین مشتری، مانده
//      طرف‌حساب، نرخ ارز/طلا، سود، ارزش افزوده + Task 3-B: شاخص‌ها، مطالبات/بدهی
//      با aging، جریان نقدی، بودجه، کیف پول، خزانه/چک، مودیان، پرفروش‌ها، هزینه‌ها،
//      فاکتورهای معوق، روند سود، ارزش انبار، کم‌حرکت‌ها، آمار فاکتور، بدهکاران،
//      تعداد طرف‌حساب‌ها)
//   5) دانش‌نامهٔ حسابداری (lib/ai/knowledge-fa.ts — ۵۰ مدخل تخصصی)
//   6) null → فراخوان به fallback هوشمند (پیشنهاد data-aware / اجرای مستقیم جهش)
//
// سازگاری: خروجی { text, action?, followUps? } — action توسط UI به
// hoshhesab:navigate { module, action } تبدیل می‌شود (app-shell) و
// برای فاکتور، رویداد پیش‌پر کردن فرم (hoshhesab:invoice-form-prefill).
//
// قواعد مالک: بدون ایموجی، ارقام فارسی، مبالغ تومان (DB ریال ÷ ۱۰).
// ============================================================================

import { db } from "@/lib/db";
import {
  toPersianDigits,
  formatNumber,
  toJalali,
  getCurrentJalaliYear,
  getCurrentJalaliMonth,
  jalaliToGregorian,
  JALALI_MONTHS,
} from "@/lib/persian";
import { matchKnowledgeFa, normalizeFaText, KNOWLEDGE_FA_COUNT } from "@/lib/ai/knowledge-fa";
import {
  offlineParseIntent,
  formatOfflineReply,
  type OfflineHelpCard,
  type OfflineIntent,
  type OfflineToolCall,
} from "@/lib/offline-agent";
// Task 3-B: اجرای مستقیم دستورهای ثبت در fallback (/api/ai/chat بدون حلقه ابزار)
import type { NextRequest } from "next/server";
import {
  createInvoiceAction,
  createCreditInvoiceAction,
  reserveInvoiceAction,
  editInvoiceAction,
  createExpenseAction,
  addCustomerAction,
  addProductAction,
  recordPaymentAction,
  recordPartyPaymentAction,
  adjustStockAction,
  updateProductPriceAction,
  setProductDiscountAction,
  createReminderAction,
  voidInvoiceDraftAction,
  lookupInvoiceByNumber,
} from "@/lib/ai-actions";

// ============ انواع ============

export type AssistantActionType =
  | "navigate"
  | "open-module"
  | "open-report"
  | "new-invoice"
  | "new-product"
  | "new-party";

/** اکشن اجرایی که UI دکمه‌اش را می‌سازد و با رویدادهای اپ اجرا می‌کند */
export interface AssistantAppAction {
  type: AssistantActionType;
  /** شناسهٔ ماژول مقصد (سایدبار) */
  module: string;
  /** اکشن درون-ماژولی: new-invoice | new-product | new-party (hoshhesab:module-action) */
  eventAction?: string;
  /** متن دکمهٔ اجرا در UI */
  label: string;
  /** پیش‌پر کردن فرم فاکتور با نام طرف‌حساب */
  partyName?: string;
  invoiceType?: "SALE" | "PURCHASE";
}

/** خروجی موتور v2 — engine همیشه "local" است (فراخوان اضافه می‌کند) */
export interface OfflineV2Result {
  /** شناسهٔ تطبیق: "tool:xxx" یا "knowledge:xxx" یا "smalltalk:xxx" یا "mutation:xxx" */
  matched: string;
  /** پاسخ مارک‌داون-لایت فارسی — برای mutation:xxx خالی است (متن پس از اجرای ابزار ساخته می‌شود) */
  text: string;
  /** Task 3-B — دستور اجرایی تشخیص‌داده‌شده: وارد حلقه ابزار agent-chat یا اجرای مستقیم fallback می‌شود */
  toolCall?: OfflineToolCall;
  /** Task 3-B — نیت کامل parser v1 (primary/secondary/help) برای استفاده فراخوان */
  intent?: OfflineIntent;
  /** اکشن اجرایی اختیاری (دکمه در UI) */
  action?: AssistantAppAction;
  /** ۲ تا ۳ پیشنهاد پیگیری بعد از پاسخ */
  followUps?: string[];
}

// ============ کمکی‌ها ============

/** ریال → تومان (DB مبالغ ریالی است) */
function rialToToman(v: bigint | number | null | undefined): number {
  const n = typeof v === "bigint" ? Number(v) : Number(v ?? 0);
  return Math.floor(n / 10);
}

function fmtToman(n: number): string {
  return `${toPersianDigits(formatNumber(Math.round(n)))} تومان`;
}

/** بازهٔ شمسی دوره → {start?, end?, label} — end انحصاری */
function periodRange(period: string): { start?: Date; end?: Date; label: string } {
  const now = new Date();
  const jy = getCurrentJalaliYear(now);
  const jm = getCurrentJalaliMonth(now);
  const mk = (y: number, m: number, d: number): Date => {
    const [gy, gm, gd] = jalaliToGregorian(y, m, d);
    return new Date(gy, gm - 1, gd);
  };
  switch (period) {
    case "last_month": {
      const py = jm === 1 ? jy - 1 : jy;
      const pm = jm === 1 ? 12 : jm - 1;
      const nm = pm === 12 ? 1 : pm + 1;
      const ny = pm === 12 ? py + 1 : py;
      return { start: mk(py, pm, 1), end: mk(ny, nm, 1), label: `ماه ${JALALI_MONTHS[pm - 1]} ${toPersianDigits(py)}` };
    }
    case "this_year":
      return { start: mk(jy, 1, 1), end: mk(jy + 1, 1, 1), label: `سال ${toPersianDigits(jy)}` };
    case "all":
      return { label: "کل دوره" };
    case "this_month":
    default:
      return {
        start: mk(jy, jm, 1),
        end: mk(jm === 12 ? jy + 1 : jy, jm === 12 ? 1 : jm + 1, 1),
        label: `ماه ${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`,
      };
  }
}

/** استخراج دوره از پیام — this_month پیش‌فرض */
function extractPeriod(t: string): string {
  if (/(ماه قبل|ماه گذشته|ماه پیش)/.test(t)) return "last_month";
  if (/(امسال|این سال|سال جاری|سال)/.test(t) && !/ماه/.test(t)) return "this_year";
  if (/(همیشه|کل دوره|از همیشه|تاریخچه|کل)/.test(t)) return "all";
  return "this_month";
}

/** آیا پیام سیگنال «آیتم/مبلغ فاکتور» دارد؟ (برای تفکیک فرمان-UI از ثبت واقعی) */
function hasItemSignals(t: string): boolean {
  return /\d+\s*(?:تا|عدد|بسته|کیلو|متر|لیتر|لین|گرم|کارتن|جین)/.test(t) || /(قیمت|تومان|تومن|مبلغ)\s*\d/.test(t);
}

/** آیا پیام «سوال مفهومی» است (دانش‌نامه) نه داده‌ای؟ */
function isConceptualQuestion(t: string): boolean {
  return /(چیه|چیست|یعنی|چطور محاسبه|چگونه محاسبه|تعریف|فرمول|تفاوت|روش|مفهوم|چطور کار|آموزش|توضیح بده)/.test(t);
}

/** Task 3-B — سوال «چطور انجامش بدهم؟» (نشانه پرسش + فعل اول‌شخص): نه فرمان.
 *  مثال: «چطور فاکتور بزنم؟» — قبلاً به‌جای راهنما، فرمان ثبت خالی می‌شد. */
export function isHowDoIQuestion(t: string): boolean {
  const how = /(چطور|چگونه|کجا|کجاست|راهنمای|راهنما|آموزش|نحوه|می\s*خواهم|می\s*خوام|می\s*تونم|می\s*توانم|برم|بدونم|بپرسم)/.test(t);
  const firstPerson =
    /(بزنم|بسازم|ثبت\s*کنم|اضافه\s*کنم|درج\s*کنم|ذخیره\s*کنم|بذارم|بزارم|کنم\b|صادر\s*کنم|بنویسم|بگیرم)/.test(t);
  return how && firstPerson;
}

/** نام کالا بعد از «موجودی/قیمت (کالای) ...» */
function extractProductName(t: string): string | null {
  // Task 3-B: «موجودی X رو/را …» — نام تا «رو/را» تا وگرده داخل نام نیفتد
  const mr = t.match(/(?:موجودی|قیمت|سهم)\s*(?:کالای|کالا|محصول|جنس)?\s+([آ-ی ءؤئa-z0-9 ]{2,40}?)\s*(?:رو|را)(?:\s|$)/);
  if (mr?.[1]) {
    const name = mr[1].trim();
    if (name.length >= 2 && !/^(انبار|کل|همه|شما|من|چقدر|چند)$/.test(name)) return name;
  }
  const m = t.match(
    /(?:موجودی|قیمت|سهم)\s*(?:کالای|کالا|محصول|جنس)?\s+([آ-ی ءؤئa-z0-9]{2,40}?)(?=\s*(?:چنده|چند است|چقدر|چیه|است|هست|شد|بگو|نشان|پیدا|می.?شه|دارم|واقعا|الان|میشه|،|,|$))/
  );
  if (m?.[1]) {
    const name = m[1].trim();
    if (name.length >= 2 && !/^(چقدر|چند|من|ما|کل|همه)$/.test(name)) return name;
  }
  // ترتیب معکوس: «شیر موجودی چنده» / «قیمت شیر رو بگو»
  const m2 = t.match(/^([آ-ی ءؤئa-z0-9]{2,40}?)\s*(?:موجودی|قیمت فروش|قیمت)\s*(?:چنده|چند است|چقدر|بگو)/);
  if (m2?.[1]) {
    const name = m2[1].replace(/^(موجودی|قیمت)\s*/, "").trim();
    if (name.length >= 2) return name;
  }
  // «X رو پیدا کن / X دارم؟»
  const m3 = t.match(/^([آ-ی ءؤئa-z0-9]{2,40}?)\s*(?:رو|را)\s*(?:پیدا|جستجو|سرچ|نشان)/);
  if (m3?.[1]) return m3[1].trim();
  return null;
}

/** نام طرف‌حساب بعد از «بدهی/مانده/طرف حساب ...» یا «... چقدر بدهکاره» */
function extractPartyName(t: string): string | null {
  const m = t.match(
    /(?:بدهی|بدهکار|مانده|طرف حساب|حساب)\s*(?:شده از|از|به نام)?\s*([آ-ی ءؤئa-z0-9]{2,30}?)(?=\s*(?:چنده|چند|چقدر|است|هست|شد|چیست|چیه|بگو|نشان|و|،|,|$))/
  );
  if (m?.[1]) {
    const name = m[1].trim();
    // Task 3-B: پسوندهای ضمیری («هایم/مان/...») اسم نیستند —
    // قبلاً «مطالبات و بدهی‌هایم چقدره؟» طرف‌حساب «هایم» می‌شد!
    if (
      name.length >= 2 &&
      !/^(چقدر|چند|من|ما|کل|علیق)$/.test(name) &&
      !/^(های?م|های?ت|های?ش|هام|هات|هاش|مان|تان|شان|مون|تون|شون)$/.test(name)
    )
      return name;
  }
  const m2 = t.match(/([آ-ی ءؤئa-z0-9]{2,30}?)\s*(?:چقدر|چند)\s*(?:بدهکار|بدهیه|قرض داره|بدهکار است)/);
  if (m2?.[1]) {
    const name = m2[1].replace(/^(بدهی|مانده)\s*/, "").trim();
    if (name.length >= 2) return name;
  }
  return null;
}

/** نرمال‌سازی برای ریاضی: ارقام فارسی→لاتین + واژه‌های عملگر */
function normalizeMath(raw: string): string {
  return String(raw || "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٬،]/g, ",")
    .replace(/بعلاوه|به علاوه|جمع|plus/g, "+")
    .replace(/منهای|منها|منهایِ|minus/g, "-")
    .replace(/ضربدر|ضرب در|در ضرب/g, "*")
    .replace(/تقسیم بر|تقسیم|divide/g, "/")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/٪/g, "%")
    .replace(/\s+/g, " ")
    .trim();
}

/** تبدیل «۲ میلیون/۵۰۰ هزار» به عدد خام — عدد + واحد حروفی */
function applyUnits(expr: string): string {
  return expr.replace(/(\d[\d,]*(?:\.\d+)?)\s*(میلیارد|میلیون|ملیون|هزار)/g, (_all, num: string, unit: string) => {
    let n = Number(num.replace(/,/g, ""));
    if (unit.includes("میلیارد")) n *= 1_000_000_000;
    else if (unit.includes("میلیون") || unit.includes("ملیون")) n *= 1_000_000;
    else if (unit.includes("هزار")) n *= 1_000;
    return String(n);
  });
}

/** ارزیابی امن عبارت ریاضی — فقط ارقام و عملگرهای مجاز */
function safeEval(expr: string): number | null {
  const clean = expr.replace(/,/g, "").replace(/\s+/g, "");
  if (!clean || !/^[\d+\-*/().]+$/.test(clean)) return null;
  if (!/[+\-*/]/.test(clean)) return null;
  const nums = clean.match(/\d+/g);
  if (!nums || nums.length < 2) return null;
  try {
    // فقط پس از whitelist بالا — رشته فقط ارقام/عملگر است
    const value = Function(`"use strict"; return (${clean});`)() as unknown;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// ============ ۳) ماشین‌حساب آفلاین ============

/** «۱۲ درصد ۴۵۰۰۰۰ چنده؟» / «سود ۳۰ درصد روی ۲ میلیون» / «۴۵۰۰۰۰ بعلاوه ۱۲۰۰۰» */
export function tryMathQuestion(raw: string): { text: string; followUps: string[] } | null {
  const t = normalizeMath(raw);
  if (!t) return null;

  // ─── الگوی ۱: «X درصد (از) Y» (با واحد حروفی: میلیون/هزار/...) ───
  const m1 = t.match(/(\d+(?:\.\d+)?)\s*(?:درصد|%)\s*(?:از\s*)?(\d[\d,]*(?:\.\d+)?\s*(?:میلیارد|میلیون|ملیون|هزار)?)/);
  if (m1) {
    const pct = Number(m1[1]);
    const withUnits = applyUnits(`${m1[2]}`);
    const base = Number(withUnits.replace(/,/g, ""));
    if (Number.isFinite(base) && base > 0 && pct >= 0 && pct <= 1000) {
      const part = (base * pct) / 100;
      const text =
        `**محاسبه:** ${toPersianDigits(formatNumber(pct))} درصد از ${toPersianDigits(formatNumber(base))} = ` +
        `**${fmtToman(part)}**\n\n` +
        `- ${toPersianDigits(formatNumber(base))} + ${toPersianDigits(formatNumber(pct))}٪ = ${fmtToman(base + part)}\n` +
        `- ${toPersianDigits(formatNumber(base))} − ${toPersianDigits(formatNumber(pct))}٪ = ${fmtToman(base - part)}`;
      return {
        text,
        followUps: ["۱۰ درصد این مبلغ چنده؟", "نقطه سربه سر یعنی چی؟", "محاسبه مالیات ارزش افزوده چطوره؟"],
      };
    }
  }

  // ─── الگوی ۲: «سود/تخفیف/مالیات/کارمزد X درصد روی Y» (با واحد حروفی) ───
  const m2 = t.match(/(سود|تخفیف|مالیات|کارمزد|زیان)\s*(\d+(?:\.\d+)?)\s*(?:درصد|%)\s*(?:روی|از)\s*(\d[\d,]*(?:\.\d+)?\s*(?:میلیارد|میلیون|ملیون|هزار)?)/);
  if (m2) {
    const kind = m2[1];
    const pct = Number(m2[2]);
    const base = Number(applyUnits(m2[3]).replace(/,/g, ""));
    if (Number.isFinite(base) && base > 0 && pct > 0 && pct <= 100) {
      const part = (base * pct) / 100;
      const isDiscount = kind === "تخفیف" || kind === "زیان";
      const final = isDiscount ? base - part : base + part;
      const text =
        `**${kind} ${toPersianDigits(formatNumber(pct))}٪ روی ${fmtToman(base)}:**\n\n` +
        `- مبلغ ${kind} = ${fmtToman(part)}\n` +
        `- مبلغ نهایی = **${fmtToman(final)}**`;
      return {
        text,
        followUps: [`حاشیه سود ${toPersianDigits(formatNumber(pct))} درصد خوبه؟`, "سود ناخالص یعنی چی؟", "گزارش سود این ماه"],
      };
    }
  }

  // ─── الگوی ۳: عبارت ریاضی (۴۵۰۰۰ + 12000 / دو عدد با عملگر) ───
  const unitApplied = applyUnits(t);
  const exprMatch = unitApplied.match(/(\d[\d,]*(?:\.\d+)?(?:\s*(?:\*|\/|\+|-)\s*\d[\d,]*(?:\.\d+)?)+)/);
  if (exprMatch) {
    const value = safeEval(exprMatch[1]);
    if (value !== null) {
      const pretty = toPersianDigits(exprMatch[1].replace(/\*/g, "×").replace(/\//g, "÷").replace(/\s+/g, " "));
      return {
        text: `**نتیجه:** ${pretty} = **${fmtToman(value)}**`,
        followUps: ["۱۲ درصد این عدد چنده؟", "ماشین حساب مالیات ارزش افزوده", "نقطه سربه سر یعنی چی؟"],
      };
    }
  }
  return null;
}

// ============ ۲) ابزارهای فرمان (اکشن UI) ============

interface CommandTool {
  id: string;
  /** true اگر تطبیق کرد */
  match: (t: string) => AssistantAppAction | null;
}

const MODULE_KEYWORDS: Array<{ re: RegExp; module: string; fa: string }> = [
  { re: /فاکتور|صورتحساب|خرید و فروش/, module: "invoices", fa: "خرید و فروش (فاکتورها)" },
  { re: /انبار|کاردکس|کالا(?!ی جدید)/, module: "inventory", fa: "انبار و کالا" },
  { re: /مشتری|طرف\s*حساب|crm|تامین\s*کننده|تأمین\s*کننده/, module: "crm", fa: "مشتریان (CRM)" },
  { re: /هزینه|خرج/, module: "expense-tracker", fa: "هزینه و مسافت" },
  { re: /خزانه|بانک|چک|مغایرت/, module: "treasury", fa: "خزانه‌داری و چک" },
  { re: /حقوق|دستمزد|پرسنل|فیش/, module: "payroll", fa: "حقوق و دستمزد" },
  { re: /ارز|دلار|طلا|چند\s*ارزی/, module: "multi-currency", fa: "ارز و چندارزی" },
  { re: /مودیان|صورتحساب الکترونیکی/, module: "modian", fa: "سامانه مودیان" },
  { re: /گزارش\s*ساز|سازنده\s*گزارش|گزارشها|گزارش ها/, module: "reports-builder", fa: "گزارش‌ساز" },
  { re: /داشبورد/, module: "dashboard", fa: "داشبورد" },
  { re: /صندوق\s*فروش|پوز|pos/, module: "pos", fa: "صندوق فروش (POS)" },
  { re: /بودجه/, module: "budget", fa: "بودجه‌ریزی" },
  { re: /کیف\s*پول|پاداش/, module: "wallet", fa: "کیف پول" },
  { re: /یادآور|سررسید/, module: "reminders", fa: "یادآورها" },
  { re: /ایمپورت|درون\s*ریزی|واردات|اکسل/, module: "data-import-export", fa: "واردات و صادرکرد" },
  { re: /مالیات|ارزش\s*افزوده/, module: "tax", fa: "ارزش افزوده و مالیات" },
  { re: /حساب\s*کاربری|تنظیمات|پروفایل/, module: "account", fa: "حساب کاربری و تنظیمات" },
];

const COMMAND_TOOLS: CommandTool[] = [
  {
    id: "cmd:new-invoice",
    match: (t) => {
      if (!/(فاکتور|صورتحساب)/.test(t)) return null;
      // Task 3-B: فعل‌های رایج فارسی — «بزن» رایج‌ترین فعل دستور فاکتور است
      if (!/(بساز|ساخت|ایجاد|صادر\s*کن|صادر کن|صدور|جدید|باز\s*کن|بزن|ثبت|درج|ذخیره|وارد)/.test(t)) return null;
      if (hasItemSignals(t)) return null; // آیتم‌دار → موتور اجرایی قبلی ثبت واقعی می‌کند
      const isPurchase = /(خرید|تامین|تأمین)/.test(t) && !/(فروش|فروشی)/.test(t);
      // نام طرف‌حساب: «فاکتور جدید برای علی»
      const pm = t.match(/(?:برای|به نام|به اسم)\s+([آ-ی ءؤئa-z0-9]{2,30}?)(?=\s*(?:بساز|بزن|ایجاد|ثبت|باز|جدید|کن|صادر|،|,|$))/);
      const partyName = pm?.[1]?.trim() || undefined;
      return {
        type: "new-invoice",
        module: "invoices",
        eventAction: "new-invoice",
        label: isPurchase ? "باز کردن فرم فاکتور خرید" : "باز کردن فرم فاکتور فروش",
        partyName,
        invoiceType: isPurchase ? "PURCHASE" : "SALE",
      };
    },
  },
  {
    id: "cmd:new-product",
    match: (t) => {
      if (!/(کالا|محصول|خدمت)/.test(t)) return null;
      if (!/(جدید|بساز|ساخت|ایجاد|اضافه|بزن|ثبت|درج|ذخیره)/.test(t)) return null;
      if (hasItemSignals(t) || /(قیمت|تومان|تومن|ریال|مبلغ)/.test(t)) return null;
      return {
        type: "new-product",
        module: "inventory",
        eventAction: "new-product",
        label: "باز کردن فرم کالای جدید",
      };
    },
  },
  {
    id: "cmd:new-party",
    match: (t) => {
      if (!/(مشتری|طرف\s*حساب|تامین\s*کننده|تأمین\s*کننده|فروشنده)/.test(t)) return null;
      if (!/(جدید|بساز|ساخت|ایجاد|اضافه|بزن|ثبت|درج)/.test(t)) return null;
      if (/(موبایل|تلفن|شماره|ایمیل|کد اقتصادی)/.test(t)) return null; // مشخصات کامل → ثبت واقعی
      return {
        type: "new-party",
        module: "crm",
        eventAction: "new-party",
        label: "باز کردن فرم مشتری جدید",
      };
    },
  },
  {
    id: "cmd:open-report",
    match: (t) => {
      if (!/(گزارش)/.test(t)) return null;
      if (!/(باز\s*کن|نمایش\s*بده|برو به گزارش|گزارش\s*ساز|سازنده\s*گزارش)/.test(t)) return null;
      return {
        type: "open-report",
        module: "reports-builder",
        label: "باز کردن گزارش‌ساز",
      };
    },
  },
  {
    id: "cmd:navigate",
    match: (t) => {
      if (!/(برو|باز\s*کن|نشان\s*بده|نشون\s*بده|انتقال|می\s*خوام\s*ببینم|می\s*خواهم\s*ببینم|ببینم)/.test(t)) return null;
      // سوال داده‌ای نگیر (موجودی انبار را نشان بده → کوئری است نه ناوبری)
      if (/(موجودی|قیمت|بدهی|مانده|چقدر|چند|فروش\s*چقدر|سود\s*چقدر|ارزش)/.test(t)) return null;
      for (const mk of MODULE_KEYWORDS) {
        if (mk.re.test(t)) {
          return {
            type: "navigate",
            module: mk.module,
            label: `رفتن به ${mk.fa}`,
          };
        }
      }
      return null;
    },
  },
];

// ============ ۴) ابزارهای داده (اجرای Prisma روی دادهٔ واقعی) ============

interface DataToolResult {
  text: string;
  action?: AssistantAppAction;
  followUps?: string[];
}

interface DataTool {
  id: string;
  match: (t: string) => boolean;
  run: (tenantId: string, t: string) => Promise<DataToolResult>;
}

/** وضعیت‌های فاکتورِ قطعی (بدون پیش‌نویس/رزرو/ابطال) */
const FINAL_STATUSES = ["SENT", "PAID", "PARTIAL", "PARTIALLY_PAID", "OVERDUE"];
const OPEN_STATUSES = ["SENT", "PARTIAL", "PARTIALLY_PAID", "OVERDUE"];

/** جستجوی کالا با نام (اول کل نام، بعد واژهٔ اول) */
async function findProducts(tenantId: string, name: string) {
  const full = await db.product.findMany({
    where: { tenantId, name: { contains: name } },
    take: 6,
    orderBy: { name: "asc" },
  });
  if (full.length > 0) return full;
  const firstWord = name.split(/\s+/)[0];
  if (firstWord && firstWord.length >= 2 && firstWord !== name) {
    return db.product.findMany({
      where: { tenantId, name: { contains: firstWord } },
      take: 6,
      orderBy: { name: "asc" },
    });
  }
  return [];
}

const DATA_TOOLS: DataTool[] = [
  // ─── شمارش کالا ───
  {
    id: "data:product-count",
    match: (t) =>
      /(چند\s*(تا\s*)?کالا|تعداد\s*کالا|چند\s*(تا\s*)?محصول|تعداد\s*محصول|چند\s*(تا\s*)?خدمت|تعداد\s*خدمات|چند\s*نوع\s*کالا|تعداد\s*اقلام)/.test(t),
    run: async (tenantId) => {
      const [total, goods, services, withStock] = await Promise.all([
        db.product.count({ where: { tenantId, deletedAt: null } }),
        db.product.count({ where: { tenantId, deletedAt: null, type: "GOODS" } }),
        db.product.count({ where: { tenantId, deletedAt: null, type: "SERVICE" } }),
        db.stockItem.count({ where: { tenantId, quantity: { gt: 0 } } }),
      ]);
      const text =
        `### کالاها و خدمات شما\n\n` +
        `- **کل کالا/خدمات ثبت‌شده:** ${toPersianDigits(total)} مورد\n` +
        `- کالای فیزیکی (کالا): ${toPersianDigits(goods)} مورد\n` +
        `- خدمات: ${toPersianDigits(services)} مورد\n` +
        `- اقلام دارای موجودی مثبت در انبار: ${toPersianDigits(withStock)} ردیف\n\n` +
        (total === 0
          ? "هنوز کالایی ثبت نشده — بگویید «کالای جدید بساز» تا فرم ثبت باز شود، یا از «واردات و صادرکرد» فایل هلو/اکسل را بریزید."
          : "برای جزئیات هر کالا بگویید «موجودی [نام کالا] چنده؟» یا «قیمت [نام کالا] چند؟».");
      return {
        text,
        followUps: ["ارزش انبارم چقدره؟", "کالاهای کم حرکت رو نشون بده", "کالای جدید بساز"],
      };
    },
  },
  // ─── Task 3-B: مطالبات و بدهی‌ها با سن بدهی (aging) ───
  {
    id: "data:receivables-aging",
    match: (t) =>
      /(مطالبات|بدهی[\s\u200c]*های[م‌تشن]*|بدهی\s*و\s*طلب|طلب\s*و\s*بدهی|پرداختنی\s*و\s*دریافتنی|دریافتنی\s*و\s*پرداختنی|سن\s*بدهی|وضعیت\s*طرف\s*حساب‌?ها|چقدر\s*طلب\s*دارم|چقدر\s*بدهی\s*دارم|طلب\s*دارم|بدهی\s*دارم|بدهکار\s*هستم)/.test(t) &&
      !isConceptualQuestion(t),
    run: async (tenantId) => {
      const [sales, purchases] = await Promise.all([
        db.invoice.findMany({
          where: { tenantId, type: "SALE", deletedAt: null, status: { in: OPEN_STATUSES } },
          include: { party: { select: { name: true } } },
          orderBy: { date: "asc" },
          take: 2000,
        }),
        db.invoice.findMany({
          where: { tenantId, type: "PURCHASE", deletedAt: null, status: { in: OPEN_STATUSES } },
          include: { party: { select: { name: true } } },
          orderBy: { date: "asc" },
          take: 2000,
        }),
      ]);
      const now = Date.now();
      const bucketOf = (date: Date): string => {
        const age = Math.floor((now - date.getTime()) / 86_400_000);
        if (age <= 30) return "جاری (۰-۳۰ روز)";
        if (age <= 60) return "۳۱-۶۰ روزه";
        if (age <= 90) return "۶۱-۹۰ روزه";
        return "بیش از ۹۰ روز";
      };
      const agingMap = new Map<string, { receivable: number; payable: number }>();
      const partyMap = new Map<string, { receivable: number; payable: number }>();
      let receivableTotal = 0;
      let payableTotal = 0;
      for (const inv of sales) {
        const remaining = rialToToman(inv.total) - rialToToman(inv.paidAmount);
        if (remaining <= 0) continue;
        receivableTotal += remaining;
        const bucket = bucketOf(inv.date);
        const b = agingMap.get(bucket) ?? { receivable: 0, payable: 0 };
        b.receivable += remaining;
        agingMap.set(bucket, b);
        const name = inv.party?.name || "—";
        const p = partyMap.get(name) ?? { receivable: 0, payable: 0 };
        p.receivable += remaining;
        partyMap.set(name, p);
      }
      for (const inv of purchases) {
        const remaining = rialToToman(inv.total) - rialToToman(inv.paidAmount);
        if (remaining <= 0) continue;
        payableTotal += remaining;
        const bucket = bucketOf(inv.date);
        const b = agingMap.get(bucket) ?? { receivable: 0, payable: 0 };
        b.payable += remaining;
        agingMap.set(bucket, b);
        const name = inv.party?.name || "—";
        const p = partyMap.get(name) ?? { receivable: 0, payable: 0 };
        p.payable += remaining;
        partyMap.set(name, p);
      }
      const bucketOrder = ["جاری (۰-۳۰ روز)", "۳۱-۶۰ روزه", "۶۱-۹۰ روزه", "بیش از ۹۰ روز"];
      const agingLines = bucketOrder
        .filter((b) => agingMap.has(b))
        .map((b) => {
          const v = agingMap.get(b)!;
          return `| ${b} | ${fmtToman(v.receivable)} | ${fmtToman(v.payable)} |`;
        });
      const topParties = Array.from(partyMap.entries())
        .map(([name, v]) => ({ name, net: v.receivable - v.payable, r: v.receivable, p: v.payable }))
        .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
        .slice(0, 5);
      const partyLines = topParties.map(
        (p) => `| ${p.name} | ${fmtToman(p.r)} | ${fmtToman(p.p)} | **${fmtToman(p.net)}** |`
      );
      const text =
        `### مطالبات و بدهی‌ها (با سن بدهی)\n\n` +
        `- **جمع مطالبات (پول مردم دست شما):** ${fmtToman(receivableTotal)}\n` +
        `- **جمع بدهی‌ها (پول شما دست دیگران):** ${fmtToman(payableTotal)}\n` +
        `- **خالص:** ${fmtToman(receivableTotal - payableTotal)}\n\n` +
        (agingLines.length
          ? `**تفکیک سنتی:**\n\n| بازه سن | مطالبات | بدهی |\n| --- | --- | --- |\n${agingLines.join("\n")}\n\n`
          : "") +
        (partyLines.length
          ? `**طرف‌حساب‌های با بیشترین مانده:**\n\n| طرف‌حساب | مانده طلب از او | مانده بدهی به او | خالص |\n| --- | --- | --- | --- |\n${partyLines.join("\n")}\n\n`
          : "") +
        (receivableTotal === 0 && payableTotal === 0
          ? `هیچ فاکتور تسویه‌نشده‌ای ندارید — نه مطالبات باز دارید و نه بدهی باز.\n`
          : `_سن بدهی از تاریخ فاکتور محاسبه می‌شود؛ بازه‌های بالای ۹۰ روز را برای پیگیری جدی جدا کنید._`);
      return {
        text,
        followUps: ["بدهکارترین مشتری‌ها کیان؟", "یادآور سررسید بذار", "گزارش سود این ماه"],
      };
    },
  },
  // ─── Task 3-B: بیشترین بدهکاران ───
  {
    id: "data:top-debtors",
    match: (t) =>
      /(بدهکاران|بدهکارترین|بیشترین\s*بدهی|کی\s*بدهکاره|کی\s*بدهکار\s*هست|بدهکار\s*ها)/.test(t) &&
      !isConceptualQuestion(t),
    run: async (tenantId) => {
      const grouped = await db.invoice.groupBy({
        by: ["partyId"],
        where: { tenantId, type: "SALE", deletedAt: null, status: { in: OPEN_STATUSES } },
        _sum: { total: true, paidAmount: true },
        _count: { id: true },
      });
      const rows = grouped
        .map((g) => ({
          partyId: g.partyId,
          remaining: rialToToman(g._sum?.total ?? null) - rialToToman(g._sum?.paidAmount ?? null),
          count: g._count?.id ?? 0,
        }))
        .filter((r) => r.remaining > 0)
        .sort((a, b) => b.remaining - a.remaining)
        .slice(0, 10);
      if (rows.length === 0) {
        return {
          text: "هیچ طرف‌حسابی بدهی بازی ندارد — همه فاکتورهای باز تسویه شده‌اند.",
          followUps: ["مطالبات و بدهی‌هایم چقدره؟", "گزارش سود این ماه"],
        };
      }
      const parties = await db.party.findMany({
        where: { id: { in: rows.map((r) => r.partyId) } },
        select: { id: true, name: true, mobile: true },
      });
      const pMap = new Map(parties.map((p) => [p.id, p] as [string, typeof p]));
      const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);
      const lines = rows.map(
        (r, i) =>
          `${toPersianDigits(i + 1)}. **${pMap.get(r.partyId)?.name ?? "طرف‌حساب حذف‌شده"}** — ${fmtToman(
            r.remaining
          )} از ${toPersianDigits(r.count)} فاکتور${pMap.get(r.partyId)?.mobile ? ` · ${toPersianDigits(pMap.get(r.partyId)!.mobile)}` : ""}`
      );
      const text =
        `### بیشترین بدهکاران شما\n\n` +
        lines.join("\n") +
        `\n\n- **جمع مانده این ${toPersianDigits(rows.length)} نفر:** ${fmtToman(totalRemaining)}\n` +
        `- برای پیگیری سریع‌تر بگویید «یادآور سررسید بذار» یا مانده تک‌تک را با «بدهی [نام] چقدره؟» ببینید.`;
      return { text, followUps: ["مطالبات و بدهی‌هایم چقدره؟", "یادآور سررسید بذار"] };
    },
  },
  // ─── Task 3-B: کیف پول و پاداش ───
  {
    id: "data:wallet",
    match: (t) =>
      /(کیف\s*پول|پاداش)/.test(t) &&
      /(چقدر|چند|مانده|موجودی|گزارش|تراکنش|برداشت|شده|وضعیت)/.test(t) &&
      !isConceptualQuestion(t),
    run: async (tenantId) => {
      const TX_FA: Record<string, string> = {
        REFERRAL_BONUS: "پاداش دعوت دوست",
        BUG_REWARD: "پاداش گزارش باگ",
        WITHDRAWAL: "برداشت وجه",
        ADMIN_ADJUSTMENT: "تعدیل پشتیبانی",
        SIGNUP_GIFT: "هدیه ثبت‌نام",
      };
      const [agg, txs, pendingWithdrawals, all] = await Promise.all([
        db.walletTransaction.aggregate({
          where: { tenantId, status: { not: "CANCELED" } },
          _sum: { amountToman: true },
        }),
        db.walletTransaction.findMany({
          where: { tenantId, status: { not: "CANCELED" } },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { type: true, amountToman: true, balanceAfter: true, description: true, createdAt: true },
        }),
        db.withdrawalRequest.count({ where: { tenantId, status: "PENDING" } }),
        db.walletTransaction.findMany({
          where: { tenantId, status: { not: "CANCELED" } },
          select: { amountToman: true },
          take: 2000,
        }),
      ]);
      const balance = agg._sum?.amountToman ?? 0;
      const earned = all.filter((t) => t.amountToman > 0).reduce((s, t) => s + t.amountToman, 0);
      const withdrawn = all.filter((t) => t.amountToman < 0).reduce((s, t) => s - t.amountToman, 0);
      const txLines = txs.map(
        (t) => `- ${toJalali(t.createdAt)} — ${TX_FA[t.type] ?? t.type}: ${fmtToman(t.amountToman)}`
      );
      const text =
        `### کیف پول شما\n\n` +
        `- **موجودی فعلی:** ${fmtToman(balance)}\n` +
        `- جمع پاداش‌های دریافتی: ${fmtToman(earned)}\n` +
        `- جمع برداشت‌ها: ${fmtToman(withdrawn)}\n` +
        `- برداشت در انتظار بررسی: ${toPersianDigits(pendingWithdrawals)} مورد\n\n` +
        (txLines.length ? `**آخرین تراکنش‌ها:**\n${txLines.join("\n")}\n\n` : "") +
        `_پاداش دعوت هر دوست پس از خرید اشتراک او ۱٬۰۰۰٬۰۰۰ تومان است؛ حداقل برداشت ۵۰۰٬۰۰۰ تومان (تا ۷۲ ساعت کاری)._`;
      return { text, followUps: ["گزارش سود این ماه", "چند کالا دارم؟"] };
    },
  },
  // ─── Task 3-B: خزانه — حساب‌های بانکی و چک‌ها ───
  {
    id: "data:treasury",
    match: (t) =>
      /(خزانه|موجودی\s*بانک|موجودی\s*حساب|حساب‌?های?\s*بانکی|مغایرت\s*بانکی|چک‌?های?\s*(سررسید|دریافتی|پرداختی|وضعیت|چنده|چقدر)|چک\s*صیادی)/.test(t) &&
      !isConceptualQuestion(t),
    run: async (tenantId) => {
      const [accounts, cheques] = await Promise.all([
        db.bankAccount.findMany({
          where: { tenantId, deletedAt: null },
          select: { bankName: true, branch: true, type: true, balance: true, currency: true },
          orderBy: { balance: "desc" },
        }),
        db.check.findMany({
          where: { tenantId, deletedAt: null },
          orderBy: { dueDate: "asc" },
          take: 60,
          select: { number: true, type: true, status: true, amount: true, dueDate: true, bankName: true, sayadId: true },
        }),
      ]);
      const totalT = accounts.reduce((s, a) => s + rialToToman(a.balance), 0);
      const TYPE_FA: Record<string, string> = { CURRENT: "جاری", SAVING: "سپرده", LOAN: "تسهیلات" };
      const accLines = accounts.map(
        (a) =>
          `- **${a.bankName}${a.branch ? ` (${a.branch})` : ""}** — ${TYPE_FA[a.type] ?? a.type}: ${fmtToman(
            rialToToman(a.balance)
          )}`
      );
      const now = new Date();
      const chequeRows = cheques
        .filter((c) => !["PASSED", "SETTLED", "VOID", "CANCELLED"].includes(c.status))
        .slice(0, 8)
        .map((c) => {
          const isRecv = c.type === "RECEIVED";
          const overdue = c.dueDate < now && !["PASSED", "SETTLED", "VOID"].includes(c.status);
          return `- ${isRecv ? "دریافتی" : "پرداختی"} \`${c.number}\` — ${fmtToman(
            rialToToman(c.amount)
          )} · سررسید ${toJalali(c.dueDate)}${overdue ? " · **گذشته از سررسید**" : ""}${c.sayadId ? " · صیادی ثبت‌شده" : ""}`;
        });
      const text =
        `### خزانه‌داری\n\n` +
        `- **جمع موجودی حساب‌های بانکی:** ${fmtToman(totalT)} در ${toPersianDigits(accounts.length)} حساب\n\n` +
        (accLines.length ? `**حساب‌ها:**\n${accLines.join("\n")}\n\n` : "هنوز حساب بانکی ثبت نشده — از ماژول خزانه‌داری اضافه کنید.\n\n") +
        (chequeRows.length
          ? `**چک‌های در جریان (نزدیک‌ترین سررسیدها):**\n${chequeRows.join("\n")}`
          : `چک در جریانی ثبت نشده است.`);
      return { text, followUps: ["مطالبات و بدهی‌هایم چقدره؟", "گزارش سود این ماه"] };
    },
  },
  // ─── Task 3-B: خلاصه سامانه مودیان ───
  {
    id: "data:modian",
    match: (t) =>
      /(مودیان|صورتحساب\s*الکترونیکی)/.test(t) &&
      /(وضعیت|ارسال|چند|گزارش|خلاصه|چک کن|بررسی|صف)/.test(t) &&
      !isConceptualQuestion(t) &&
      !/(کجاست|کجا|چطور|چگونه|راهنما)/.test(t),
    run: async (tenantId) => {
      const grouped = await db.invoice.groupBy({
        by: ["modianStatus"],
        where: { tenantId, type: "SALE", deletedAt: null },
        _count: { id: true },
      });
      const statusMap = new Map(
        grouped.map((g) => [g.modianStatus ?? "NULL", g._count.id] as [string, number])
      );
      const pending = await db.invoice.findMany({
        where: {
          tenantId,
          type: "SALE",
          deletedAt: null,
          OR: [{ modianStatus: null }, { modianStatus: { in: ["PENDING", "REJECTED"] } }],
          status: { in: ["SENT", "PAID", "PARTIAL", "PARTIALLY_PAID", "OVERDUE"] },
          total: { gt: 0 },
        },
        orderBy: { date: "desc" },
        take: 8,
        select: { number: true, date: true, total: true, modianStatus: true, partyId: true },
      });
      const parties = pending.length
        ? await db.party.findMany({
            where: { id: { in: pending.map((p) => p.partyId) } },
            select: { id: true, name: true },
          })
        : [];
      const partyMap = new Map(parties.map((p) => [p.id, p.name]));
      const STATUS_FA: Record<string, string> = {
        NULL: "ارسال‌نشده",
        PENDING: "در انتظار نتیجه",
        SENT: "ارسال‌شده",
        ACCEPTED: "تأییدشده",
        REJECTED: "ردشده",
      };
      const unsent = (statusMap.get("NULL") ?? 0) + (statusMap.get("PENDING") ?? 0);
      const text =
        `### وضعیت سامانه مودیان\n\n` +
        `- فاکتورهای **تأییدشده:** ${toPersianDigits(statusMap.get("ACCEPTED") ?? 0)} فقره\n` +
        `- **ارسال‌شده (در انتظار/تأیید):** ${toPersianDigits(statusMap.get("SENT") ?? 0)} فقره\n` +
        `- **ردشده:** ${toPersianDigits(statusMap.get("REJECTED") ?? 0)} فقره\n` +
        `- **ارسال‌نشده/در صف:** ${toPersianDigits(unsent)} فقره\n\n` +
        (pending.length
          ? `**صف ارسال (واجد شرایط ولی نرفته):**\n` +
            pending
              .map(
                (p) =>
                  `- \`${p.number}\` — ${partyMap.get(p.partyId) ?? "—"} · ${fmtToman(
                    rialToToman(p.total)
                  )} · ${toJalali(p.date)} · ${STATUS_FA[p.modianStatus ?? "NULL"]}`
              )
              .join("\n") +
            `\n\n_مهلت قانونی ارسال حداکثر ۱۲ روز از صدور است._`
          : `هیچ فاکتور واجد‌شرطی در صف ارسال نیست — عالی.`);
      return { text, followUps: ["ارزش افزودهٔ این ماه؟", "گزارش سود این ماه"] };
    },
  },
  // ─── موجودی/قیمت کالای مشخص ───
  {
    id: "data:product-lookup",
    match: (t) => {
      if (/(کیف\s*پول|بودجه)/.test(t)) return false;
      // «قیمت دلار/طلا» → ابزار نرخ‌ها؛ «موجودی انبار» → کوئری انبار ایجنت
      if (/(دلار|یورو|درهم|پوند|لیر|یوان|طلا|سکه|انس|مثقال|نرخ\s*ارز)/.test(t)) return false;
      // Task 3-B: عبارت‌های خزانه/بانکی/چک → ابزار خزانه، نه جستجوی کالا
      if (/(بانک|خزانه|حساب‌?های?\s*بانکی|چک|صیادی|شبا)/.test(t)) return false;
      const name = extractProductName(t);
      if (!name) return false;
      if (/^(انبار|انبار\s*(رو|را)|کل\s*انبار|همه)$/.test(name.trim())) return false;
      return /(موجودی|قیمت|پیدا|جستجو|سرچ|نشان|دارم)/.test(t);
    },
    run: async (tenantId, t) => {
      const name = extractProductName(t) || "";
      // «موجودی اولین کالا؟» → اولین کالای ثبت‌شدهٔ tenant (دستور کاتالوگ)
      let products;
      if (/^(اولین|اولين|نخستین)\s*(کالا|کالای|محصول|قلم|جنس)?/.test(name.trim())) {
        products = await db.product.findMany({
          where: { tenantId, deletedAt: null },
          orderBy: { createdAt: "asc" },
          take: 1,
        });
      } else {
        products = await findProducts(tenantId, name);
      }
      if (products.length === 0) {
        return {
          text:
            `کالایی با نام «${name}» در انبار شما پیدا نشد.\n\n` +
            `- املای نام را کوتاه‌تر امتحان کنید (مثلاً فقط بخشی از نام)\n` +
            `- بگویید «چند کالا دارم؟» تا فهرست کامل را ببینم\n` +
            `- اگر کالای جدید است، بگویید «کالای جدید بساز»`,
          followUps: ["چند کالا دارم؟", "کالای جدید بساز", "موجودی انبار رو نشون بده"],
        };
      }
      const ids = products.map((p) => p.id);
      const stocks = await db.stockItem.findMany({
        where: { tenantId, productId: { in: ids } },
        include: { warehouse: { select: { name: true } } },
      });
      const stockByProduct = new Map<string, { total: number; rows: string[] }>();
      for (const s of stocks) {
        const cur = stockByProduct.get(s.productId) ?? { total: 0, rows: [] };
        cur.total += s.quantity;
        if (s.quantity !== 0) cur.rows.push(`${s.warehouse.name}: ${toPersianDigits(formatNumber(s.quantity, 2))}`);
        stockByProduct.set(s.productId, cur);
      }
      const lines = products.map((p) => {
        const st = stockByProduct.get(p.id);
        const totalQty = st?.total ?? 0;
        const low = p.minStock > 0 && totalQty <= p.minStock ? " — هشدار: زیر حداقل موجودی" : "";
        const perWarehouse = st && st.rows.length ? ` (به تفکیک انبار: ${st.rows.join("، ")})` : "";
        return (
          `### ${p.name}\n\n` +
          `- **موجودی کل:** ${toPersianDigits(formatNumber(totalQty, 2))} ${p.unit}${perWarehouse}${low}\n` +
          `- **قیمت فروش:** ${fmtToman(rialToToman(p.salePrice))}\n` +
          `- قیمت خرید: ${fmtToman(rialToToman(p.purchasePrice))}\n` +
          `- کد کالا: \`${p.sku}\`${p.barcode ? ` — بارکد: \`${p.barcode}\`` : ""}`
        );
      });
      const text =
        (products.length > 1
          ? `${toPersianDigits(products.length)} کالا با این نام پیدا شد:\n\n`
          : "") + lines.join("\n\n");
      return {
        text,
        followUps: ["ارزش انبارم چقدره؟", "قیمت رو عوض کن", "پرفروش‌ترین کالاها کجان؟"],
      };
    },
  },
  // ─── فروش دوره ───
  {
    id: "data:sales-summary",
    match: (t) =>
      /(فروش|درآمد)/.test(t) &&
      /(چقدر|چند|گزارش|وضعیت|رشد|این ماه|امسال|ماه قبل|بود|شدم|داشتم)/.test(t) &&
      !/(بهترین|برترین|بیشترین).*?(مشتری|محصول|کالا)/.test(t) &&
      !/(پر\s*فروش|سود)/.test(t),
    run: async (tenantId, t) => {
      const period = extractPeriod(t);
      const range = periodRange(period);
      const dateFilter: { gte?: Date; lt?: Date } = {};
      if (range.start) dateFilter.gte = range.start;
      if (range.end) dateFilter.lt = range.end;
      const [salesAgg, salesCount, unpaidAgg] = await Promise.all([
        db.invoice.aggregate({
          where: {
            tenantId,
            type: "SALE",
            deletedAt: null,
            status: { in: FINAL_STATUSES },
            ...(range.start || range.end ? { date: dateFilter } : {}),
          },
          _sum: { total: true, paidAmount: true },
        }),
        db.invoice.count({
          where: {
            tenantId,
            type: "SALE",
            deletedAt: null,
            status: { in: FINAL_STATUSES },
            ...(range.start || range.end ? { date: dateFilter } : {}),
          },
        }),
        db.invoice.aggregate({
          where: {
            tenantId,
            type: "SALE",
            deletedAt: null,
            status: { in: OPEN_STATUSES },
            ...(range.start || range.end ? { date: dateFilter } : {}),
          },
          _sum: { total: true, paidAmount: true },
        }),
      ]);
      const salesT = rialToToman(salesAgg._sum?.total ?? null);
      const paidT = rialToToman(salesAgg._sum?.paidAmount ?? null);
      const openT = Math.max(0, rialToToman(unpaidAgg._sum?.total ?? null) - rialToToman(unpaidAgg._sum?.paidAmount ?? null));
      const avgT = salesCount > 0 ? Math.round(salesT / salesCount) : 0;

      // مقایسه با ماه قبل (فقط برای this_month)
      let compareLine = "";
      if (period === "this_month") {
        const prev = periodRange("last_month");
        const prevAgg = await db.invoice.aggregate({
          where: {
            tenantId,
            type: "SALE",
            deletedAt: null,
            status: { in: FINAL_STATUSES },
            date: { gte: prev.start as Date, lt: prev.end as Date },
          },
          _sum: { total: true },
        });
        const prevT = rialToToman(prevAgg._sum?.total ?? null);
        if (prevT > 0) {
          const growth = ((salesT - prevT) / prevT) * 100;
          compareLine = `- **ماه قبل:** ${fmtToman(prevT)} — رشد ${toPersianDigits(formatNumber(Math.abs(growth), 1))}٪ ${growth >= 0 ? "(افزایش)" : "(کاهش)"}\n`;
        } else {
          compareLine = `- ماه قبل فروشی ثبت نشده است\n`;
        }
      }

      const text =
        `### فروش ${range.label}\n\n` +
        `- **جمع فروش (فاکتورهای قطعی):** ${fmtToman(salesT)}\n` +
        `- تعداد فاکتور فروش: ${toPersianDigits(salesCount)} فقره\n` +
        `- میانگین هر فاکتور: ${fmtToman(avgT)}\n` +
        `- وصول‌شده همین دوره: ${fmtToman(paidT)}\n` +
        `- مانده وصول‌نشده همین دوره: ${fmtToman(openT)}\n` +
        compareLine +
        `\n_پیش‌نویس‌ها و رزروها در این عدد حساب نمی‌شوند._`;
      return {
        text,
        followUps: ["گزارش سود این ماه", "بهترین مشتری کیه؟", "مطالبات و بدهی‌هایم چقدره؟"],
      };
    },
  },
  // ─── Task 3-B: آمار فاکتورها — این ماه در برابر ماه قبل ───
  {
    id: "data:invoice-stats",
    match: (t) =>
      /(تعداد\s*فاکتور|فاکتور[\s‌های]*\s*(تعداد|رشد|مقایسه)|رشد\s*فروش|مقایسه\s*(این\s*)?ماه|چند\s*تا\s*فاکتور)/.test(t) &&
      !/(بزن|ثبت|بساز|ایجاد)/.test(t),
    run: async (tenantId) => {
      const thisRange = periodRange("this_month");
      const lastRange = periodRange("last_month");
      const mk = (r: { start?: Date; end?: Date }) => ({
        ...(r.start ? { gte: r.start } : {}),
        ...(r.end ? { lt: r.end } : {}),
      });
      const finalOnly = { notIn: ["DRAFT", "CANCELLED", "RESERVED"] };
      const [thisSale, lastSale, thisPurch, lastPurch] = await Promise.all([
        db.invoice.aggregate({ where: { tenantId, type: "SALE", deletedAt: null, status: finalOnly, date: mk(thisRange) }, _count: { id: true }, _sum: { total: true } }),
        db.invoice.aggregate({ where: { tenantId, type: "SALE", deletedAt: null, status: finalOnly, date: mk(lastRange) }, _count: { id: true }, _sum: { total: true } }),
        db.invoice.aggregate({ where: { tenantId, type: "PURCHASE", deletedAt: null, status: finalOnly, date: mk(thisRange) }, _count: { id: true }, _sum: { total: true } }),
        db.invoice.aggregate({ where: { tenantId, type: "PURCHASE", deletedAt: null, status: finalOnly, date: mk(lastRange) }, _count: { id: true }, _sum: { total: true } }),
      ]);
      const thisSaleT = rialToToman(thisSale._sum?.total ?? null);
      const lastSaleT = rialToToman(lastSale._sum?.total ?? null);
      const thisPurchT = rialToToman(thisPurch._sum?.total ?? null);
      const lastPurchT = rialToToman(lastPurch._sum?.total ?? null);
      const growth = (a: number, b: number): string =>
        b <= 0 ? (a > 0 ? "جدید (ماه قبل صفر)" : "—") : `${toPersianDigits(formatNumber(Math.round(((a - b) / b) * 100), 0))}٪ ${a >= b ? "رشد" : "افت"}`;
      const text =
        `### آمار فاکتورها — ${thisRange.label} در برابر ${lastRange.label}\n\n` +
        `**فروش:**\n` +
        `- تعداد: ${toPersianDigits(thisSale._count?.id ?? 0)} فقره (ماه قبل ${toPersianDigits(lastSale._count?.id ?? 0)})\n` +
        `- مبلغ: ${fmtToman(thisSaleT)} (ماه قبل ${fmtToman(lastSaleT)}) — **${growth(thisSaleT, lastSaleT)}**\n\n` +
        `**خرید:**\n` +
        `- تعداد: ${toPersianDigits(thisPurch._count?.id ?? 0)} فقره (ماه قبل ${toPersianDigits(lastPurch._count?.id ?? 0)})\n` +
        `- مبلغ: ${fmtToman(thisPurchT)} (ماه قبل ${fmtToman(lastPurchT)}) — **${growth(thisPurchT, lastPurchT)}**\n\n` +
        `_فاکتورهای پیش‌نویس/باطل/رزرو شمرده نمی‌شوند._`;
      return { text, followUps: ["فروش این ماه چقدره؟", "گزارش سود این ماه"] };
    },
  },
  // ─── Task 3-B: جریان نقدی دوره ───
  {
    id: "data:cashflow",
    match: (t) => /(جریان\s*نقدی|گردش\s*نقدی|نقدینگی|cash\s*flow)/.test(t) && !isConceptualQuestion(t),
    run: async (tenantId, t) => {
      const period = extractPeriod(t);
      const range = periodRange(period);
      const dateFilter: { gte?: Date; lt?: Date } = {};
      if (range.start) dateFilter.gte = range.start;
      if (range.end) dateFilter.lt = range.end;
      const hasRange = Boolean(range.start);
      // ۱) مبنای سند حسابداری: گردش حساب صندوق (کد استاندارد ۱۱۰۱)
      let inflows = 0;
      let outflows = 0;
      let basis = "";
      const cashAccount = await db.account
        .findFirst({ where: { tenantId, code: "1101", deletedAt: null }, select: { id: true, name: true } })
        .catch(() => null);
      if (cashAccount) {
        const lines = await db.journalLine.findMany({
          where: {
            tenantId,
            accountId: cashAccount.id,
            journalEntry: {
              tenantId,
              deletedAt: null,
              status: { not: "REVERSED" },
              ...(hasRange ? { date: dateFilter } : {}),
            },
          },
          select: { debit: true, credit: true },
          take: 5000,
        });
        for (const l of lines) {
          inflows += Number(l.debit) / 10;
          outflows += Number(l.credit) / 10;
        }
        basis = `سندهای حسابداری حساب «${cashAccount.name}» (صندوق) — بدهکار = دریافت نقدی، بستانکار = پرداخت نقدی`;
      }
      // ۲) بدون سند → تقریب از فاکتورهای نقدی و هزینه‌ها
      if (inflows === 0 && outflows === 0) {
        const [cashSales, cashPurchases, expenses] = await Promise.all([
          db.invoice.aggregate({
            where: { tenantId, type: "SALE", paymentType: "CASH", deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED", "RESERVED"] }, ...(hasRange ? { date: dateFilter } : {}) },
            _sum: { total: true },
          }),
          db.invoice.aggregate({
            where: { tenantId, type: "PURCHASE", paymentType: "CASH", deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED", "RESERVED"] }, ...(hasRange ? { date: dateFilter } : {}) },
            _sum: { total: true },
          }),
          db.expenseEntry.aggregate({
            where: { tenantId, type: "EXPENSE", ...(hasRange ? { date: dateFilter } : {}) },
            _sum: { amount: true },
          }),
        ]);
        inflows = rialToToman(cashSales._sum?.total ?? null);
        outflows = rialToToman(cashPurchases._sum?.total ?? null) + rialToToman(expenses._sum?.amount ?? null);
        basis = "تقریبی از فاکتورهای نقدی و هزینه‌های دوره (سند صندوقی در این بازه ثبت نشده)";
      }
      const net = inflows - outflows;
      const text =
        `### جریان نقدی ${range.label}\n\n` +
        `- **دریافت‌های نقدی:** ${fmtToman(Math.floor(inflows))}\n` +
        `- **پرداخت‌های نقدی:** ${fmtToman(Math.floor(outflows))}\n` +
        `- **خالص جریان نقدی:** **${fmtToman(Math.floor(net))}** ${net >= 0 ? "(نقد اضافه شده)" : "(نقد کم شده)"}\n\n` +
        `- مبنای محاسبه: ${basis}\n` +
        `- خالص مثبت یعنی نقد در دوره اضافه شده؛ مالیات ارزش افزوده جزو گردش است چون واقعاً وصول/پرداخت می‌شود.`;
      return { text, followUps: ["گزارش سود این ماه", "مطالبات و بدهی‌هایم چقدره؟"] };
    },
  },
  // ─── Task 3-B: وضعیت بودجه ───
  {
    id: "data:budget",
    match: (t) =>
      /(بودجه)/.test(t) &&
      /(چقدر|چند|مانده|وضعیت|گزارش|باقی|انحراف|بریم)/.test(t) &&
      !isConceptualQuestion(t) &&
      !/(بساز|بزن|ایجاد|ثبت)/.test(t),
    run: async (tenantId) => {
      const budgets = await db.budget.findMany({
        where: { tenantId, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { items: true },
      });
      if (budgets.length === 0) {
        return {
          text: "هنوز بودجه‌ای تعریف نشده است.\n\n- از ماژول «بودجه‌ریزی» (گروه انبار و کالا) بودجهٔ سال/دوره را بسازید\n- بعد از آن، همین‌جا وضعیت انحراف و باقیماندهٔ هر ردیف را می‌پرسم",
          followUps: ["هزینه‌های این ماه چقدره؟", "گزارش سود این ماه"],
        };
      }
      const lines: string[] = [];
      for (const b of budgets) {
        const planned = b.items.reduce((s, it) => s + rialToToman(it.budgetAmount), 0);
        const actual = b.items.reduce((s, it) => s + rialToToman(it.actualAmount), 0);
        const variance = planned - actual;
        lines.push(
          `### ${b.title} (سال ${toPersianDigits(b.fiscalYear)})\n\n` +
            `- بودجه‌ریزی‌شده: ${fmtToman(planned)}\n` +
            `- عملکرد واقعی: ${fmtToman(actual)}\n` +
            `- **انحراف: ${fmtToman(variance)}** ${variance >= 0 ? "(زیر بودجه — صرفه‌جویی)" : "(عبور از بودجه)"}\n` +
            `- ردیف‌های بودجه: ${toPersianDigits(b.items.length)} مورد`
        );
      }
      const text =
        `### وضعیت بودجه\n\n` +
        lines.join("\n\n") +
        `\n\n_انحراف مثبت یعنی زیر بودجه مانده؛ منفی یعنی عبور از بودجه._`;
      return { text, followUps: ["هزینه‌های این ماه چقدره؟", "گزارش سود این ماه"] };
    },
  },
  // ─── بهترین مشتری ───
  {
    id: "data:best-customer",
    match: (t) =>
      /(بهترین|برترین|بیشترین|وفادار|قابل\s*اعتماد)/.test(t) &&
      /(مشتری|خریدار|طرف\s*حساب)/.test(t) &&
      !/(بدهکار|بدهی)/.test(t),
    run: async (tenantId) => {
      const grouped = await db.invoice.groupBy({
        by: ["partyId"],
        where: { tenantId, type: "SALE", deletedAt: null, status: { in: FINAL_STATUSES } },
        _sum: { total: true },
        _count: { id: true },
        _max: { date: true },
        orderBy: { _sum: { total: "desc" } },
        take: 5,
      });
      if (grouped.length === 0) {
        return {
          text: "هنوز فروشی ثبت نشده تا بهترین مشتری‌ها را ببینم. اولین فاکتور را ثبت کنید — یا بگویید «فاکتور جدید بساز».",
          followUps: ["فاکتور جدید بساز", "چند مشتری دارم؟", "گزارش سود این ماه"],
        };
      }
      const partyIds = grouped.map((g) => g.partyId);
      const parties = await db.party.findMany({ where: { id: { in: partyIds } }, select: { id: true, name: true } });
      const nameById = new Map(parties.map((p) => [p.id, p.name]));
      const rows = grouped.map((g, i) => {
        const totalT = rialToToman(g._sum?.total ?? null);
        return (
          `${toPersianDigits(i + 1)}. **${nameById.get(g.partyId) ?? "طرف‌حساب حذف‌شده"}** — ` +
          `${fmtToman(totalT)} از ${toPersianDigits(g._count?.id ?? 0)} فاکتور` +
          (g._max?.date ? ` (آخرین خرید: ${toJalali(g._max.date)})` : "")
        );
      });
      const topTotal = rialToToman(grouped[0]._sum?.total ?? null);
      const allSales = await db.invoice.aggregate({
        where: { tenantId, type: "SALE", deletedAt: null, status: { in: FINAL_STATUSES } },
        _sum: { total: true },
      });
      const allT = rialToToman(allSales._sum?.total ?? null);
      const share = allT > 0 ? (topTotal / allT) * 100 : 0;
      const text =
        `### برترین مشتریان شما (بر اساس مبلغ کل خرید)\n\n` +
        rows.join("\n") +
        `\n\nمشتری اول **${toPersianDigits(formatNumber(share, 1))}٪** از کل فروش شما را ساخته است.` +
        (share > 40 ? "\n\nتوجه: تمرکز فروش روی یک مشتری بالای ۴۰٪ ریسک کسب‌وکار را بالا می‌برد — تنوع‌بخشی به مشتریان را در برنامه بگذارید." : "");
      return {
        text,
        followUps: ["بدهی این مشتری چقدره؟", "پرفروش‌ترین کالاها کجان؟", "گزارش سود این ماه"],
      };
    },
  },
  // ─── مانده/بدهی طرف‌حساب مشخص ───
  {
    id: "data:party-balance",
    match: (t) => {
      const name = extractPartyName(t);
      if (!name) return false;
      return /(بدهی|بدهکار|مانده|طلب|قرض)/.test(t);
    },
    run: async (tenantId, t) => {
      const name = extractPartyName(t) || "";
      const parties = await db.party.findMany({
        where: { tenantId, name: { contains: name }, deletedAt: null },
        take: 5,
      });
      if (parties.length === 0) {
        return {
          text:
            `طرف‌حسابی با نام «${name}» پیدا نشد.\n\n` +
            `- بخشی از نام را بگویید (مثلاً فقط نام خانوادگی)\n` +
            `- بگویید «بهترین مشتری کیه؟» تا فهرست مشتریان پرخرید را ببینید\n` +
            `- مشتری جدید است؟ بگویید «مشتری جدید بساز»`,
          followUps: ["بهترین مشتری کیه؟", "مشتری جدید بساز", "مطالبات و بدهی‌هایم چقدره؟"],
        };
      }
      const outLines: string[] = [];
      for (const party of parties.slice(0, 3)) {
        const [saleAgg, purchAgg, oldest] = await Promise.all([
          db.invoice.aggregate({
            where: { tenantId, partyId: party.id, type: "SALE", deletedAt: null, status: { in: OPEN_STATUSES } },
            _sum: { total: true, paidAmount: true },
          }),
          db.invoice.aggregate({
            where: { tenantId, partyId: party.id, type: "PURCHASE", deletedAt: null, status: { in: OPEN_STATUSES } },
            _sum: { total: true, paidAmount: true },
          }),
          db.invoice.findFirst({
            where: { tenantId, partyId: party.id, type: "SALE", deletedAt: null, status: { in: OPEN_STATUSES } },
            orderBy: { date: "asc" },
            select: { number: true, date: true, dueDate: true },
          }),
        ]);
        const receivable = Math.max(
          0,
          rialToToman(saleAgg._sum?.total ?? null) - rialToToman(saleAgg._sum?.paidAmount ?? null)
        );
        const payable = Math.max(
          0,
          rialToToman(purchAgg._sum?.total ?? null) - rialToToman(purchAgg._sum?.paidAmount ?? null)
        );
        const net = receivable - payable;
        outLines.push(
          `### مانده «${party.name}»\n\n` +
            `- ${net >= 0 ? "**این مشتری به شما بدهکار است:**" : "**شما به این طرف‌حساب بدهکار هستید:**"} **${fmtToman(Math.abs(net))}**\n` +
            `- مانده فاکتورهای فروش باز: ${fmtToman(receivable)}\n` +
            `- مانده فاکتورهای خرید باز: ${fmtToman(payable)}\n` +
            (party.creditLimit && rialToToman(party.creditLimit) > 0
              ? `- سقف اعتباری مصوب: ${fmtToman(rialToToman(party.creditLimit))}\n`
              : "") +
            (oldest
              ? `- قدیمی‌ترین فاکتور باز: \`${oldest.number}\`${oldest.dueDate ? ` با سررسید ${toJalali(oldest.dueDate)}` : ""}\n`
              : "")
        );
      }
      return {
        text: outLines.join("\n"),
        followUps: ["مطالبات و بدهی‌هایم چقدره؟", "فاکتور جدید بساز", "یادآور سررسید بذار"],
      };
    },
  },
  // ─── نرخ ارز و طلا ───
  {
    id: "data:rates",
    match: (t) =>
      /(قیمت|نرخ|حال|امروز).*(دلار|یورو|درهم|پوند|لیر|یوان|طلا|سکه|انس|مثقال)|دلار\s*چند|طلا\s*چند|یورو\s*چند|سکه\s*چند|نرخ\s*ارز(?!و)|نرخ\s*طلا/.test(t) &&
      !/(ارزش\s*افزوده|ارزش\s*افزوده|چطور|چگونه|یعنی|تسعیر)/.test(t),
    run: async (tenantId, t) => {
      void tenantId;
      const labels: Record<string, string> = {
        USD: "دلار آمریکا",
        EUR: "یورو",
        AED: "درهم امارات",
        GBP: "پوند انگلیس",
        TRY: "لیر ترکیه",
        CNY: "یوآن چین",
        SAR: "ریال عربستان",
        GOLD_GERAM18: "گرم طلای ۱۸ عیار",
        GOLD_SEKEE: "سکه امامی",
        GOLD_ONSE: "انس جهانی طلا",
        GOLD_MESGHAL: "مثقال طلا",
      };
      // درخواست فقط یک نماد؟
      let onlyCode: string | null = null;
      for (const [code, label] of Object.entries(labels)) {
        const key = label.split(" ")[0];
        if (code !== "GOLD_ONSE" && new RegExp(key).test(t)) onlyCode = code;
      }
      if (/طلا/.test(t) && !onlyCode) onlyCode = "GOLD_GERAM18";
      if (/سکه/.test(t)) onlyCode = "GOLD_SEKEE";
      if (/انس/.test(t)) onlyCode = "GOLD_ONSE";
      const rates = await db.exchangeRate.findMany({
        where: { toCurrency: "IRR", ...(onlyCode ? { fromCurrency: onlyCode } : {}) },
        orderBy: { fetchedAt: "desc" },
        take: 30,
      });
      const latest = new Map<string, { rate: number; fetchedAt: Date; source: string }>();
      for (const r of rates) {
        if (!latest.has(r.fromCurrency)) latest.set(r.fromCurrency, { rate: r.rate, fetchedAt: r.fetchedAt, source: r.source });
      }
      if (latest.size === 0) {
        return {
          text:
            "هنوز هیچ نرخ ارز/طلا در سیستم ثبت نشده است.\n\n" +
            "- از ماژول «ارز و چندارزی» (گروه انبار و کالا) نرخ‌ها را دریافت/ثبت کنید\n" +
            "- ثبت دستی هم ممکن است — نرخ‌ها با مهر زمان ذخیره می‌شوند\n" +
            "- کالاهای دلاری با فعال‌سازی «همگام‌سازی با نرخ بازار» خودکار به‌روز می‌شوند",
          followUps: ["ارزش انبارم چقدره؟", "گزارش سود این ماه"],
        };
      }
      const rows = Array.from(latest.entries())
        .sort((a, b) => (a[0].startsWith("GOLD") ? -1 : 1) - (b[0].startsWith("GOLD") ? -1 : 1))
        .map(([code, v]) => {
          const toman = v.rate / 10;
          return `- **${labels[code] || code}:** ${toPersianDigits(formatNumber(Math.round(toman)))} تومان — به‌روزرسانی ${toJalali(v.fetchedAt)} (منبع: ${v.source === "API" ? "tgju" : "ثبت دستی"})`;
        });
      const text = `### آخرین نرخ‌های ثبت‌شده\n\n` + rows.join("\n") + `\n\n_نرخ‌ها از آخرین به‌روزرسانی داخل سیستم‌اند؛ نوسان لحظه‌ای بازار ممکن است._`;
      return {
        text,
        followUps: ["ارزش انبارم چقدره؟", "تسعیر ارز یعنی چی؟", "گزارش سود این ماه"],
      };
    },
  },
  // ─── Task 3-B: روند سود ۶ ماه اخیر ───
  {
    id: "data:profit-trend",
    match: (t) =>
      /(روند|ترند|تاریخچه)\s*سود|سود\s*(ماهانه|ماه‌به‌ماه|۶|شش|6)\s*ماه|سودهای\s*ماه‌های/.test(t),
    run: async (tenantId) => {
      const now = new Date();
      const jy = getCurrentJalaliYear(now);
      let jm = getCurrentJalaliMonth(now);
      const rows: Array<{ label: string; profit: number; sales: number }> = [];
      for (let i = 0; i < 6; i++) {
        const [gy, gm, gd] = jalaliToGregorian(jm === 1 ? jy - 1 : jy, jm === 1 ? 12 : jm - 1, 1);
        const start = new Date(gy, gm - 1, gd);
        const nm = jm === 12 ? 1 : jm + 1;
        const ny = jm === 12 ? jy + 1 : jy;
        const [gy2, gm2, gd2] = jalaliToGregorian(ny, nm, 1);
        const end = new Date(gy2, gm2 - 1, gd2);
        const [salesAgg, purchAgg, expAgg] = await Promise.all([
          db.invoice.aggregate({ where: { tenantId, type: "SALE", deletedAt: null, status: { in: FINAL_STATUSES }, date: { gte: start, lt: end } }, _sum: { total: true } }),
          db.invoice.aggregate({ where: { tenantId, type: "PURCHASE", deletedAt: null, status: { in: FINAL_STATUSES }, date: { gte: start, lt: end } }, _sum: { total: true } }),
          db.expenseEntry.aggregate({ where: { tenantId, type: "EXPENSE", date: { gte: start, lt: end } }, _sum: { amount: true } }),
        ]);
        const sales = rialToToman(salesAgg._sum?.total ?? null);
        const profit = sales - rialToToman(purchAgg._sum?.total ?? null) - rialToToman(expAgg._sum?.amount ?? null);
        rows.push({ label: `${JALALI_MONTHS[jm - 1]}`, profit, sales });
        jm = jm === 1 ? 12 : jm - 1;
      }
      const chartMax = Math.max(1, ...rows.map((r) => Math.abs(r.profit)));
      const trendLine = rows
        .map((r) => {
          const width = Math.max(1, Math.round((Math.abs(r.profit) / chartMax) * 8));
          return `${r.profit < 0 ? "▪" : "▤".repeat(width)}${r.profit < 0 ? "▪".repeat(width - 1) : ""}`;
        })
        .join("›");
      const lines = rows
        .map((r) => `| ${r.label} | ${fmtToman(r.profit)} |`)
        .reverse();
      const allZero = rows.every((r) => r.profit === 0);
      const text =
        `### روند سود ۶ ماه اخیر\n\n` +
        (allZero
          ? "در ۶ ماه اخیر دادهای کافی برای محاسبهٔ سود ثبت نشده است."
          : `\`${trendLine}\`\n\n| ماه | سود (زیان) |\n| --- | --- |\n${lines.join("\n")}\n\n_سود = فروش − خرید − هزینه‌های همان ماه._`);
      return { text, followUps: ["گزارش سود این ماه", "تفکیک هزینه‌های این ماه"] };
    },
  },
  // ─── گزارش سود ───
  {
    id: "data:profit-summary",
    match: (t) =>
      /(سود|گزارش\s*سود|سودآوری)/.test(t) &&
      !isConceptualQuestion(t) &&
      !/(ناخالص یعنی|خالص یعنی|حاشیه یعنی)/.test(t),
    run: async (tenantId, t) => {
      const period = extractPeriod(t);
      const range = periodRange(period);
      const dateFilter: { gte?: Date; lt?: Date } = {};
      if (range.start) dateFilter.gte = range.start;
      if (range.end) dateFilter.lt = range.end;
      const hasRange = Boolean(range.start);
      const [salesAgg, purchAgg, expAgg] = await Promise.all([
        db.invoice.aggregate({
          where: {
            tenantId,
            type: "SALE",
            deletedAt: null,
            status: { in: FINAL_STATUSES },
            ...(hasRange ? { date: dateFilter } : {}),
          },
          _sum: { total: true, tax: true },
        }),
        db.invoice.aggregate({
          where: {
            tenantId,
            type: "PURCHASE",
            deletedAt: null,
            status: { in: FINAL_STATUSES },
            ...(hasRange ? { date: dateFilter } : {}),
          },
          _sum: { total: true },
        }),
        db.expenseEntry.aggregate({
          where: { tenantId, type: "EXPENSE", ...(hasRange ? { date: dateFilter } : {}) },
          _sum: { amount: true },
        }),
      ]);
      const salesT = rialToToman(salesAgg._sum?.total ?? null);
      const purchT = rialToToman(purchAgg._sum?.total ?? null);
      const expT = rialToToman(expAgg._sum?.amount ?? null);
      const netT = salesT - purchT - expT;
      const margin = salesT > 0 ? (netT / salesT) * 100 : 0;
      const text =
        `### گزارش سود ${range.label}\n\n` +
        `| شرح | مبلغ (تومان) |\n| --- | --- |\n` +
        `| فروش (فاکتورهای قطعی) | ${toPersianDigits(formatNumber(salesT))} |\n` +
        `| خرید | ${toPersianDigits(formatNumber(-purchT))} |\n` +
        `| هزینه‌ها | ${toPersianDigits(formatNumber(-expT))} |\n` +
        `| **سود (زیان) خالص** | **${toPersianDigits(formatNumber(netT))}** |\n\n` +
        `- حاشیهٔ سود خالص: **${toPersianDigits(formatNumber(margin, 1))}٪**\n` +
        `- سود = فروش − خرید − هزینه‌ها (مالیات ارزش افزوده جدا محاسبه می‌شود و جزو سود نیست)\n` +
        `- برای سود دقیق ترازنامه‌ای، بهای تمام‌شدهٔ واقعی (COGS) از کاردکس محاسبه می‌شود؛ اینجا تقریب خرید دوره است.`;
      return {
        text,
        followUps: ["روند سود چطوره؟", "تفکیک هزینه‌های این ماه", "حاشیه سود یعنی چی؟"],
      };
    },
  },
  // ─── Task 3-B: بزرگ‌ترین هزینه‌های دوره / امروز ───
  {
    id: "data:expenses-top",
    match: (t) =>
      /(هزینه|خرج)/.test(t) &&
      /(بزرگ|بیشترین|چقدر|چند|گزارش|لیست|تحلیل|تفکیک|امروز|این ماه|امسال|بالای)/.test(t) &&
      !/(ثبت|بزن|بساز|ایجاد|اضافه|درج|ذخیره)/.test(t) &&
      !isHowDoIQuestion(t),
    run: async (tenantId, t) => {
      const period = extractPeriod(t);
      const range = periodRange(period);
      const dateFilter: { gte?: Date; lt?: Date } = {};
      if (range.start) dateFilter.gte = range.start;
      if (range.end) dateFilter.lt = range.end;
      const hasRange = Boolean(range.start);
      const CAT_FA: Record<string, string> = {
        MEALS: "غذا و رستوران",
        TRAVEL: "سفر",
        FUEL: "سوخت و کارت سوخت",
        OFFICE: "اداری و لوازم",
        CLIENT_MEETING: "جلسه با مشتری",
        SOFTWARE: "نرم‌افزار و اشتراک",
        OTHER: "سایر",
      };
      const [entries, todayAgg] = await Promise.all([
        db.expenseEntry.findMany({
          where: { tenantId, type: "EXPENSE", ...(hasRange ? { date: dateFilter } : {}) },
          orderBy: { amount: "desc" },
          take: 200,
          select: { amount: true, date: true, category: true, vendor: true, description: true },
        }),
        db.expenseEntry.aggregate({
          where: { tenantId, type: "EXPENSE", date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
          _sum: { amount: true },
        }),
      ]);
      if (entries.length === 0) {
        return {
          text: `در ${range.label} هزینه‌ای ثبت نشده است.\n\n- برای ثبت سریع بگویید: «هزینهٔ اجاره ۳ میلیون ثبت کن»\n- هزینه‌ها با دسته‌بندی در گزارش بودجه هم لحاظ می‌شوند`,
          followUps: ["هزینه ۲ میلیون ناهار کاری ثبت کن", "گزارش سود این ماه"],
        };
      }
      const totalT = entries.reduce((s, e) => s + rialToToman(e.amount), 0);
      const byCat = new Map<string, number>();
      for (const e of entries) byCat.set(e.category, (byCat.get(e.category) ?? 0) + rialToToman(e.amount));
      const catLines = Array.from(byCat.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cat, sum]) => `- ${CAT_FA[cat] ?? cat}: ${fmtToman(sum)} (${toPersianDigits(formatNumber(Math.round((sum / totalT) * 100), 1))}٪)`);
      const topLines = entries.slice(0, 5).map(
        (e) => `- ${toJalali(e.date)} — ${fmtToman(rialToToman(e.amount))} · ${CAT_FA[e.category] ?? e.category}${e.vendor ? ` · ${e.vendor}` : ""}${e.description ? ` (${e.description})` : ""}`
      );
      const todayT = rialToToman(todayAgg._sum?.amount ?? null);
      const text =
        `### هزینه‌های ${range.label}\n\n` +
        `- **جمع هزینه‌ها:** ${fmtToman(totalT)} در ${toPersianDigits(entries.length)} ردیف\n` +
        `- هزینه‌های امروز: ${fmtToman(todayT)}\n\n` +
        `**تفکیک دسته‌ای (سهم از کل):**\n${catLines.join("\n")}\n\n` +
        `**بزرگ‌ترین ردیف‌ها:**\n${topLines.join("\n")}`;
      return { text, followUps: ["وضعیت بودجه", "گزارش سود این ماه"] };
    },
  },
  // ─── Task 3-B: فاکتورهای معوق / سررسید گذشته ───
  {
    id: "data:overdue",
    match: (t) =>
      /(معوق|سررسید\s*گذشته|سرسید\s*گذشته|عقب\s*افتاده|چک\s*برگشتی|واجب\s*الاداء)/.test(t) &&
      !isHowDoIQuestion(t),
    run: async (tenantId) => {
      const now = new Date();
      const overdue = await db.invoice.findMany({
        where: {
          tenantId,
          type: "SALE",
          deletedAt: null,
          status: { in: OPEN_STATUSES },
          OR: [{ status: "OVERDUE" }, { dueDate: { lt: now } }],
        },
        include: { party: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
        take: 500,
      });
      if (overdue.length === 0) {
        return {
          text: "هیچ فاکتور معوق/سررسید‌گذشته‌ای ندارید — مطالبات شما همه به‌موقع است.",
          followUps: ["مطالبات و بدهی‌هایم چقدره؟", "بدهکارترین مشتری‌ها کیان؟"],
        };
      }
      const rows = overdue.map((inv) => ({
        inv,
        remaining: rialToToman(inv.total) - rialToToman(inv.paidAmount),
      })).filter((r) => r.remaining > 0);
      const totalT = rows.reduce((s, r) => s + r.remaining, 0);
      const lines = rows.slice(0, 8).map(
        (r) =>
          `- \`${r.inv.number}\` — ${r.inv.party?.name ?? "—"} · مانده ${fmtToman(r.remaining)}${r.inv.dueDate ? ` · سررسید ${toJalali(r.inv.dueDate)}` : ""}`
      );
      const text =
        `### فاکتورهای معوق\n\n` +
        `- **تعداد:** ${toPersianDigits(rows.length)} فقره\n` +
        `- **جمع مانده:** ${fmtToman(totalT)}\n\n` +
        lines.join("\n") +
        `\n\n_با «یادآور سررسید بذار» پیگیری هر کدام را در ماژول یادآورها ثبت می‌کنم._`;
      return { text, followUps: ["یادآور سررسید بذار", "بدهکارترین مشتری‌ها کیان؟"] };
    },
  },
  // ─── Task 3-B: ارزش موجودی انبار ───
  {
    id: "data:inventory-value",
    match: (t) =>
      /(ارزش\s*(موجودی|انبار)|انبار.*ارزش|چقدر\s*می\s*ارزه|می\s*ارزه|چقدر\s*ارزش\s*دارم)/.test(t) &&
      !isConceptualQuestion(t),
    run: async (tenantId) => {
      const stockAgg = await db.stockItem.groupBy({ by: ["productId"], where: { tenantId }, _sum: { quantity: true } });
      const qtyByProduct = new Map<string, number>();
      for (const s of stockAgg) {
        const q = s._sum.quantity ?? 0;
        if (q > 0) qtyByProduct.set(s.productId, q);
      }
      if (qtyByProduct.size === 0) {
        return {
          text: "هنوز موجودی انباری ثبت نشده است.\n\n- اولین رسید ورود را از ماژول «انبار و کالا» ثبت کنید یا بگویید «موجودی کالای X رو ۵ تا کن»",
          followUps: ["چند کالا دارم؟", "موجودی انبار رو نشون بده"],
        };
      }
      const products = await db.product.findMany({
        where: { id: { in: Array.from(qtyByProduct.keys()) }, tenantId, deletedAt: null },
        select: { id: true, name: true, purchasePrice: true, salePrice: true, unit: true },
      });
      let purchaseRial = 0;
      let saleRial = 0;
      const rows: Array<{ name: string; qty: number; pv: number }> = [];
      for (const p of products) {
        const qty = qtyByProduct.get(p.id) ?? 0;
        const pv = qty * Number(p.purchasePrice);
        const sv = qty * Number(p.salePrice);
        purchaseRial += pv;
        saleRial += sv;
        rows.push({ name: p.name, qty, pv });
      }
      rows.sort((a, b) => b.pv - a.pv);
      const topLines = rows.slice(0, 5).map(
        (r) => `- ${r.name}: ${toPersianDigits(formatNumber(r.qty, 2))} عدد — ارزش خرید ${fmtToman(Math.floor(r.pv / 10))}`
      );
      const text =
        `### ارزش موجودی انبار\n\n` +
        `- **ارزش به خرید (بهای تمام‌شده):** ${fmtToman(Math.floor(purchaseRial / 10))}\n` +
        `- **ارزش به فروش (پتانسیل درآمد):** ${fmtToman(Math.floor(saleRial / 10))}\n` +
        `- **سود بالقوهٔ فروش موجودی:** ${fmtToman(Math.floor((saleRial - purchaseRial) / 10))}\n` +
        `- کالای دارای موجودی مثبت: ${toPersianDigits(products.length)} قلم\n\n` +
        (topLines.length ? `**باارزش‌ترین اقلام:**\n${topLines.join("\n")}` : "");
      return { text, followUps: ["کالاهای کم حرکت رو نشون بده", "گزارش سود این ماه"] };
    },
  },
  // ─── Task 3-B: کالاهای کم‌حرکت ───
  {
    id: "data:slow-stock",
    match: (t) =>
      /(کم\s*حرکت|کمحرکت|بی\s*حرکت|بیهحرکت|رکد|حرکت\s*نکرده|کالای\s*کم\s*فروش|کالاهای\s*کم\s*فروش)/.test(t),
    run: async (tenantId) => {
      const daysThreshold = 45;
      const [stockAgg, movements] = await Promise.all([
        db.stockItem.groupBy({ by: ["productId"], where: { tenantId }, _sum: { quantity: true } }),
        db.stockMovement.groupBy({ by: ["productId"], where: { tenantId }, _max: { date: true } }),
      ]);
      const qtyMap = new Map<string, number>();
      for (const s of stockAgg) {
        const q = s._sum.quantity ?? 0;
        if (q > 0) qtyMap.set(s.productId, q);
      }
      if (qtyMap.size === 0) {
        return {
          text: "هیچ کالایی موجودی مثبت ندارد — کالاهای کم‌حرکت معنا ندارد.",
          followUps: ["چند کالا دارم؟", "ارزش انبارم چقدره؟"],
        };
      }
      const lastMoveMap = new Map(
        movements.map((m) => [m.productId, m._max.date ?? null] as [string, Date | null])
      );
      const products = await db.product.findMany({
        where: { id: { in: Array.from(qtyMap.keys()) }, tenantId, deletedAt: null },
        select: { id: true, name: true, sku: true, purchasePrice: true },
      });
      const now = Date.now();
      const rows = products
        .map((p) => {
          const last = lastMoveMap.get(p.id) ?? null;
          const daysIdle = last ? Math.floor((now - last.getTime()) / 86_400_000) : null;
          return { p, last, daysIdle, qty: qtyMap.get(p.id) ?? 0 };
        })
        .filter((r) => r.daysIdle === null || r.daysIdle >= daysThreshold)
        .sort((a, b) => (b.daysIdle ?? Number.MAX_SAFE_INTEGER) - (a.daysIdle ?? Number.MAX_SAFE_INTEGER))
        .slice(0, 12);
      if (rows.length === 0) {
        return {
          text: `هیچ کالایی با موجودی مثبت که بیش از ${toPersianDigits(daysThreshold)} روز حرکت نداشته باشد پیدا نشد — انبار پویاست.`,
          followUps: ["ارزش انبارم چقدره؟", "پرفروش‌ترین کالاها کجان؟"],
        };
      }
      const lines = rows.map(
        (r) =>
          `- **${r.p.name}** — موجودی ${toPersianDigits(formatNumber(r.qty, 2))} · آخرین حرکت: ${
            r.last ? `${toJalali(r.last)} (${toPersianDigits(r.daysIdle ?? 0)} روز پیش)` : "هیچ وقت (بدون حرکت)"
          } · ارزش خرید ${fmtToman(Math.floor((r.qty * Number(r.p.purchasePrice)) / 10))}`
      );
      const totalStuck = rows.reduce((s, r) => s + (r.qty * Number(r.p.purchasePrice)) / 10, 0);
      const text =
        `### کالاهای کم‌حرکت (${toPersianDigits(rows.length)} قلم)\n\n` +
        lines.join("\n") +
        `\n\n- **سرمایهٔ خوابیده در این اقلام:** ${fmtToman(Math.floor(totalStuck))}\n` +
        `- برای آزادسازی نقد، تخفیف/بسته‌ای‌فروشی پیشنهاد می‌کنم — بگویید «۲۰ درصد تخفیف روی [نام کالا] بذار» تا قیمت را کم کنم.`;
      return { text, followUps: ["۲۰ درصد تخفیف روی شیر بذار", "ارزش انبارم چقدره؟"] };
    },
  },
  // ─── Task 3-B: پرفروش‌ترین کالاها ───
  {
    id: "data:top-products",
    match: (t) =>
      /(پرفروش|پر\s*فروش|پرتکرار|بیشترین\s*فروش|محبوب\s*ترین\s*(کالا|محصول)|top\s*products)/.test(t) &&
      !isHowDoIQuestion(t),
    run: async (tenantId, t) => {
      const period = extractPeriod(t);
      const range = periodRange(period);
      const dateFilter: { gte?: Date; lt?: Date } = {};
      if (range.start) dateFilter.gte = range.start;
      if (range.end) dateFilter.lt = range.end;
      const hasRange = Boolean(range.start);
      const items = await db.invoiceItem.findMany({
        where: {
          productId: { not: null },
          invoice: {
            tenantId,
            type: "SALE",
            deletedAt: null,
            status: { notIn: ["DRAFT", "CANCELLED", "RESERVED"] },
            ...(hasRange ? { date: dateFilter } : {}),
          },
        },
        select: { productId: true, quantity: true, total: true },
        take: 5000,
      });
      if (items.length === 0) {
        return {
          text: `در ${range.label} فروشی ثبت نشده تا پرفروش‌ها را ببینم.`,
          followUps: ["فروش این ماه چقدره؟", "بهترین مشتری کیه؟"],
        };
      }
      const agg = new Map<string, { qty: number; revenue: number }>();
      for (const it of items) {
        const pid = it.productId ?? "";
        const cur = agg.get(pid) ?? { qty: 0, revenue: 0 };
        cur.qty += it.quantity;
        cur.revenue += rialToToman(it.total);
        agg.set(pid, cur);
      }
      const top = Array.from(agg.entries()).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 8);
      const products = await db.product.findMany({
        where: { id: { in: top.map(([pid]) => pid) }, tenantId, deletedAt: null },
        select: { id: true, name: true, sku: true },
      });
      const pMap = new Map(products.map((p) => [p.id, p] as [string, typeof p]));
      const lines = top.map(
        ([pid, v], i) =>
          `${toPersianDigits(i + 1)}. **${pMap.get(pid)?.name ?? "کالای حذف‌شده"}** — ${fmtToman(v.revenue)} (${toPersianDigits(formatNumber(v.qty, 2))} عدد فروخته شده)`
      );
      const text =
        `### پرفروش‌ترین کالاها (${range.label})\n\n` +
        lines.join("\n") +
        `\n\n_ترتیب بر اساس مبلغ فروش؛ اقلام پیش‌نویس/باطل/رزرو لحاظ نمی‌شوند._`;
      return { text, followUps: ["موجودی انبار رو نشون بده", "گزارش سود این ماه"] };
    },
  },
  // ─── Task 3-B: تعداد طرف‌حساب‌ها ───
  {
    id: "data:party-count",
    match: (t) =>
      /(چند\s*(تا\s*)?(مشتری|طرف\s*حساب|تأمین\s*کننده|تامین\s*کننده|فروشنده)|تعداد\s*(مشتری|طرف\s*حساب|پرسنل)|لیست\s*مشتری)/.test(t) &&
      !isHowDoIQuestion(t),
    run: async (tenantId) => {
      const [customers, suppliers, recent] = await Promise.all([
        db.party.count({ where: { tenantId, deletedAt: null, type: { in: ["CUSTOMER", "BOTH"] } } }),
        db.party.count({ where: { tenantId, deletedAt: null, type: { in: ["SUPPLIER", "BOTH"] } } }),
        db.party.findMany({
          where: { tenantId, deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { name: true, type: true, createdAt: true },
        }),
      ]);
      const text =
        `### طرف‌حساب‌های شما\n\n` +
        `- مشتریان: ${toPersianDigits(customers)} نفر\n` +
        `- تأمین‌کنندگان: ${toPersianDigits(suppliers)} مورد\n\n` +
        (recent.length
          ? `**جدیدترین‌ها:**\n${recent.map((p) => `- ${p.name} (${p.type === "SUPPLIER" ? "تأمین‌کننده" : "مشتری"})`).join("\n")}`
          : "هنوز طرف‌حسابی ثبت نشده — بگویید «مشتری جدید بساز» تا فرم باز شود.");
      return { text, followUps: ["بهترین مشتری کیه؟", "مشتری جدید بساز"] };
    },
  },
  // ─── ارزش افزودهٔ دوره ───
  {
    id: "data:vat-summary",
    match: (t) =>
      /(ارزش\s*افزوده|مالیات\s*(فروش|خرید)|\bvat\b)/.test(t) &&
      /(چقدر|چند|این ماه|امسال|گزارش|بدم|شدم|محاسبه\s*کن|مانده)/.test(t) &&
      !isConceptualQuestion(t) &&
      !/(نرخ|معاف)/.test(t),
    run: async (tenantId, t) => {
      const period = extractPeriod(t);
      const range = periodRange(period);
      const dateFilter: { gte?: Date; lt?: Date } = {};
      if (range.start) dateFilter.gte = range.start;
      if (range.end) dateFilter.lt = range.end;
      const [outAgg, inAgg] = await Promise.all([
        db.invoice.aggregate({
          where: {
            tenantId,
            type: "SALE",
            deletedAt: null,
            status: { in: FINAL_STATUSES },
            ...(range.start || range.end ? { date: dateFilter } : {}),
          },
          _sum: { tax: true, subtotal: true },
        }),
        db.invoice.aggregate({
          where: {
            tenantId,
            type: "PURCHASE",
            deletedAt: null,
            status: { in: FINAL_STATUSES },
            ...(range.start || range.end ? { date: dateFilter } : {}),
          },
          _sum: { tax: true, subtotal: true },
        }),
      ]);
      const outT = rialToToman(outAgg._sum?.tax ?? null);
      const inT = rialToToman(inAgg._sum?.tax ?? null);
      const dueT = outT - inT;
      const text =
        `### مالیات ارزش افزودهٔ ${range.label}\n\n` +
        `| شرح | مبلغ (تومان) |\n| --- | --- |\n` +
        `| مالیات فروش (بایستانی) | ${toPersianDigits(formatNumber(outT))} |\n` +
        `| مالیات خرید (اعتبار قابل کسر) | ${toPersianDigits(formatNumber(inT))} |\n` +
        `| **ماندهٔ قابل پرداخت** | **${toPersianDigits(formatNumber(Math.max(0, dueT)))}** |\n\n` +
        (dueT < 0
          ? `- اعتبار مالیاتی شما از مالیات فروش بیشتر است؛ مازاد (${fmtToman(-dueT)}) به دوره‌های بعد منتقل می‌شود.\n`
          : "") +
        `- پایهٔ فروش مشمول: ${fmtToman(rialToToman(outAgg._sum?.subtotal ?? null))}\n` +
        `- یادآوری: مهلت ثبت اظهارنامه و پرداخت تا **۱۵ روز پس از پایان ${range.label}** است.`;
      return {
        text,
        followUps: ["نرخ ارزش افزوده چنده؟", "معافیت های ارزش افزوده چیان؟", "گزارش سود این ماه"],
      };
    },
  },
  // ─── Task 3-B: شاخص‌های کلی (آخرین ابزار — عام‌ترین) ───
  {
    id: "data:kpis",
    match: (t) =>
      /(شاخص|kpi|خلاصه\s*وضعیت|وضعیت\s*(مالی|کلی|حساب)|خلاصه\s*مالی|عملکرد\s*(من|کسب|سال)|نتیجه\s*این\s*ماه)/.test(t) &&
      !isConceptualQuestion(t) &&
      !isHowDoIQuestion(t),
    run: async (tenantId, t) => {
      const period = extractPeriod(t);
      const range = periodRange(period);
      const dateFilter: { gte?: Date; lt?: Date } = {};
      if (range.start) dateFilter.gte = range.start;
      if (range.end) dateFilter.lt = range.end;
      const hasRange = Boolean(range.start);
      const finalOnly = { notIn: ["DRAFT", "CANCELLED", "RESERVED"] };
      const [salesAgg, purchAgg, expAgg, receivableAgg, payableAgg, bankAgg] = await Promise.all([
        db.invoice.aggregate({ where: { tenantId, type: "SALE", deletedAt: null, status: finalOnly, ...(hasRange ? { date: dateFilter } : {}) }, _sum: { total: true }, _count: { id: true } }),
        db.invoice.aggregate({ where: { tenantId, type: "PURCHASE", deletedAt: null, status: finalOnly, ...(hasRange ? { date: dateFilter } : {}) }, _sum: { total: true } }),
        db.expenseEntry.aggregate({ where: { tenantId, type: "EXPENSE", ...(hasRange ? { date: dateFilter } : {}) }, _sum: { amount: true } }),
        db.invoice.aggregate({ where: { tenantId, type: "SALE", deletedAt: null, status: { in: OPEN_STATUSES } }, _sum: { total: true, paidAmount: true } }),
        db.invoice.aggregate({ where: { tenantId, type: "PURCHASE", deletedAt: null, status: { in: OPEN_STATUSES } }, _sum: { total: true, paidAmount: true } }),
        db.bankAccount.aggregate({ where: { tenantId, deletedAt: null }, _sum: { balance: true } }),
      ]);
      const salesT = rialToToman(salesAgg._sum?.total ?? null);
      const purchT = rialToToman(purchAgg._sum?.total ?? null);
      const expT = rialToToman(expAgg._sum?.amount ?? null);
      const profit = salesT - purchT - expT;
      const receivable = Math.max(0, rialToToman(receivableAgg._sum?.total ?? null) - rialToToman(receivableAgg._sum?.paidAmount ?? null));
      const payable = Math.max(0, rialToToman(payableAgg._sum?.total ?? null) - rialToToman(payableAgg._sum?.paidAmount ?? null));
      const margin = salesT > 0 ? (profit / salesT) * 100 : 0;
      const text =
        `### شاخص‌های مالی — ${range.label}\n\n` +
        `| شاخص | مقدار |\n| --- | --- |\n` +
        `| فروش (فاکتورهای قطعی) | ${fmtToman(salesT)} |\n` +
        `| خرید | ${fmtToman(purchT)} |\n` +
        `| هزینه‌ها | ${fmtToman(expT)} |\n` +
        `| **سود (زیان) خالص** | **${fmtToman(profit)}** |\n` +
        `| حاشیهٔ سود | ${toPersianDigits(formatNumber(margin, 1))}٪ |\n` +
        `| تعداد فاکتور فروش | ${toPersianDigits(salesAgg._count?.id ?? 0)} فقره |\n\n` +
        `**موضوعیت نقدی:**\n` +
        `- مطالبات وصول‌نشده: ${fmtToman(receivable)}\n` +
        `- بدهی‌های پرداخت‌نشده: ${fmtToman(payable)}\n` +
        `- موجودی حساب‌های بانکی: ${fmtToman(rialToToman(bankAgg._sum?.balance ?? null))}\n\n` +
        `_سود = فروش − خرید − هزینه‌ها؛ برای تحلیل عمیق‌تر بگویید «گزارش سود» یا «جریان نقدی»._`;
      return { text, followUps: ["گزارش سود این ماه", "مطالبات و بدهی‌هایم چقدره؟", "جریان نقدی این ماه"] };
    },
  },
];

// ============ Task 3-B — رجیستری جهش‌ها + اجرای مستقیم ============

/** ابزارهای «ثبت/تغییر» — در گام ۳.۵ خط لوله، این‌ها از ابزارهای داده جلو می‌زنند */
const V2_MUTATION_TOOLS = new Set([
  "create_invoice",
  "create_credit_invoice",
  "reserve_invoice",
  "edit_invoice",
  "record_payment",
  "record_party_payment",
  "create_expense",
  "add_customer",
  "add_product",
  "update_product_price",
  "adjust_stock",
  "set_product_discount",
  "create_reminder",
  "void_invoice_draft",
]);

/** اجرای یک TOOL_CALL سنتزی با همان پیاده‌سازی‌های واقعی ایجنت (lib/ai-actions).
 *  خروجی هم‌شکل نتایج حلقهٔ ابزار agent-chat است تا formatOfflineReply رندرش کند.
 *  برمی‌گرداند null یعنی ابزار ناشناخته بود. */
export async function executeOfflineToolCall(
  tenantId: string,
  userId: string | undefined,
  call: OfflineToolCall,
  req?: NextRequest
): Promise<{ tool: string; result: Record<string, unknown> } | null> {
  const args = call.args ?? {};
  switch (call.tool) {
    case "create_invoice": {
      const outcome = await createInvoiceAction(tenantId, userId, args, req);
      return { tool: call.tool, result: outcome.ok ? { created: true, invoice: outcome.data } : { created: false, error: outcome.error } };
    }
    case "create_credit_invoice": {
      const outcome = await createCreditInvoiceAction(tenantId, userId, args, req);
      return { tool: call.tool, result: outcome.ok ? { created: true, credit: true, invoice: outcome.data } : { created: false, error: outcome.error } };
    }
    case "reserve_invoice": {
      const outcome = await reserveInvoiceAction(tenantId, userId, args, req);
      return { tool: call.tool, result: outcome.ok ? { created: true, reserved: true, invoice: outcome.data } : { created: false, error: outcome.error } };
    }
    case "edit_invoice": {
      const outcome = await editInvoiceAction(tenantId, userId, args, req);
      return { tool: call.tool, result: outcome.ok ? { updated: true, invoice: outcome.data } : { updated: false, error: outcome.error } };
    }
    case "create_expense": {
      const outcome = await createExpenseAction(tenantId, userId, args, req);
      return { tool: call.tool, result: outcome.ok ? { created: true, expense: outcome.data } : { created: false, error: outcome.error } };
    }
    case "add_customer": {
      const outcome = await addCustomerAction(tenantId, userId, args, req);
      const d = outcome.data ?? {};
      return {
        tool: call.tool,
        result: outcome.ok
          ? { created: !d.existing, existing: Boolean(d.existing), party: outcome.data }
          : { created: false, error: outcome.error },
      };
    }
    case "add_product": {
      const outcome = await addProductAction(tenantId, userId, args, req);
      const d = outcome.data ?? {};
      return {
        tool: call.tool,
        result: outcome.ok
          ? { created: !d.existing, existing: Boolean(d.existing), product: outcome.data }
          : { created: false, error: outcome.error },
      };
    }
    case "record_payment": {
      const invoiceNumber = String(args.invoiceNumber ?? args.number ?? "").trim();
      const amount = Number(args.amount ?? 0);
      const invoice = invoiceNumber ? await lookupInvoiceByNumber(tenantId, invoiceNumber) : null;
      if (!invoice) {
        return { tool: call.tool, result: { created: false, error: `فاکتوری با شماره ${invoiceNumber || "—"} یافت نشد` } };
      }
      const outcome = await recordPaymentAction(tenantId, userId, { invoiceId: invoice.id, amount }, req);
      return { tool: call.tool, result: outcome.ok ? { created: true, payment: outcome.data } : { created: false, error: outcome.error } };
    }
    case "record_party_payment": {
      const outcome = await recordPartyPaymentAction(tenantId, userId, args, req);
      return { tool: call.tool, result: outcome.ok ? { created: true, payment: outcome.data } : { created: false, error: outcome.error } };
    }
    case "adjust_stock": {
      const outcome = await adjustStockAction(tenantId, userId, args, req);
      const d = outcome.data ?? {};
      return {
        tool: call.tool,
        result: outcome.ok
          ? { updated: true, stockAdjusted: true, stockMoved: d.changed === true, product: outcome.data }
          : { updated: false, error: outcome.error },
      };
    }
    case "update_product_price": {
      const outcome = await updateProductPriceAction(tenantId, userId, args, req);
      return { tool: call.tool, result: outcome.ok ? { updated: true, product: outcome.data } : { updated: false, error: outcome.error } };
    }
    case "set_product_discount": {
      const outcome = await setProductDiscountAction(tenantId, userId, args, req);
      return { tool: call.tool, result: outcome.ok ? { updated: true, product: outcome.data } : { updated: false, error: outcome.error } };
    }
    case "create_reminder": {
      const outcome = await createReminderAction(tenantId, userId, args, req);
      return { tool: call.tool, result: outcome.ok ? { created: true, reminder: outcome.data } : { created: false, error: outcome.error } };
    }
    case "void_invoice_draft": {
      const outcome = await voidInvoiceDraftAction(tenantId, userId, args, req);
      return { tool: call.tool, result: outcome.ok ? { updated: true, voided: true, invoice: outcome.data } : { updated: false, error: outcome.error } };
    }
    default:
      return null;
  }
}

/** اجرای یک ابزار دادهٔ v2 با شناسه — برای پاسخ محلی به کوئری‌های parser v1 */
export async function runV2DataToolById(
  tenantId: string,
  id: string,
  t: string
): Promise<{ text: string; followUps?: string[] } | null> {
  const tool = DATA_TOOLS.find((x) => x.id === id);
  if (!tool) return null;
  try {
    return await tool.run(tenantId, t);
  } catch (err) {
    console.error(`[offline-agent-v2] runDataToolById '${id}' error:`, err);
    return null;
  }
}

// ============ ۱) smalltalk ============

function trySmalltalk(raw: string): { text: string; followUps: string[] } | null {
  const t = normalizeFaText(raw);
  if (!t) return null;
  const short = t.length <= 40;

  // قابلیت‌ها — مهم‌ترین پرسش
  if (/(چه کارهایی می توانی|چه کارهایی میتوانی|چه کارهایی میتونه|چه کارهایی می تونه|چه کارهایی می تواند|چه کارهایی میتواند|چیکار می تونی|چیکار میتونی|چه کارهات|قابلیت هایات|قابلیت هات|دستورات|چه دستوراتی|راهنمای کامل|دستور العمل|دستورالعمل|چیا می تونی|چیا میتونی|چی بلدی)/.test(t)) {
    return {
      text:
        `### من همهٔ این کارها را می‌کنم — بدون اینترنت و روی دادهٔ واقعی خودتان:\n\n` +
        `**اجرای دستور:**\n` +
        `- «فاکتور جدید بساز» / «فاکتور جدید برای علی بساز»\n` +
        `- «کالای جدید بساز» / «مشتری جدید بساز»\n` +
        `- «برو به انبار» / «گزارش‌ساز رو باز کن»\n\n` +
        `**خواندن دادهٔ واقعی:**\n` +
        `- «چند کالا دارم؟» / «موجودی شیر چنده؟» / «قیمت شیر چند؟»\n` +
        `- «فروش این ماه؟» / «گزارش سود» / «ارزش افزودهٔ این ماه؟»\n` +
        `- «بهترین مشتری کیه؟» / «بدهی علی چقدره؟» / «قیمت دلار و طلا؟»\n\n` +
        `**دانش حسابداری و مالیات (${toPersianDigits(KNOWLEDGE_FA_COUNT)} موضوع):**\n` +
        `- «نقطهٔ سربه‌سر یعنی چی؟» / «نرخ ارزش افزوده چنده؟»\n` +
        `- «حقوق چطور محاسبه می‌شه؟» / «استهلاک چیه؟» / «چک و سفته چه فرقی دارن؟»\n\n` +
        `**ماشین‌حساب:**\n` +
        `- «۱۲ درصد ۴۵۰۰۰۰ چنده؟» / «سود ۳۰ درصد روی ۲ میلیون»\n\n` +
        `برای ثبت واقعی فاکتور/هزینه/کالا با اقلام و مبالغ، همان دستور کامل را بفرستید تا در دفاتر ثبت شود.`,
      followUps: ["چند کالا دارم؟", "گزارش سود این ماه", "نقطه سربه سر یعنی چی؟"],
    };
  }

  if (short && /^(سلام|درود|هی|hello|hi|سلم)(\s|$|\.|!)/.test(t)) {
    return {
      text:
        `سلام! من **هوش‌یار** هستم — دستیار حسابداری شما.\n\n` +
        `بدون اینترنت هم کار می‌کنم و روی دادهٔ واقعی کسب‌وکار شما اجرا می‌شوم. یک دستور بدهید یا یک سوال بپرسید — مثلاً «چند کالا دارم؟» یا «نقطهٔ سربه‌سر یعنی چی؟».`,
      followUps: ["دستیار چه کارهایی میتونه بکنه؟", "فروش این ماه چقدره؟", "نرخ ارزش افزوده چنده؟"],
    };
  }

  if (short && /(تو کی هستی|تو چی هستی|اسمت چیه|چه کسی هستی|خودتو معرفی)/.test(t)) {
    return {
      text:
        `من **هوش‌یار** هستم؛ دستیار حسابداری حرفه‌ای نرم‌افزار «هوش».\n\n` +
        `- بدون هیچ پیکربندی و اینترنت پاسخ می‌دهم (موتور محلی)\n` +
        `- دستورها را روی دادهٔ واقعی شما اجرا می‌کنم\n` +
        `- ${toPersianDigits(KNOWLEDGE_FA_COUNT)} موضوع تخصصی حسابداری/مالیات ایران را بلدم\n` +
        `بگویید «دستیار چه کارهایی می‌تونه بکنه؟» تا فهرست کامل را ببینید.`,
      followUps: ["دستیار چه کارهایی میتونه بکنه؟", "چند کالا دارم؟"],
    };
  }

  if (short && /(ممنون|مرسی|متشکر|تشکر|سپاس|دمت گرم)/.test(t)) {
    return {
      text: "خواهش می‌کنم — در خدمت شما هستم. کار دیگری هم دارید؟ همین‌جا دستور بدهید.",
      followUps: ["گزارش سود این ماه", "چند کالا دارم؟"],
    };
  }

  if (short && /(چطوری|خوبی|حالت چطوره|چه خبر)/.test(t)) {
    return {
      text:
        `عالی‌ام — موتور محلی روشن است و داده‌های شما آمادهٔ خواندن!\n\n` +
        `بگویید چه کاری انجام دهم: گزارش، محاسبه یا ثبت.`,
      followUps: ["وضعیت مالی این ماه", "فروش این ماه چقدره؟"],
    };
  }

  if (short && /(خداحافظ|بای بای|خدانگهدار|فعلا)/.test(t)) {
    return {
      text: "خدانگهدار! هر وقت لازم شد همین‌جا هستم — دستیار همیشه در دسترس است (دکمهٔ دستیار در همهٔ ماژول‌ها).",
      followUps: [],
    };
  }
  return null;
}

// ============ موتور اصلی ============

/**
 * خط لولهٔ موتور آفلاین v2 — null یعنی «تطبیق مطمئن نبود» و فراخوان باید
 * به موتور LLM یا fallback برود.
 */
export async function runOfflineAssistantV2(tenantId: string, rawText: string): Promise<OfflineV2Result | null> {
  const text = String(rawText || "").trim();
  if (!text) return null;
  const t = normalizeFaText(text);

  // ۱) smalltalk
  const small = trySmalltalk(text);
  if (small) {
    return { matched: "smalltalk", text: small.text, followUps: small.followUps };
  }

  // Task 3-B — سوال «چطور انجامش بدهم؟» (فعل اول‌شخص) فرمان نیست؛
  // ابزارهای فرمان/جهش نگیرندش تا به راهنما/دانش‌نامه برسد.
  const howDoI = isHowDoIQuestion(t);

  // ۲) ابزارهای فرمان (اکشن) — فقط برای فرمان واقعی
  if (!howDoI) {
    for (const cmd of COMMAND_TOOLS) {
      const action = cmd.match(t);
      if (action) {
        let text2: string;
        switch (action.type) {
          case "new-invoice":
            text2 =
              `فرم **فاکتور ${action.invoiceType === "PURCHASE" ? "خرید" : "فروش"} جدید** را برایتان باز می‌کنم.` +
              (action.partyName ? ` طرف‌حساب «**${action.partyName}**» از قبل در فرم انتخاب شده است.` : "") +
              `\n\nاگر اقلام و مبالغ را همین‌جا بگویید (مثلاً «۲ تا شیر ۵۰ هزار»)، خودم فاکتور را کامل و نهایی ثبت می‌کنم.`;
            break;
          case "new-product":
            text2 =
              `فرم **کالای جدید** را در انبار باز می‌کنم.\n\nاگر مشخصات را بگویید (نام، قیمت فروش، قیمت خرید، واحد)، خودم ثبتش می‌کنم — مثلاً: «کالای شیر با قیمت فروش ۵۰ هزار بساز».`;
            break;
          case "new-party":
            text2 =
              `فرم **مشتری جدید** را باز می‌کنم.\n\nبا مشخصات کامل هم می‌توانید بگویید: «مشتری کوییک مارکت با موبایل ۰۹۱۲... اضافه کن» تا خودم ثبت کنم.`;
            break;
          case "open-report":
            text2 = `**گزارش‌ساز** را باز می‌کنم — داشبورد مدیریتی، تراز آزمایشی، دفاتر قانونی و گزارش‌های کشیدن‌ورهاکردن همان‌جاست.`;
            break;
          default:
            text2 = `به **${action.label.replace(/^رفتن به /, "")}** منتقل می‌شوید.`;
        }
        return {
          matched: cmd.id,
          text: text2,
          action,
          followUps:
            action.type === "new-invoice"
              ? ["۲ تا شیر ۵۰ هزار برای مشتری نمونه بزن", "فروش این ماه چقدره؟"]
              : action.type === "new-product"
                ? ["کالای شیر با قیمت فروش ۵۰ هزار بساز", "چند کالا دارم؟"]
                : ["چند کالا دارم؟", "گزارش سود این ماه"],
        };
      }
    }
  }

  // ۳) ماشین‌حساب
  const math = tryMathQuestion(text);
  if (math) {
    return { matched: "math", text: math.text, followUps: math.followUps };
  }

  // ۳.۵) Task 3-B — اولویت جهش بر خواندن:
  // قبل از ابزارهای داده، متن از parser v1 عبور می‌کند؛ اگر دستور ثبت/تغییر
  // بود همان TOOL_CALL سنتزی برگردانده می‌شود تا فراخوان آن را واقعاً اجرا کند.
  // ریشهٔ باگ: «موجودی نان تست رو ۵ تا کن» به‌جای adjust_stock به کارت کالا می‌افتاد.
  if (!howDoI) {
    try {
      const intent = offlineParseIntent(text);
      const primaryTool = intent?.primary?.tool ?? null;
      if (
        primaryTool &&
        V2_MUTATION_TOOLS.has(primaryTool) &&
        !intent.isHelpQuestion &&
        !intent.help
      ) {
        return {
          matched: `mutation:${primaryTool}`,
          text: "",
          toolCall: intent.primary!,
          intent,
        };
      }
    } catch (intentErr) {
      console.error("[offline-agent-v2] parse-intent (mutation step) error:", intentErr);
    }
  }

  // ۳.۷) Task 3-B-۱۱: پیام مشورتی/تحلیلی («سودم رو چطور بیشتر کنم؟»، «پیشنهاد
  // بده») را ابزارهای گزارش‌محور نباید با یک گزارش چندخطی جواب بدهند؛ به
  // دانش‌نامه/LLM واگذار می‌شود (در /api/ai/chat علاوه بر این LLM-first هم فعال است).
  const advisory =
    /(چطور|چگونه).*(بیشتر|کمتر|بهتر|افزایش|کاهش|رشد)|(پیشنهاد|استراتژی|راه حل|راهکار|توصیه|چه باید بکنم|چی باید بکنم|چکار کنم|چیکار کنم)/.test(
      t
    ) && !/(ثبت کن|بزن|بساز|اضافه کن|درج کن|ذخیره کن|بذار)/.test(t);

  // ۴) ابزارهای داده
  if (!advisory) {
    for (const tool of DATA_TOOLS) {
      if (tool.match(t)) {
        try {
          const res = await tool.run(tenantId, t);
          return { matched: tool.id, text: res.text, ...(res.action ? { action: res.action } : {}), ...(res.followUps ? { followUps: res.followUps } : {}) };
        } catch (err) {
          console.error(`[offline-agent-v2] tool '${tool.id}' error:`, err);
          // خطای ابزار → ادامه به دانش‌نامه/غیره (نه کرش کل موتور)
        }
      }
    }
  }

  // ۵) دانش‌نامهٔ حسابداری
  const knowledge = matchKnowledgeFa(text);
  if (knowledge) {
    return {
      matched: `knowledge:${knowledge.id}`,
      text: `### ${knowledge.title}\n\n${knowledge.answer}`,
      followUps: ["نقطه سربه سر یعنی چی؟", "نرخ ارزش افزوده چنده؟", "گزارش سود این ماه"],
    };
  }

  return null;
}

// ============ ۶) fallback هوشمند — ۶ پیشنهاد data-aware ============

/** ساخت ۶ پیشنهاد بر اساس دادهٔ واقعی tenant (چه چیزی دارد → چه چیزی بپرسد) */
export async function offlineFallbackSuggestions(tenantId: string): Promise<string[]> {
  try {
    const [products, parties, invoices, expenses, rates] = await Promise.all([
      db.product.count({ where: { tenantId, deletedAt: null } }),
      db.party.count({ where: { tenantId, deletedAt: null } }),
      db.invoice.count({ where: { tenantId, deletedAt: null, status: { in: FINAL_STATUSES } } }),
      db.expenseEntry.count({ where: { tenantId, type: "EXPENSE" } }),
      db.exchangeRate.count({ where: { toCurrency: "IRR" } }),
    ]);
    const suggestions: string[] = [];
    if (products > 0) suggestions.push("چند کالا دارم؟", "ارزش انبارم چقدره؟");
    if (invoices > 0) suggestions.push("فروش این ماه چقدره؟", "گزارش سود این ماه");
    if (parties > 0) suggestions.push("بهترین مشتری کیه؟");
    if (expenses > 0) suggestions.push("بزرگ‌ترین هزینه‌های این ماه چیان؟");
    if (rates > 0) suggestions.push("قیمت دلار چنده؟");
    // پر کردن تا ۶ — همیشه دستورهای همه‌کاره هم پیشنهاد می‌شوند
    const knowledgeFill = [
      "نقطه سربه سر یعنی چی؟",
      "نرخ ارزش افزوده چنده؟",
      "دستیار چه کارهایی میتونه بکنه؟",
      "فاکتور جدید بساز",
      "چند کالا دارم؟",
      "فروش این ماه چقدره؟",
      "قیمت دلار چنده؟",
      "بهترین مشتری کیه؟",
    ];
    for (const k of knowledgeFill) {
      if (suggestions.length >= 6) break;
      if (!suggestions.includes(k)) suggestions.push(k);
    }
    return suggestions.slice(0, 6);
  } catch {
    return [
      "دستیار چه کارهایی میتونه بکنه؟",
      "چند کالا دارم؟",
      "فروش این ماه چقدره؟",
      "نقطه سربه سر یعنی چی؟",
      "نرخ ارزش افزوده چنده؟",
      "فاکتور جدید بساز",
    ];
  }
}

/**
 * متن fallback کامل برای مسیر آفلاین /api/ai/chat وقتی نه LLM در دسترس است
 * و نه موتور v2 تطبیق مطمئنی داشت.
 * Task 3-B — این تابع دیگر بن‌بست «دکمهٔ ایجنت را روشن کنید» نیست:
 *   ۱) اگر دستور ثبت قابل‌اجرایی بود (parser v1 می‌شناسدش) همان‌جا با
 *      پیاده‌سازی‌های واقعی ایجنت (lib/ai-actions) اجرا و قالب‌بندی می‌شود؛
 *   ۲) اگر سوال داده‌ای بود و ابزار دادهٔ v2 معادل داشت، همان پاسخ محلی برمی‌گردد؛
 *   ۳) فقط اگر واقعاً اجرا ممکن نبود، کارت راهنما/پیشنهادها می‌آید.
 */
export async function buildOfflineFallbackReply(
  tenantId: string,
  rawText: string,
  tenantName?: string,
  userId?: string,
  req?: NextRequest
): Promise<string> {
  const suggestions = await offlineFallbackSuggestions(tenantId);
  const parts: string[] = [];

  const intent = offlineParseIntent(rawText);
  const help = (intent as { help?: OfflineHelpCard | null }).help ?? null;
  const primaryTool = (intent as { primary?: { tool?: string } | null }).primary?.tool ?? null;
  const primaryCall = (intent as { primary?: OfflineToolCall | null }).primary ?? null;

  // ── ۱) اجرای مستقیم دستور ثبت (همان موتور ایجنت — بدون LLM) ──
  if (primaryTool && primaryCall && V2_MUTATION_TOOLS.has(primaryTool) && !intent.isHelpQuestion && !help) {
    try {
      const executed = await executeOfflineToolCall(tenantId, userId, primaryCall, req);
      if (executed) {
        // نتایج واقعی + قالب‌بندی غنی همان حلقهٔ ایجنت (بلوک «در دفاتر چه گذشت»)
        return formatOfflineReply(intent, [executed], { tenantName });
      }
    } catch (execErr) {
      console.error("[offline-agent-v2] fallback mutation execute error:", execErr);
    }
    // اجرا ممکن نشد — راهنمای صادقانه (بدون ادعای کاذب «ثبت شد»)
    parts.push(
      `این پیام یک **دستور ثبت** است؛ در این لحظه موتور محلی نتوانست آن را در دفاتر اجرا کند.\n\n` +
        `- دوباره همان دستور را بفرستید (معمولاً بار دوم انجام می‌شود)\n` +
        `- یا ماژول مربوطه را از سایدبار باز کنید و دستی ثبت کنید`
    );
    parts.push(
      `این‌ها را هم می‌توانید از من بخواهید — روی دادهٔ واقعی شما:\n\n` +
        suggestions.map((s) => `- ${s}`).join("\n")
    );
    parts.push(`*پاسخ از **موتور محلی هوش‌یار** ساخته شد — بدون API خارجی و بدون اینترنت.*`);
    return parts.join("\n\n");
  }

  // ── ۲) سوال داده‌ای → ابزار دادهٔ v2 معادل (اگر باشد) پاسخ محلی می‌دهد ──
  if (primaryTool && !intent.isHelpQuestion && !help) {
    const v2ToolId = QUERY_TOOL_TO_V2[primaryTool];
    if (v2ToolId) {
      const local = await runV2DataToolById(tenantId, v2ToolId, rawText);
      if (local?.text) {
        return (
          local.text +
          `\n\n---\n*پاسخ از **موتور محلی هوش‌یار** ساخته شد — بدون API خارجی و بدون اینترنت.*`
        );
      }
    }
  }

  // ── ۳) کارت راهنمای ماژول (اگر سوال ناوبری بود) ──
  if (help) {
    const steps = help.steps.map((s, i) => `${toPersianDigits(i + 1)}. ${s}`).join("\n");
    parts.push(
      `### ${help.fa}\n\n${help.desc}\n\n- **کجاست:** ${help.where}\n\n**گام‌ها:**\n${steps}`
    );
    parts.push(
      `*پاسخ از **موتور محلی هوش‌یار** ساخته شد — بدون API خارجی و بدون اینترنت.*`
    );
    return parts.join("\n\n");
  }

  // ── ۴) غیر از این‌ها — پیشنهاد data-aware ──
  parts.push(
    `پیام شما را دریافت کردم؛ در موتور محلی پاسخ مستقیمی برایش پیدا نکردم.` +
      (tenantName ? ` (سازمان: ${tenantName})` : "")
  );

  parts.push(
    `این‌ها را هم می‌توانید از من بخواهید — روی دادهٔ واقعی شما:\n\n` +
      suggestions.map((s) => `- ${s}`).join("\n")
  );

  parts.push(
    `*پاسخ از **موتور محلی هوش‌یار** ساخته شد — بدون API خارجی و بدون اینترنت.*`
  );
  return parts.join("\n\n");
}

/** Task 3-B — نگاشت ابزارهای کوئری parser v1 → ابزار دادهٔ v2 (برای پاسخ محلی) */
const QUERY_TOOL_TO_V2: Record<string, string> = {
  query_kpis: "data:kpis",
  query_receivables_payables: "data:receivables-aging",
  query_credit_receivables: "data:overdue",
  query_cashflow: "data:cashflow",
  query_budget: "data:budget",
  query_wallet: "data:wallet",
  query_treasury: "data:treasury",
  query_modian: "data:modian",
  query_top_products: "data:top-products",
  query_top_customers: "data:best-customer",
  query_top_debtors: "data:top-debtors",
  query_expenses: "data:expenses-top",
  query_expense_breakdown: "data:expenses-top",
  query_profit_report: "data:profit-summary",
  query_profit_trend: "data:profit-trend",
  query_vat_summary: "data:vat-summary",
  query_currency: "data:rates",
  query_inventory_value: "data:inventory-value",
  query_slow_stock: "data:slow-stock",
  query_warehouse: "data:inventory-value",
  query_invoice_stats: "data:invoice-stats",
  query_party_balance: "data:party-balance",
};
