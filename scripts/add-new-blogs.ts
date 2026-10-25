// ============================================================
// scripts/add-new-blogs.ts — افزودن ۲۷ وبلاگ جدید ۳۰۰۰+ کلمه‌ای (Task 11-A)
// ============================================================
// - ۲۷ موضوع unused از بانک موضوعات (۱۷ صنف پرسرچ + ۵ ابزار + ۲ آموزش + ۳ مالیات)
// - محتوای دست‌نویسِ مخصوص هر صنعت (نه الگوی پارامتری) در scripts/new-blogs-content/
// - INSERT خالص؛ هیچ UPDATE/DELETE روی ۲۶۷ رکورد قبلی
// - idempotent: اجرای دوم بدون رکورد تکراری (upsert-معادل: skip روی slug موجود)
// - پیش از درج: بکاپ VACUUM INTO backups/custom-before-27blogs.db
// - اعتبارسنجی: ≥۱۹,۵۰۰ کاراکتر، ≥۴ جدول، FAQ ۵-۷، ≥۶ لینک داخلی، صفر CJK،
//   ارقام لاتین در متن ≤۵، title ≤۶۵، excerpt و metaDescription در بازهٔ مجاز
// اجرا:  bun scripts/add-new-blogs.ts [--force]
//   --force = حذف ۲۷ رکورد خودِ این بچ (marker gen:batch11 + order 201-227) و درج مجدد
// ============================================================

import { Database } from "bun:sqlite";
import fs from "node:fs";
import type { NewBlogSpec } from "./new-blogs-content/types";
import { A01 } from "./new-blogs-content/a01-fruit-shop";
import { A02 } from "./new-blogs-content/a02-butcher-shop";
import { A03 } from "./new-blogs-content/a03-fast-food";
import { A04 } from "./new-blogs-content/a04-ice-cream-shop";
import { A05 } from "./new-blogs-content/a05-nuts-shop";
import { A06 } from "./new-blogs-content/a06-honey-beekeeping";
import { A07 } from "./new-blogs-content/a07-car-wash";
import { A08 } from "./new-blogs-content/a08-dry-cleaning";
import { A09 } from "./new-blogs-content/a09-printing-shop";
import { A10 } from "./new-blogs-content/a10-photo-studio";
import { A11 } from "./new-blogs-content/a11-flower-shop";
import { A12 } from "./new-blogs-content/a12-traditional-bakery";
import { A13 } from "./new-blogs-content/a13-wholesale-distribution";
import { A14 } from "./new-blogs-content/a14-instagram-shop";
import { A15 } from "./new-blogs-content/a15-car-dealership";
import { A16 } from "./new-blogs-content/a16-ecotourism-guesthouse";
import { A17 } from "./new-blogs-content/a17-hotel-accommodation";
import { A18 } from "./new-blogs-content/a18-reorder-point";
import { A19 } from "./new-blogs-content/a19-markup-margin";
import { A20 } from "./new-blogs-content/a20-sensitivity-analysis";
import { A21 } from "./new-blogs-content/a21-sales-forecasting";
import { A22 } from "./new-blogs-content/a22-customer-profitability";
import { A23 } from "./new-blogs-content/a23-petty-cash";
import { A24 } from "./new-blogs-content/a24-inventory-shrinkage";
import { A25 } from "./new-blogs-content/a25-free-trade-zone-tax";
import { A26 } from "./new-blogs-content/a26-dividend-distribution";
import { A27 } from "./new-blogs-content/a27-crypto-tax";

const SPECS: NewBlogSpec[] = [
  ...A01, ...A02, ...A03, ...A04, ...A05, ...A06, ...A07, ...A08, ...A09,
  ...A10, ...A11, ...A12, ...A13, ...A14, ...A15, ...A16, ...A17, ...A18,
  ...A19, ...A20, ...A21, ...A22, ...A23, ...A24, ...A25, ...A26, ...A27,
];

// ---------------- constants ----------------
const DB_PATH = "db/custom.db";
const BACKUP_PATH = "backups/custom-before-27blogs.db";
const BASE_ORDER = 201;
const BASE_PUBLISH_MS = 1827306000000; // scheduleOrder=200 → 2027-11-27 (الگوی صف موجود)
const STEP_MS = 172800000; // هر ۲ روز — مطابق صف ۲۰۰تایی
const MARKER = "gen:batch11";
const FORCE = process.argv.includes("--force");

