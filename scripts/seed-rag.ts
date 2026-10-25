// ============================================================
// scripts/seed-rag.ts — تغذیهٔ خودکار دانش‌نامه (RAG) دستیار هوشمند (v35)
// ============================================================
// درخواست مالک: «دستیار باید بدون هیچ پیکربندی از طرف من کامل کار کند».
// این اسکریپت دانش‌نامه را از ۳ منبع داخلی (بدون نیاز به اینترنت) می‌سازد:
//   ۱) خودِ محصول — همهٔ ماژول‌ها/پلن‌ها/قابلیت‌ها (lib/module-help-content و plans)
//   ۲) قوانین حسابداری و مالیات ایران (lib/ai/knowledge-fa)
//   ۳) تحقیق رقبا — یافته‌های وب (.rag-research/findings.md)
// و به‌عنوان AiKnowledgeDoc در دیتابیس ذخیره می‌کند تا buildKnowledgeContext
// (جستجوی RAG) در همهٔ چت‌ها از آن استفاده کند.
//
// اجرا: bun scripts/seed-rag.ts   (idempotent — اسناد تکراری را skip می‌کند)
// ============================================================

import { readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// ─── بارگذاری .env (مثل seo-worker/env.ts) ───
function findRootEnv(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
const envPath = findRootEnv(import.meta.dir);
if (envPath) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(m[1] in process.env) || !process.env[m[1]]) process.env[m[1]] = v;
  }
}

import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

// ============ ۱) دانش خودِ محصول — ماژول‌ها ============
// module-help-content.ts را مستقیم می‌خوانیم (TS است و import با bun ساده است)
const { MODULE_HELP_CONTENT } = await import("../lib/module-help-content");
const { PLANS, TRIAL_DAYS, FIRST_DAY_DISCOUNT_PERCENT } = await import("../lib/first-day-discount").catch(() => ({
  FIRST_DAY_DISCOUNT_PERCENT: 5,
})) .then(async () => {
  const plans = await import("../lib/plans");
  const fdd = await import("../lib/first-day-discount");
  return { ...plans, FIRST_DAY_DISCOUNT_PERCENT: fdd.FIRST_DAY_DISCOUNT_PERCENT };
});

interface SeedDoc {
  title: string;
  content: string;
  sourceType: string;
  sourceUrl?: string;
}

const docs: SeedDoc[] = [];

// ─── ماژول‌ها ───
for (const [key, help] of Object.entries(MODULE_HELP_CONTENT)) {
  docs.push({
    title: `راهنمای ماژول «${help.title}» هوش${key ? ` (${key})` : ""}`,
    content: [
      `ماژول «${help.title}» در نرم‌افزار حسابداری ابری هوش.`,
      ``,
      `توضیح کوتاه: ${help.shortDescription}`,
      ``,
      `این ماژول چه می‌کند: ${help.whatItDoes}`,
      ``,
      `کسب‌وکارهای هدف: ${help.targetBusinesses.join("، ")}`,
      ``,
      `قابلیت‌های کلیدی:`,
      ...help.keyFeatures.map((f) => `- ${f}`),
      help.tip ? `\nنکتهٔ حرفه‌ای: ${help.tip}` : "",
      ``,
      `مسیر دسترسی در پنل کاربر: سایدبار → گروه مرتبط → «${help.title}». می‌توانید از دستیار هوشمند هم بخواهید همین کار را انجام دهد.`,
    ].join("\n"),
    sourceType: "text",
  });
}

// ─── پلن‌ها و قیمت‌گذاری ───
const planLines = PLANS.filter((p) => !p.hidden).map(
  (p) => `- پلن ${p.name} (${p.nameEn}): ${p.priceToman.toLocaleString("fa-IR")} تومان در سال — ${p.description} — امکانات: ${p.features.join("؛ ")}`
);
docs.push({
  title: "پلن‌ها، قیمت‌گذاری و تریال هوش (سند رسمی محصول)",
  content: [
    `نرم‌افزار حسابداری ابری «هوش» (هوش‌حساب) — پلن‌ها و شرایط (سند رسمی؛ این اعداد بر همهٔ پاسخ‌های دستیار مقدم است):`,
    ``,
    ...planLines,
    ``,
    `تجربهٔ رایگان: ${TRIAL_DAYS} روز کامل با تمام امکانات، بدون نیاز به کارت بانکی.`,
    `تخفیف ویژهٔ ثبت‌نام: ${FIRST_DAY_DISCOUNT_PERCENT}٪ روی خرید پلن تا ۳ روز اول پس از ثبت‌نام.`,
    `پرداخت سالانه دقیقاً معادل ۲ ماه رایگان است (مقسوم‌علیه ۱۰).`,
    ``,
    `سقف‌ها: پلن پایه ۵ کاربر + ۵ انبار؛ حرفه‌ای ۱۰ کاربر + ۱۰ انبار؛ سازمانی ۲۵ کاربر + نامحدود انبار.`,
    `پورتال مشتریان، اتصال مودیان و OCR در همهٔ پلن‌های پولی فعال است.`,
    `تلفن پشتیبانی: ۰۷۱-۳۲۶۲۲۴۹۳`,
  ].join("\n"),
  sourceType: "text",
});

