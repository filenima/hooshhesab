// ============================================================================
// scripts/expand-short-posts.ts — گسترش مقاله‌های کوتاه‌تر از ۳۰۰۰ کلمه (v37)
// ----------------------------------------------------------------------------
// ممیزی کیفیت: ۲۱ مقاله زیر ~۳۰۰۰ کلمه داشتیم (۶ بسیار‌کوتاه legacy با
// ۵۲۲-۷۶۰ کلمه + ۱۵ مرزی ~۲,۹۰۰ کلمه). الزام مالک: هر مقاله ۳۰۰۰+ کلمه.
//
// منطق (بدون دست‌زدن به متن اصلی — فقط الحاق بخش‌های تکمیلی):
//   ۱) مقاله‌های length(content) < 19500 (~۳۰۰۰ کلمه با ضریب ۶.۵) پیدا می‌شوند
//   ۲) TopicBrief از خود ردیف بازسازی می‌شود (cluster از تگ cluster:X)
//   ۳) generateTemplateArticle(topic) → HTML تازه؛ بخش‌های h2 جدا می‌شوند
//      (مقدمهٔ تولیدی حذف می‌شود — مقالهٔ اصلی مقدمهٔ خودش را دارد)
//   ۴) بخش‌ها به‌اندازهٔ رسیدنِ راحت به ~۲۲,۵۰۰ کاراکتر (۳,۴۰۰+ کلمه) الحاق
//      می‌شوند؛ سقف سخت ۴۵,۰۰۰ کاراکتر. اگر مقالهٔ اصلی h2 «سوالات/پرسش‌های
//      متداول» دارد، بخش‌های جدید *قبل از* آن h2 درج می‌شوند؛ وگرنه در انتها.
//      مقاله‌های بدون FAQ، بلوک FAQ+مطالب‌مرتبطِ تولیدی هم در انتها می‌گیرند.
//   ۵) readingTime = words/220 (حداقل ۶) و updatedAt تازه می‌شود.
//
// idempotent: اجرای دوم هیچ ردیفی زیر ۱۹,۵۰۰ پیدا نمی‌کند و تمیز خارج می‌شود.
//
// اجرا:  bun scripts/expand-short-posts.ts
// ============================================================================

import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { Database } from "bun:sqlite";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.env.DATABASE_URL = `file:${join(PROJECT_ROOT, "db", "custom.db")}`;

// ─── پارامترها ───
const SHORT_LIMIT = 19500; // زیر این یعنی < ~۳۰۰۰ کلمه (ضریب ۶.۵)
const TARGET_MIN_CHARS = 22500; // هدف: عبورِ راحت از ۲۱,۰۰۰ (~۳,۴۰۰+ کلمه)
const HARD_MAX_CHARS = 45000; // سقف مطلق محتوای نهایی
const SECTIONS_HARD_CAP = 8; // اگر سقف سخت در گیر بود، فقط N بخش اول

// h2 های «سوالات متداول» با هر املا: سوالات/سؤالات/پرسش‌های/پرسش‌ها
const FAQ_HEADING_RE = /(سوالات|سؤالات|پرسش[\u200c]?های|پرسش[\u200c]?ها|پرسشهای)/;

type Row = {
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  category: string;
  tags: string | null;
  focusKeyword: string | null;
  status: string;
  readingTime: number;
};

/** h2 های مقالهٔ تولیدی را به بلوک بشکن: [intro, sec1, sec2, ..., faq(+related), extras...] */
function parseBlocks(html: string): string[] {
  const idxs = [...html.matchAll(/<h2/g)].map((m) => m.index);
  if (idxs.length === 0) return [html];
  const blocks: string[] = [html.slice(0, idxs[0])];
  for (let i = 0; i < idxs.length; i++) {
    blocks.push(html.slice(idxs[i], i + 1 < idxs.length ? idxs[i + 1] : html.length));
  }
  return blocks;
}

/** ایندکس h2 پرسش‌های متداول در محتوای اصلی (اگر باشد) */
function findExistingFaqIndex(content: string): number {
  for (const m of content.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)) {
    if (FAQ_HEADING_RE.test(m[1])) return m.index ?? -1;
  }
  return -1;
}