// ---------------- helpers ----------------
function countWords(html: string): number {
  return html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
}
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\u2e80-\u2eff\u3000-\u303f\uff01-\uff5e]/g;
function countCJK(s: string): number {
  return (s.match(CJK_RE) || []).length;
}
function latinDigitsInText(html: string): number {
  const textOnly = html
    .replace(/<[^>]+>/g, " ")
    .replace(/href="[^"]*"/g, " ")
    .replace(/src="[^"]*"/g, " ");
  return (textOnly.match(/[0-9]/g) || []).length;
}
/** id قطعی از روی slug — الگوی cuid: cm + ۲۴ کاراکتر [a-z0-9] */
function detId(slug: string): string {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  let a = h >>> 0;
  for (let i = 0; i < 24; i++) {
    a = (Math.imul(a, 48271) + 11) >>> 0;
    out += chars[a % 36];
  }
  return "cm" + out;
}

const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F900}-\u{1F9FF}]/u;
function countEmoji(s: string): number {
  return (s.match(EMOJI_RE) || []).length;
}

function ctaBlock(spec: NewBlogSpec): string {
  return `
<div class="cta-box">
<p><strong>${spec.focusKeyword} را همین امروز ساماندهی کنید.</strong> نرم‌افزار حسابداری هوش را <strong>۷ روز رایگان و بدون کارت بانکی</strong> امتحان کنید؛ <a href="/features">امکانات ۱۶ ماژول</a> را ببینید، <a href="/industries">پیکربندی مخصوص صنف‌ها</a> را مرور کنید و برای شروع، <a href="/pricing">پلن‌ها و قیمت‌ها را باز کنید</a>. مهاجرت داده از دفترچه و اکسل هم رایگان انجام می‌شود.</p>
</div>`;
}