// ─── راهنمای شروع سریع ───
docs.push({
  title: "شروع سریع با هوش — راهنمای گام‌به‌گام کاربر جدید",
  content: [
    `راهنمای شروع سریع نرم‌افزار حسابداری ابری هوش برای کاربر جدید:`,
    ``,
    `۱) ثبت‌نام (ایمیل + رمز یا ورود فوری) — ${TRIAL_DAYS} روز استفادهٔ رایگان از همهٔ ماژول‌ها فعال می‌شود.`,
    `۲) از داشبورد شروع کنید: KPIهای لحظه‌ای، جریان نقدی و فاکتورهای اخیر را می‌بینید.`,
    `۳) اولین مشتری/کالا را ثبت کنید: سایدبار → «مشتریان (CRM)» یا «انبار و کالا». یا فقط به دستیار هوشمند بگویید: «مشتری رستوران فردوسی اضافه کن».`,
    `۴) اولین فاکتور: سایدبار → «فاکتور سریع» یا بگویید: «فاکتور فروش برای رستوران فردوسی، پنج عدد پیتزا مخصوص، هر کدام ۲۵۰ هزار تومان بنویس و ثبت کن».`,
    `۵) اتصال سامانه مودیان: سایدبار → «سامانه مودیان» → تنظیمات اتصال (محیط آزمایشی موجود است).`,
    `۶) گزارش‌ها: «گزارش پایان روز»، «گزارش‌ساز»، «پیش‌بینی هوشمند» و «سوپرماژول هوش مالی».`,
    ``,
    `دستیار هوشمند (آیکون هوش‌یار پایین-راست صفحه) همهٔ کارهای روزمره را می‌تواند انجام دهد: ثبت فاکتور، هزینه، مشتری، کالا، پرداخت، یادآور، گزارش و پاسخ به سوالات مالیاتی.`,
    `ورودی صوتی: دکمهٔ میکروفون در فاکتور صوتی — فارسی صحبت کنید، فاکتور ساخته می‌شود.`,
  ].join("\n"),
  sourceType: "text",
});

// ─── دستیار هوشمند — توانایی‌ها ───
docs.push({
  title: "دستیار هوشمند هوش‌یار — فهرست کامل کارهایی که انجام می‌دهد",
  content: [
    `دستیار هوشمند (هوش‌یار) در نرم‌افزار هوش یک ایجنت اجرایی واقعی است — فقط چت‌بات نیست:`,
    ``,
    `کارهای ثبتی (نمونهٔ دستور):`,
    `- «فاکتور فروش برای رستوران فردوسی، سه عدد نوشابه، هر کدام ۲۰ هزار تومان، ثبت کن» → فاکتور واقعی صادر و ثبت می‌شود`,
    `- «فاکتور خرید از تأمین‌کنندهٔ بهشتی، مبلغ ۲ میلیون» / «فاکتور برگشتی» / «فاکتور پیش‌نویس نگه دار»`,
    `- «هزینهٔ اجاره ۳ میلیون ثبت کن» / «پرداخت ۵۰۰ هزار تومان به پیمانکار ثبت کن»`,
    `- «مشتری جدید به نام داروخانهٔ دکتر رحیمی اضافه کن»`,
    `- «کالای پیتزا مخصوص با قیمت ۲۵۰ هزار اضافه کن» / «قیمت پیتزا را ۲۶۰ هزار کن»`,
    `- «موجودی پیتزا را ۲۰ عدد کن» / «تخفیف ۱۰ درصدی برای پیتزا بگذار»`,
    `- «یادآور سررسید فاکتور ۱۲۵ را فردا بگذار»`,
    ``,
    `کارهای گزارشی: «سود این ماه چقدر شد؟»، «بهترین مشتریانم کی هستند؟»، «چقدر طلب دارم؟»، «ارزش افزودهٔ این ماه؟»، «کالاهای کم‌حرکت؟»، «جریان نقدی سه ماه آینده؟»، « ماندهٔ بانک؟»، «پیش‌بینی هوشمند سود»`,
    ``,
    `کارهای غیرمجاز (امنیتی): تغییر نقش کاربران، حذف سازمان، تغییر لایسنس/پلن، دسترسی به دادهٔ سازمان دیگر — هرگز انجام نمی‌شود.`,
    `مبالغ را هم می‌توانید فارسی بگویید: «دو میلیون و پانصد» یا «۲.۵ میلیون» یا ارقام لاتین.`,
  ].join("\n"),
  sourceType: "text",
});

