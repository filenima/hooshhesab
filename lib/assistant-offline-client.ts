"use client";

/**
 * ============ lib/assistant-offline-client.ts ============
 * پاسخ‌دهندهٔ آفلاین دستیار هوشمند — سمت کلاینت (بدون سرور)
 * ============================================================================
 * درخواست مالک: «دستیار هوشمند هم آفلاین کار کند — حتی ارور آفلاین هم نده»
 *
 * لایه‌ها (به‌ترتیب تلاش):
 *   ۱) ریاضی — ماشین‌حساب محلی (فرمول‌های فارسی)
 *   ۲) کش پرسش‌وپاسخ — پاسخ‌های موفق قبلی که از سرور آمده و ذخیره شده‌اند
 *   ۳) دانش‌نامهٔ داخلی — ~۳۰ پرسش متداول حسابداری هوش حساب
 *   ۴) پاسخ آرام — راهنمای محترمانه با پیشنهادها (هیچ‌وقت «خطا» نیست)
 *
 * + ذخیرهٔ پاسخ‌های موفق آنلاین برای استفادهٔ آفلاین بعدی (rememberAssistantQA)
 */

const QA_KEY = "hosh:assistant-qa-cache";
const QA_MAX = 60;

/* ─── نرمال‌سازی متن فارسی ─── */
export function normalizeFa(s: string): string {
  return String(s || "")
    .replace(/[\u064A\u0649]/g, "ی")
    .replace(/\u0643/g, "ک")
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/* ─── ذخیرهٔ پاسخ موفق برای آفلاین بعدی ─── */
export function rememberAssistantQA(question: string, answer: string) {
  try {
    const raw = localStorage.getItem(QA_KEY);
    const arr: { q: string; a: string; t: number }[] = raw ? JSON.parse(raw) : [];
    const norm = normalizeFa(question);
    const idx = arr.findIndex((x) => x.q === norm);
    const entry = { q: norm, a: answer, t: Date.now() };
    if (idx >= 0) arr[idx] = entry;
    else arr.push(entry);
    // حداکثر QA_MAX — قدیمی‌ها حذف
    while (arr.length > QA_MAX) arr.shift();
    localStorage.setItem(QA_KEY, JSON.stringify(arr));
  } catch {}
}

/* ─── امتیاز تشابه (هم‌پوشانی توکن) ─── */
function similarity(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter((w) => w.length > 1));
  const tb = new Set(b.split(" ").filter((w) => w.length > 1));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

/* ─── لایهٔ ۱: ماشین‌حساب (Task 3-B — چندعملوندی + درصد، هم‌الگوی سرور) ─── */

/** نرمال‌سازی ریاضی: ارقام فارسی/عربی + واژه‌های عملگر فارسی */
function normalizeMathClient(raw: string): string {
  return String(raw || "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٬،]/g, ",")
    .replace(/بعلاوه|به علاوه|جمع|plus/g, "+")
    .replace(/منهای|منها|minus/g, "-")
    .replace(/ضربدر|ضرب در|در ضرب/g, "*")
    .replace(/تقسیم بر|تقسیم|divide/g, "/")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/٪/g, "%")
    .replace(/\s+/g, " ")
    .trim();
}

/** تبدیل «۲ میلیون/۵۰۰ هزار» به عدد خام */
function applyUnitsClient(expr: string): string {
  return expr.replace(/(\d[\d,]*(?:\.\d+)?)\s*(میلیارد|میلیون|ملیون|هزار)/g, (_all, num: string, unit: string) => {
    let n = Number(num.replace(/,/g, ""));
    if (unit.includes("میلیارد")) n *= 1_000_000_000;
    else if (unit.includes("میلیون") || unit.includes("ملیون")) n *= 1_000_000;
    else if (unit.includes("هزار")) n *= 1_000;
    return String(n);
  });
}

/** ارزیابی امن — فقط ارقام/عملگرهای مجاز؛ حداقل ۲ عدد */
function safeEvalClient(expr: string): number | null {
  const clean = expr.replace(/,/g, "").replace(/\s+/g, "");
  if (!clean || !/^[\d+\-*/().]+$/.test(clean)) return null;
  if (!/[+\-*/]/.test(clean)) return null;
  const nums = clean.match(/\d+/g);
  if (!nums || nums.length < 2) return null;
  try {
    const value = Function(`"use strict"; return (${clean});`)() as unknown;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function faNum(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString("fa-IR")
    : n.toLocaleString("fa-IR", { maximumFractionDigits: 3 });
}

function tryMath(q: string): string | null {
  const t = normalizeMathClient(q);
  if (!t) return null;

  // ── الگوی ۱: «X درصد (از) Y» — «۱۲ درصد ۴۵۰۰۰۰ چنده؟» ──
  const m1 = t.match(/(\d+(?:\.\d+)?)\s*(?:درصد|%)\s*(?:از\s*)?(\d[\d,]*(?:\.\d+)?\s*(?:میلیارد|میلیون|ملیون|هزار)?)/);
  if (m1) {
    const pct = Number(m1[1]);
    const base = Number(applyUnitsClient(m1[2]).replace(/,/g, ""));
    if (Number.isFinite(base) && base > 0 && pct >= 0 && pct <= 1000) {
      const part = (base * pct) / 100;
      return (
        `**${faNum(part)}**\n\n(محاسبهٔ محلی — بدون اینترنت انجام شد)\n\n` +
        `- ${faNum(base)} + ${faNum(pct)}٪ = ${faNum(base + part)}\n` +
        `- ${faNum(base)} − ${faNum(pct)}٪ = ${faNum(base - part)}`
      );
    }
  }

  // ── الگوی ۲: «سود/تخفیف/مالیات X درصد روی Y» ──
  const m2 = t.match(
    /(سود|تخفیف|مالیات|کارمزد|زیان)\s*(\d+(?:\.\d+)?)\s*(?:درصد|%)\s*(?:روی|از)\s*(\d[\d,]*(?:\.\d+)?\s*(?:میلیارد|میلیون|ملیون|هزار)?)/
  );
  if (m2) {
    const kind = m2[1];
    const pct = Number(m2[2]);
    const base = Number(applyUnitsClient(m2[3]).replace(/,/g, ""));
    if (Number.isFinite(base) && base > 0 && pct > 0 && pct <= 100) {
      const part = (base * pct) / 100;
      const isDiscount = kind === "تخفیف" || kind === "زیان";
      const final = isDiscount ? base - part : base + part;
      return (
        `**${kind} ${faNum(pct)}٪ روی ${faNum(base)}:**\n\n` +
        `- مبلغ ${kind} = **${faNum(part)}**\n` +
        `- مبلغ نهایی = **${faNum(final)}**\n\n(محاسبهٔ محلی — بدون اینترنت انجام شد)`
      );
    }
  }

  // ── الگوی ۳: عبارت ریاضی چندعملوندی — «۴۵۰۰۰ جمع ۱۲۰۰۰ منها ۳۰۰۰» ──
  const unitApplied = applyUnitsClient(t);
  const exprMatch = unitApplied.match(
    /(\d[\d,]*(?:\.\d+)?(?:\s*(?:\*|\/|\+|-)\s*\d[\d,]*(?:\.\d+)?)+)/
  );
  if (exprMatch) {
    const value = safeEvalClient(exprMatch[1]);
    if (value !== null) {
      return `**${faNum(value)}**\n\n(محاسبهٔ محلی — بدون اینترنت انجام شد)`;
    }
  }

  // ── الگوی ۴: دو عملوند با واژهٔ عملگر (حالت قدیمی) ──
  const expr = t.match(/(-?\d+(?:[.,]\d+)?)\s*(\+|plus|منها|ضربدر|تقسیم بر|-|\*|\/|%)\s*(-?\d+(?:[.,]\d+)?)/);
  if (!expr) return null;
  const a = parseFloat(expr[1].replace(",", "."));
  const b = parseFloat(expr[3].replace(",", "."));
  const op = expr[2];
  let result: number | null = null;
  if (op === "+") result = a + b;
  else if (op === "-" || op === "منها") result = a - b;
  else if (op === "*") result = a * b;
  else if (op === "/") result = b !== 0 ? a / b : null;
  else if (op === "%") result = b !== 0 ? (a / b) * 100 : null;
  if (result === null || !isFinite(result)) return null;
  return `**${faNum(result)}**\n\n(محاسبهٔ محلی — بدون اینترنت انجام شد)` +
    `\n\nمی‌توانید عملیات‌های پیچیده‌تر را هم بپرسید؛ پس از اتصال، موتور تحلیلی کامل فعال می‌شود.`;
}

/* ─── لایهٔ ۳: دانش‌نامهٔ داخلی ─── */
interface QA {
  keys: string[];
  a: string;
}

const KNOWLEDGE: QA[] = [
  {
    keys: ["فاکتور", "صورتحساب", "فاکتور فروش", "صادر"],
    a: "برای ثبت فاکتور فروش: از منوی **فروش و فاکتورها** → دکمهٔ «فاکتور جدید». طرف‌حساب را انتخاب کنید، اقلام را اضافه کنید و مبلغ، تخفیف و مالیات به‌صورت خودکار محاسبه می‌شود. سند حسابداری فاکتور هم به‌صورت خودکار ثبت می‌شود.",
  },
  {
    keys: ["مودیان", "سامانه مودیان", "ارسال فاکتور به مودیان"],
    a: "اتصال **سامانه مودیان** در هوش حساب دوطرفه است: فاکتورها با یک کلیک ارسال می‌شوند، استعلام‌های مالیاتی و نتیجهٔ ارسال به‌صورت خودکار دریافت و در ماژول مودیان نمایش داده می‌شوند. تنظیمات اتصال: **تنظیمات → اتصال مودیان**.",
  },
  {
    keys: ["مالیات", " VAT ", "مالیات بر ارزش افزوده", "ارزش افزوده"],
    a: "نرخ **مالیات بر ارزش افزوده** به‌صورت پیش‌فرض ۱۰٪ است و در تنظیمات قابل تغییر است. هوش حساب مالیات هر فاکتور را خودکار محاسبه می‌کند و گزارش‌های دوره‌ای مالیات (ماهانه/فصلی) آمادهٔ ارسال دارد.",
  },
  {
    keys: ["سند", "سند حسابداری", "سند حساب", "دفتر"],
    a: "هر فاکتور، چک یا پرداخت در هوش حساب **خودکار سند حسابداری** می‌سازد. برای ثبت سند دستی: **حسابداری → سند جدید**. دفاتر قانونی (روزنامه و کل) به‌صورت خودکار از اسناد ساخته می‌شوند.",
  },
  {
    keys: ["گزارش سود", "سود", "سود و زیان", "سود ماه"],
    a: "**گزارش سود و زیان** در بخش گزارش‌ها موجود است: سود ناخالص هر محصول، سود کل دوره، پرفروش‌ترین کالاها و روند سود ماهانه با نمودار. داشبورد مدیریتی هم خلاصهٔ زندهٔ سود را نشان می‌دهد.",
  },
  {
    keys: ["انبار", "موجودی", "کالا", "موجودی کالا"],
    a: "ماژول **انبار** موجودی هر کالا را به تفکیک انبار نشان می‌دهد؛ ورود/خروج، انتقال بین انبارها و حدسفارش (نقطهٔ سفارش) خودکار دارد. هر فروش، موجودی را بلافاصله کم می‌کند.",
  },
  {
    keys: ["مشتری", "طرف حساب", "طرف حساب جدید"],
    a: "در **مشتریان و تأمین‌کنندگان** می‌توانید طرف‌حساب جدید بسازید، مانده و تراکنش‌های هر مشتری را ببینید و پیگیری‌ها (Follow-up) با یادآوری ثبت کنید.",
  },
  {
    keys: ["چک", "چک دریافتنی", "چک پرداختی", "وصول"],
    a: "ماژول **چک‌ها**: چک‌های دریافتنی و پرداختی با وضعیت (در جریان/وصول/خرج‌شده/برگشتی)، سررسیدهای نزدیک با هشدار خودکار و اتصال به گردش‌نقدی. شماره صیاد هم ثبت می‌شود.",
  },
  {
    keys: ["حقوق", "حقوق پرسنل", "فیش حقوقی", "پرل"],
    a: "ماژول **حقوق و دستمزد**: تعریف پرسنل، جدول حقوق و مزایا، لیست حقوق ماهانه، فیش حقوقی قابل چاپ، مرخصی و اضافه‌کار. محاسبهٔ بیمه و مالیات حقوق خودکار است.",
  },
  {
    keys: ["پشتیبان", "نسخه پشتیبان", "بکاپ"],
    a: "**تنظیمات → پشتیبان‌گیری**: خروجی کامل از داده‌ها (اکسل/JSON) و بازیابی. در نسخهٔ ابری، بکاپ خودکار دوره‌ای هم فعال است.",
  },
  {
    keys: ["خروجی اکسل", "اکسل", "خروجی گزارش", "excel"],
    a: "همهٔ گزارش‌ها و لیست‌ها دکمهٔ **خروجی اکسل** دارند (در نسخهٔ آزمایشی محدود است). خروجی PDF هم برای گزارش‌های رسمی موجود است.",
  },
  {
    keys: ["نرم‌افزار حسابداری", "هوش حساب چیه", "معرفی", "قابلیت"],
    a: "**هوش حساب** نرم‌افزار حسابداری ابری ایرانی است با ۱۶ ماژول تخصصی: فروش و فاکتور، انبار، مودیان، بانکداری، چک‌ها، حقوق و دستمزد، تولید، پروژه‌ها، CRM، گزارش‌ساز و دستیار هوشمند — همراه اپ موبایل و کار آفلاین.",
  },
  {
    keys: ["قیمت", "تعرفه", "اشتراک", "پلن"],
    a: "پلن‌های اشتراکی هوش حساب در **صفحهٔ قیمت‌گذاری** مشخص است: پلن پایه، استاندارد و حرفه‌ای با تفاوت در تعداد کاربر و ماژول‌ها. ۷ روز اول رایگان است و بدون کارت بانکی شروع می‌شود.",
  },
  {
    keys: ["اپلیکیشن", "اپ موبایل", "اندروید", "ios"],
    a: "اپ موبایل هوش حساب برای **اندروید و iOS** در بخش دانلودها موجود است — ثبت فاکتور از گوشی، اعلان‌های سررسید و دستیار صوتی همراه دارد. نصب PWA از خود مرورگر هم ممکن است.",
  },
  {
    keys: ["امنیت", "داده امن", "امنیت داده"],
    a: "داده‌های هوش حساب **رمزنگاری‌شده** ذخیره می‌شوند، اتصال TLS دارد، ورود دو مرحله‌ای (OTP) فعال است و از هر تغییر گزارش دقیق ثبت می‌شود. کد ملی و داده‌های حساس با AES-GCM رمز می‌شوند.",
  },
  {
    keys: ["کار آفلاین", "آفلاین", "بدون اینترنت"],
    a: "هوش حساب **کاملاً آفلاین کار می‌کند**: صفحه‌ها و آخرین داده‌ها کش می‌شوند، عملیات‌های شما در صف محلی ذخیره می‌شوند و پس از وصل‌شدن دوبارهٔ اینترنت، خودکار همگام‌سازی می‌شوند — حتی همین گفتگو با من هم بدون اینترنت در دسترس است.",
  },
];

/* ─── لایهٔ ۴: پاسخ آرام ─── */
function gracefulFallback(question: string): string {
  return (
    `الان در **حالت آفلاین** هستید و پاسخ تخصصی این پرسش نیاز به موتور ابری دارد.\n\n` +
    `اما نگران نباشید:\n` +
    `- عملیات‌های شما (ثبت فاکتور، کالا، مشتری و...) ذخیره و در صف همگام‌سازی‌اند\n` +
    `- همهٔ صفحه‌ها و آخرین داده‌ها در همین حالت در دسترس‌اند\n` +
    `- همین که اینترنت وصل شود، این پرسش را دوباره بپرسید تا پاسخ کامل بگیرید\n\n` +
    `در همین حال می‌توانید از **ماشین‌حساب من** استفاده کنید (مثلاً: ۱۲۵۰ ضربدر ۳) یا بپرسید «چطور فاکتور بزنم»، «مودیان چیست»، «گزارش سود کجاست».`
  );
}

/* ─── پاسخ‌دهندهٔ اصلی ─── */
export function clientOfflineReply(
  question: string
): { content: string; matched: boolean; source: "math" | "qa-cache" | "builtin" | "fallback" } {
  const q = normalizeFa(question);

  // ۱) ریاضی
  const math = tryMath(question);
  if (math) return { content: math, matched: true, source: "math" };

  // ۲) کش پرسش‌وپاسخ
  try {
    const raw = localStorage.getItem(QA_KEY);
    if (raw) {
      const arr: { q: string; a: string; t: number }[] = JSON.parse(raw);
      let best: { score: number; a: string } | null = null;
      for (const item of arr) {
        const s = similarity(q, item.q);
        if (!best || s > best.score) best = { score: s, a: item.a };
      }
      if (best && best.score >= 0.62) {
        return { content: best.a, matched: true, source: "qa-cache" };
      }
    }
  } catch {}

  // ۳) دانش‌نامهٔ داخلی
  let bestKb: { score: number; a: string } | null = null;
  for (const kb of KNOWLEDGE) {
    const keys = kb.keys.map(normalizeFa).join(" ");
    const s = similarity(q, keys);
    const hasKey = kb.keys.some((k) => q.includes(normalizeFa(k)));
    const score = hasKey ? Math.max(s, 0.34) : s;
    if (!bestKb || score > bestKb.score) bestKb = { score, a: kb.a };
  }
  if (bestKb && bestKb.score >= 0.34) {
    return { content: bestKb.a, matched: true, source: "builtin" };
  }

  // ۴) آرام
  return { content: gracefulFallback(question), matched: false, source: "fallback" };
}