function buildContent(
  spec: NewBlogSpec,
  publishedTitles: Map<string, string>
): { html: string; problems: string[] } {
  const imgTag = `<img src="${spec.coverImage}" alt="${spec.title}" loading="lazy" width="1200" height="630" />`;
  // تصویر بعد از بخش H2 دوم (پس از sections[1])
  const sec = [...spec.sections];
  if (sec.length > 2) sec.splice(2, 0, imgTag);
  else sec.unshift(imgTag);

  // CTA قبل از FAQ
  const faqHtml =
    `<h2>پرسش‌های متداول</h2>\n` +
    spec.faq.map((f) => `<h3>${f.q}</h3>\n<p>${f.a}</p>`).join("\n");
  const conclusionHtml =
    `<h2>جمع‌بندی</h2>\n` + spec.conclusion.join("\n");
  const related = spec.relatedSlugs
    .map((s) => {
      const t = publishedTitles.get(s) || s;
      return `<a href="/blog/${s}">${t}</a>`;
    })
    .join(" • ");
  const relatedHtml = `<p><strong>مطالب مرتبط:</strong> ${related}</p>`;

  const html = [
    spec.intro.join("\n"),
    sec.join("\n"),
    ctaBlock(spec),
    faqHtml,
    conclusionHtml,
    relatedHtml,
  ].join("\n");

  // ---- اعتبارسنجی سخت ----
  const problems: string[] = [];
  if (html.length < 19500) problems.push(`طول ${html.length} < 19500`);
  const words = countWords(html);
  if (words < 3000) problems.push(`کلمات ${words} < 3000`);
  const tables = (html.match(/<table[\s>]/g) || []).length;
  if (tables < 4) problems.push(`جدول‌ها ${tables} < 4`);
  if (spec.faq.length < 5 || spec.faq.length > 7)
    problems.push(`FAQ=${spec.faq.length} (باید ۵-۷)`);
  const cjk = countCJK(html);
  if (cjk > 0) problems.push(`CJK=${cjk}`);
  const lat = latinDigitsInText(html);
  if (lat > 5) problems.push(`ارقام لاتین در متن: ${lat}`);
  const emo = countEmoji(html);
  if (emo > 0) problems.push(`ایموجی: ${emo}`);
  const internalLinks = (html.match(/href="\/blog\//g) || []).length;
  if (internalLinks < 6) problems.push(`لینک داخلی ${internalLinks} < 6`);
  const pricingLinks = (html.match(/href="\/pricing"/g) || []).length;
  if (pricingLinks < 2) problems.push(`لینک /pricing ${pricingLinks} < 2`);
  if (!html.includes('href="/features"')) problems.push("لینک /features ندارد");
  if (!html.includes('href="/industries"'))
    problems.push("لینک /industries ندارد");
  if (!/<h2>/.test(html)) problems.push("h2 ندارد");
  const h2Count = (html.match(/<h2>/g) || []).length;
  if (h2Count < 8) problems.push(`h2=${h2Count} < 8`);
  if (spec.title.length > 65) problems.push(`title طولانی: ${spec.title.length}`);
  if (spec.excerpt.length < 140 || spec.excerpt.length > 170)
    problems.push(`excerpt=${spec.excerpt.length}`);
  if (spec.metaDescription.length < 140 || spec.metaDescription.length > 175)
    problems.push(`metaDescription=${spec.metaDescription.length}`);
  if (spec.keywords.length < 8 || spec.keywords.length > 12)
    problems.push(`keywords=${spec.keywords.length}`);

  return { html, problems };
}

// ---------------- main ----------------
if (!fs.existsSync(DB_PATH)) {
  console.error(`خطا: ${DB_PATH} پیدا نشد — اجرا متوقف شد.`);
  process.exit(1);
}
const db = new Database(DB_PATH);
db.exec("PRAGMA journal_mode=WAL;");

const before = db.query("SELECT COUNT(*) AS c FROM BlogPost").get() as any;
console.log(`رکوردهای موجود: ${before.c}`);
if (before.c < 267 || before.c > 294) {
  console.error(`خطا: انتظار ۲۶۷ (تازه) یا ۲۹۴ (اجراشده) رکورد بود اما ${before.c} است — اجرا متوقف شد.`);
  process.exit(1);
}
if (before.c === 294) {
  console.log("بچ ۲۷تایی از قبل اعمال شده — این اجرا فقط راستی‌آزمایی می‌کند (idempotent).");
}

// عناوین PUBLISHED برای بلوک مطالب مرتبط
const publishedRows = db
  .query("SELECT slug, title FROM BlogPost WHERE status='PUBLISHED'")
  .all() as any[];
const publishedTitles = new Map(publishedRows.map((r) => [r.slug, r.title]));
const publishedSlugs = new Set(publishedRows.map((r) => r.slug));

// sanity: اسلاگ‌ها یکتا در خود بچ و unused در DB
const seen = new Set<string>();
for (const s of SPECS) {
  if (seen.has(s.slug)) {
    console.error(`اسلاگ تکراری در بچ: ${s.slug}`);
    process.exit(1);
  }
  seen.add(s.slug);
}
if (SPECS.length !== 27) {
  console.error(`تعداد spec = ${SPECS.length} (باید ۲۷ باشد)`);
  process.exit(1);
}

// محاسبهٔ محتوا + اعتبارسنجی قبل از هر تغییری در DB
const built: {
  spec: NewBlogSpec;
  html: string;
  words: number;
  problems: string[];
}[] = [];
for (const spec of SPECS) {
  const { html, problems } = buildContent(spec, publishedTitles);
  built.push({ spec, html, words: countWords(html), problems });
  const mark = problems.length === 0 ? "OK " : "FAIL";
  console.log(
    `${mark} ${spec.slug} — ${html.length} کاراکتر، ${countWords(html)} کلمه` +
      (problems.length ? ` | ${problems.join("؛ ")}` : "")
  );
}
const failures = built.filter((b) => b.problems.length > 0);
if (failures.length > 0) {
  console.error(`\n${failures.length} مقاله فاقد شرایط است — چیزی درج نشد.`);
  process.exit(1);
}

// idempotency: بررسی تعارض با ۲۶۷ قبلی + رفتار اجرای مجدد
const existingSlugs = new Set(
  (db.query("SELECT slug FROM BlogPost").all() as any[]).map((r) => r.slug)
);
const oursRows = db
  .query(
    "SELECT slug FROM BlogPost WHERE scheduleOrder BETWEEN 201 AND 227"
  )
  .all() as any[];
const oursSlugs = new Set(oursRows.map((r) => r.slug));

if (FORCE && oursSlugs.size > 0) {
  db.run("DELETE FROM BlogPost WHERE scheduleOrder BETWEEN 201 AND 227");
  console.log(`--force: ${oursSlugs.size} رکورد بچ قبلی حذف شد.`);
}

const toInsert = built.filter((b) => !existingSlugs.has(b.spec.slug) || (oursSlugs.has(b.spec.slug) && FORCE));
const skipped = built.length - toInsert.length;
if (skipped > 0) console.log(`${skipped} مقاله از قبل موجود بود — رد شد (idempotent).`);

// بکاپ — پیش از اولین INSERT
if (toInsert.length > 0) {
  if (fs.existsSync(BACKUP_PATH)) fs.unlinkSync(BACKUP_PATH);
  db.exec(`VACUUM INTO '${BACKUP_PATH}'`);
  const sz = fs.statSync(BACKUP_PATH).size;
  console.log(`بکاپ گرفته شد: ${BACKUP_PATH} (${(sz / 1048576).toFixed(1)} MB)`);
}

// snapshot برای اثبات دست‌نخوردگی ۲۶۷ قبلی
const snap = db
  .query(
    "SELECT COUNT(*) AS c, COALESCE(SUM(length(content)),0) AS len, COALESCE(SUM(updatedAt),0) AS u FROM BlogPost WHERE scheduleOrder IS NULL OR scheduleOrder <= 200"
  )
  .get() as any;

const now = Date.now();
const insertSql = `INSERT INTO BlogPost
 (id, slug, title, excerpt, content, coverImage, category, tags, status, publishedAt,
  readingTime, metaTitle, metaDescription, focusKeyword, ogImage, canonicalUrl,
  authorId, createdAt, updatedAt, scheduleOrder, scheduledPublishAt)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

let inserted = 0;
const reportRows: {
  slug: string; order: number; chars: number; words: number; rt: number;
}[] = [];

db.transaction(() => {
  built.forEach((b, i) => {
    if (!toInsert.includes(b)) return;
    const order = BASE_ORDER + i;
    const publishAt = BASE_PUBLISH_MS + (order - 200) * STEP_MS;
    const readingTime = Math.max(6, Math.round(b.words / 220));
    const tags = JSON.stringify([
      `cluster:${b.spec.cluster}`,
      MARKER,
      ...b.spec.keywords,
    ]);
    db.run(insertSql, [
      detId(b.spec.slug),
      b.spec.slug,
      b.spec.title,
      b.spec.excerpt,
      b.html,
      b.spec.coverImage,
      b.spec.category,
      tags,
      "DRAFT",
      null,
      readingTime,
      b.spec.title,
      b.spec.metaDescription,
      b.spec.focusKeyword,
      null,
      null,
      null,
      now,
      now,
      order,
      publishAt,
    ]);
    inserted++;
    reportRows.push({
      slug: b.spec.slug, order, chars: b.html.length, words: b.words, rt: readingTime,
    });
  });
})();

// ---------------- راستی‌آزمایی نهایی ----------------
console.log("\n========== راستی‌آزمایی ==========");
const after = db.query("SELECT COUNT(*) AS c FROM BlogPost").get() as any;
console.log(`کل رکوردها: ${after.c} (انتظار ۲۹۴)`);
const statusMix = db
  .query("SELECT status, COUNT(*) AS c FROM BlogPost GROUP BY status")
  .all() as any[];
console.log("وضعیت‌ها:", JSON.stringify(statusMix));
const newRows = db
  .query(
    "SELECT slug, scheduleOrder, length(content) AS len, readingTime, status FROM BlogPost WHERE scheduleOrder BETWEEN 201 AND 227 ORDER BY scheduleOrder"
  )
  .all() as any[];
const underMin = newRows.filter((r) => r.len < 19500);
console.log(`۲۷ جدید: ${newRows.length} ردیف | زیر ۱۹,۵۰۰: ${underMin.length}`);
const cjkTotal = newRows.reduce(
  (a, r) => a + countCJK((db.query("SELECT content FROM BlogPost WHERE slug=?").get(r.slug) as any).content),
  0
);
console.log(`CJK در ۲۷ مقالهٔ جدید: ${cjkTotal}`);
const snapAfter = db
  .query(
    "SELECT COUNT(*) AS c, COALESCE(SUM(length(content)),0) AS len, COALESCE(SUM(updatedAt),0) AS u FROM BlogPost WHERE scheduleOrder IS NULL OR scheduleOrder <= 200"
  )
  .get() as any;
const untouched =
  snap.c === snapAfter.c && snap.len === snapAfter.len && snap.u === snapAfter.u;
console.log(
  `۲۶۷ قبلی دست‌نخورده: ${untouched ? "بله" : "خیر!"} (${snap.c}=${snapAfter.c}, ${snap.len}=${snapAfter.len})`
);

const avgWords =
  reportRows.length > 0
    ? Math.round(reportRows.reduce((a, r) => a + r.words, 0) / reportRows.length)
    : 0;
const minWords = reportRows.length ? Math.min(...reportRows.map((r) => r.words)) : 0;
const maxWords = reportRows.length ? Math.max(...reportRows.map((r) => r.words)) : 0;
console.log(
  `درج‌شده در این اجرا: ${inserted} | کلمات: میانگین ${avgWords}، کمینه ${minWords}، بیشینه ${maxWords}`
);
console.log("\nslug | order | chars | words | readingTime");
for (const r of reportRows)
  console.log(`${r.slug} | ${r.order} | ${r.chars} | ${r.words} | ${r.rt}`);

if (after.c !== 294 || underMin.length > 0 || cjkTotal > 0 || !untouched) {
  console.error("\nراستی‌آزمایی نهایی ناکام!");
  process.exit(1);
}
console.log("\nهمهٔ شرط‌ها برقرار است. DB سالم: ۲۹۴ رکورد.");
db.close();