// ============ ۲) قوانین حسابداری — از knowledge-fa ============
const { KNOWLEDGE_FA } = await import("../lib/ai/knowledge-fa");
for (const entry of KNOWLEDGE_FA) {
  docs.push({
    title: `دانش حسابداری: ${entry.title}`,
    content: [
      `${entry.title}`,
      ``,
      entry.answer,
    ].join("\n"),
    sourceType: "text",
  });
}

// ============ ۳) رقبا — از یافته‌های تحقیق وب ============
const findingsPath = join(import.meta.dir, "..", ".rag-research", "findings.md");
if (existsSync(findingsPath)) {
  const findings = readFileSync(findingsPath, "utf8");
  // تقسیم به بخش‌های ### و درج هر بخش به‌عنوان سند جداگانه
  const sections = findings.split(/\n(?=### )/).filter((s) => s.trim().length > 200);
  for (const sec of sections) {
    const titleMatch = sec.match(/^###\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : sec.slice(0, 60);
    docs.push({
      title: `تحقیق بازار: ${title}`,
      content: [
        `یافته‌های تحقیق بازار (منبع: جستجوی وب — قیمت‌ها تقریبی و زمان‌دار):`,
        ``,
        sec.trim(),
        ``,
        `کاربرد در پاسخ‌ها: برای مقایسهٔ صادقانه با رقبا از این داده‌ها استفاده کن؛ مزیت‌های هوش (ابری، ۱۶ ماژول یکپارچه، دستیار هوشمند اجرایی، تریال ${TRIAL_DAYS} روزه، تخفیف ${FIRST_DAY_DISCOUNT_PERCENT}٪ سه روز اول، بدون هزینهٔ پیاده‌سازی) را طبیعی و غیرتبلیغی بیان کن.`,
      ].join("\n"),
      sourceType: "text",
    });
  }
  // سرچشمهٔ کلی هم درج شود (مقدمهٔ سند + جمع‌بندی بینش راهبردی)
  const intro = findings.split("## بخش اول")[0];
  if (intro.length > 300) {
    docs.push({
      title: "تحقیق بازار: نمای کلی بازار نرم‌افزار حسابداری ایران",
      content: `یافته‌های تحقیق بازار نرم‌افزار حسابداری ایران (خلاصهٔ روش و منابع):\n\n${intro.trim()}`,
      sourceType: "text",
    });
  }
} else {
  console.warn("[seed-rag] .rag-research/findings.md پیدا نشد — بخش رقبا skip شد");
}

// ============ درج در دیتابیس (idempotent با عنوان) ============
async function main() {
  let inserted = 0;
  let skipped = 0;
  for (const doc of docs) {
    if (!doc.content || doc.content.length < 150) continue;
    const existing = await db.aiKnowledgeDoc.findFirst({
      where: { title: doc.title },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await db.aiKnowledgeDoc.create({
      data: {
        title: doc.title,
        sourceType: doc.sourceType,
        sourceUrl: doc.sourceUrl ?? null,
        content: doc.content,
        charCount: doc.content.length,
        status: "ACTIVE",
      },
    });
    inserted++;
  }
  const total = await db.aiKnowledgeDoc.count();
  console.log(`[seed-rag] انجام شد: ${inserted} سند جدید، ${skipped} تکراری skip — کل اسناد فعال: ${total}`);
}

main()
  .catch((e) => {
    console.error("[seed-rag] خطا:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