async function main() {
  console.log("== expand-short-posts: گسترش مقاله‌های کوتاه‌تر از ۳۰۰۰ کلمه ==");

  // مولد قطعی — مثل topup-articles.ts با import نسبی
  const { generateTemplateArticle } = await import("../lib/seo/topup-generator");
  const { countWords } = await import("../lib/seo/article-core");

  const db = new Database(join(PROJECT_ROOT, "db", "custom.db"));
  db.exec("PRAGMA busy_timeout = 10000"); // نویترِ هم‌زمان: dev-server/seo-worker

  const rows = db
    .query(
      `SELECT slug, title, excerpt, content, coverImage, category, tags, focusKeyword, status, readingTime
       FROM BlogPost WHERE length(content) < ${SHORT_LIMIT} ORDER BY length(content) ASC`
    )
    .all() as Row[];

  console.log(`مقاله‌های کوتاه (زیر ${SHORT_LIMIT} کاراکتر): ${rows.length}`);
  if (rows.length === 0) {
    console.log("کاری نیست — همهٔ مقاله‌ها بالای حد هستند ✓ (idempotent)");
    db.close();
    return;
  }

  const update = db.prepare(
    "UPDATE BlogPost SET content = ?, readingTime = ?, updatedAt = ? WHERE slug = ?"
  );
  const nowBase = Date.now();
  let done = 0;
  let skipped = 0;

  for (const row of rows) {
    const beforeLen = row.content.length;
    const beforeWords = countWords(row.content);

    // ── ۱) بازسازی TopicBrief از خود ردیف ──
    let tags: string[] = [];
    try {
      tags = JSON.parse(row.tags || "[]");
    } catch {
      tags = [];
    }
    const clusterTag = tags.find((t) => t.startsWith("cluster:"));
    const topic = {
      slug: row.slug,
      cluster: clusterTag ? clusterTag.replace("cluster:", "") : "accounting",
      title: row.title,
      focusKeyword: row.focusKeyword || row.title,
      category: row.category || "ACCOUNTING",
      brief: row.excerpt || row.title,
      coverImage: row.coverImage || "/images/hero-accounting.webp",
    };

    // ── ۲) تولید مقالهٔ مکمل قطعی ──
    const { html, validation } = generateTemplateArticle(topic);
    if (validation.cjkChars > 0) {
      skipped++;
      console.log(`  SKIP ${row.slug} — محتوای تولیدی CJK دارد (${validation.cjkChars})`);
      continue;
    }

    // ── ۳) جداسازی بخش‌ها: مقدمهٔ تولیدی حذف؛ FAQ جدا ──
    const blocks = parseBlocks(html);
    const sections = blocks.slice(1); // blocks[0] = مقدمهٔ تولیدی → دور ریخته
    const faqIdxGen = sections.findIndex((b) => {
      const h = b.match(/<h2[^>]*>([^<]*)</);
      return h ? FAQ_HEADING_RE.test(h[1]) : false;
    });
    const faqBlock = faqIdxGen >= 0 ? sections[faqIdxGen] : "";
    const relatedMatch = faqBlock.match(/<p><strong>مطالب مرتبط:[\s\S]*?<\/p>/);
    const relatedBlock = relatedMatch ? relatedMatch[0] : "";
    const contentSections = sections.filter((_, i) => i !== faqIdxGen);

    // ── ۴) نقطهٔ درج: قبل از h2 پرسش‌های متداولِ خود مقاله، وگرنه انتها ──
    const faqIdxOwn = findExistingFaqIndex(row.content);
    const hasOwnFaq = faqIdxOwn >= 0;

    // ── ۵) انتخاب تعداد بخش: تا رسیدن به هدف، با سقف سخت ──
    const chosen: string[] = [];
    let total = beforeLen;
    for (const sec of contentSections) {
      if (total >= TARGET_MIN_CHARS) break;
      if (total + sec.length + 2 > HARD_MAX_CHARS) break;
      chosen.push(sec);
      total += sec.length + 2;
    }
    // مسیر ریزِ حالت خاص: هیچ بخشی جا نشد → N بخش اول (تا سقف سخت)
    if (chosen.length === 0 && contentSections.length > 0) {
      for (const sec of contentSections.slice(0, SECTIONS_HARD_CAP)) {
        if (total + sec.length + 2 > HARD_MAX_CHARS) break;
        chosen.push(sec);
        total += sec.length + 2;
      }
    }

    // بخش‌هایی که مستقل از ترتیبِ درج، به «انتهای مطلق» مقاله می‌روند
    const tailExtras: string[] = [];
    if (!hasOwnFaq) {
      // مقالهٔ بدون FAQ → بلوک FAQ تولیدی (شامل مطالب مرتبط) در انتها
      if (faqBlock && total + faqBlock.length + 2 <= HARD_MAX_CHARS) {
        tailExtras.push(faqBlock);
        total += faqBlock.length + 2;
      }
    } else if (relatedBlock && total + relatedBlock.length + 2 <= HARD_MAX_CHARS) {
      // مقالهٔ دارای FAQ → فقط لینک‌های «مطالب مرتبط» در انتهای مطلق
      tailExtras.push(relatedBlock);
      total += relatedBlock.length + 2;
    }

    if (chosen.length === 0 && tailExtras.length === 0) {
      skipped++;
      console.log(`  SKIP ${row.slug} — بخشی برای الحاق تولید نشد`);
      continue;
    }

    // ── ترکیب نهایی (متن اصلی دست‌نخورده می‌ماند) ──
    const midInsert = chosen.join("\n\n");
    const tail = tailExtras.length ? "\n\n" + tailExtras.join("\n\n") : "";
    let newContent: string;
    if (hasOwnFaq) {
      const head = row.content.slice(0, faqIdxOwn).trimEnd();
      const rest = row.content.slice(faqIdxOwn).trimEnd();
      newContent = head + "\n\n" + midInsert + "\n\n" + rest + tail;
    } else {
      newContent = row.content.trimEnd() + "\n\n" + midInsert + tail;
    }

    // ── ۶) اعتبارسنجی و ذخیره ──
    const afterLen = newContent.length;
    const afterWords = countWords(newContent);
    if (afterLen < SHORT_LIMIT) {
      skipped++;
      console.log(
        `  SKIP ${row.slug} — حتی پس از الحاق زیر حد ماند (${afterLen} < ${SHORT_LIMIT})`
      );
      continue;
    }

    const minutes = Math.max(6, Math.round(afterWords / 220));
    update.run(newContent, minutes, nowBase + done, row.slug);
    done++;
    const cjk = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(newContent) ? " ⚠️CJK" : "";
    console.log(
      `  ✓ ${row.slug}\n` +
        `      کلمه(تقریبی): ${Math.round(beforeLen / 6.5)} → ${Math.round(afterLen / 6.5)} | ` +
        `کاراکتر: ${beforeLen} → ${afterLen} | کلمه(واقعی): ${beforeWords} → ${afterWords} | ` +
        `${row.readingTime} → ${minutes} دقیقه | +${chosen.length + tailExtras.length} بخش` +
        `${hasOwnFaq ? " | درج قبل از FAQ موجود" : " | الحاق انتها"}${cjk}`
    );
  }

  // ── گزارش پایانی ──
  const remaining = (
    db.query(`SELECT COUNT(*) c FROM BlogPost WHERE length(content) < ${SHORT_LIMIT}`).get() as {
      c: number;
    }
  ).c;
  const statuses = db.query("SELECT status, COUNT(*) c FROM BlogPost GROUP BY status").all();
  const total = (db.query("SELECT COUNT(*) c FROM BlogPost").get() as { c: number }).c;
  console.log(
    `\nالحاق‌شده: ${done} | رد‌شده: ${skipped} | باقی‌ماندهٔ کوتاه: ${remaining}` +
      ` | کل: ${total} | وضعیت‌ها: ${JSON.stringify(statuses)}`
  );
  if (remaining > 0) console.log("⚠️ هنوز مقالهٔ کوتاه مانده — خروجی بالا را ببینید.");
  db.close();
}

main().catch((e) => {
  console.error("expand-short-posts error:", e);
  process.exit(1);
});
