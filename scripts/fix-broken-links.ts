// ============================================================================
// scripts/fix-broken-links.ts — فیکس لینک‌های داخلی 404 به مقالات بلاگ
// ----------------------------------------------------------------------------
// Task 7-ب: ۲۴ اسلاگ در هاب‌های سئو (bank-data, hub-content, seo/topics,
// city-industry-data, tax-data) به `/blog/<slug>` لینک شده‌اند ولی مقاله‌شان
// اصلاً در دیتابیس نیست → لینک مرده/404 (سیگنال بد سئو).
//
// سیاست:
//   • PUBLISHED در DB → لینک نگه داشته می‌شود (keep)
//   • DRAFT/SCHEDULED در DB → لینک نگه داشته می‌شود (به‌زودی منتشر می‌شود)
//       + اسلاگ به «جلوی صف انتشار» منتقل می‌شود (scheduleOrder کوچک)
//         تا زودتر عمومی شود و لینک 404 موقتی کوتاه‌تر شود
//   • اصلاً در DB نیست → `href="/blog/<slug>"` → `href="/blog"` (فهرست بلاگ)
//
// Idempotent: اجرای مجدد چیزی نمی‌شکند (لینک‌های از-پیش-درست keep می‌شوند؛
// صف دوباره همان‌ترتیب می‌گیرد).
//
// اجرا:
//   DATABASE_URL="file:/home/z/my-project/hooshhesab-work/extracted/hooshhesab/db/custom.db" \
//     bun scripts/fix-broken-links.ts
// ============================================================================

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

// ─── تعیین مسیر مطلق دیتابیس پروژه (ضد-hijack متغیر محیطی سندباکس) ───
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORCED_DB_URL = `file:${join(PROJECT_ROOT, "db", "custom.db")}`;
process.env.DATABASE_URL = FORCED_DB_URL;

const prisma = new PrismaClient({ log: ["error", "warn"] });

const DEFAULT_INTERVAL_DAYS = 2;
const INTERVAL_SETTING_KEY = "blog_publish_interval_days";

/** فردا ساعت ۹:۰۰ صبح (زمان محلی) — مطابق lib/blog-scheduler.ts */
function nextRunAt9am(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

async function main() {
  console.log("== fix-broken-links: فیکس لینک‌های 404 هاب‌های سئو ==");
  console.log("DB:", FORCED_DB_URL);

  // ─── فایل‌های هدف ───
  const libDir = join(PROJECT_ROOT, "lib");
  const files: string[] = [
    join(libDir, "bank-data.ts"),
    join(libDir, "city-industry-data.ts"),
    join(libDir, "tax-data.ts"),
    ...readdirSync(join(libDir, "hub-content"))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => join(libDir, "hub-content", f)),
    ...readdirSync(join(libDir, "seo", "topics"))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => join(libDir, "seo", "topics", f)),
  ];
  console.log(`فایل‌های هدف: ${files.length}`);

  // ─── وضعیت DB برای همهٔ اسلاگ‌های لینک‌شده ───
  const publishedSet = new Set(
    (
      await prisma.blogPost.findMany({
        where: { status: "PUBLISHED" },
        select: { slug: true },
      })
    ).map((x) => x.slug)
  );
  const draftMap = new Map(
    (
      await prisma.blogPost.findMany({
        where: { status: "DRAFT" },
        select: { slug: true, scheduleOrder: true },
      })
    ).map((x) => [x.slug, x])
  );

  const LINK_RE = /\/blog\/([a-z0-9-]+)/g;
  const counts = {
    keptPublished: 0,
    keptDraft: 0,
    rewritten: 0,
  };
  const rewrittenBySlug = new Map<string, number>();
  const linkedDraftSlugs = new Set<string>();

  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      console.warn(`  (خواندن ${file} رد شد)`);
      continue;
    }

    const missingSlugs = new Set<string>();
    let m: RegExpExecArray | null;
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(content)) !== null) {
      const slug = m[1];
      if (publishedSet.has(slug)) counts.keptPublished++;
      else if (draftMap.has(slug)) {
        counts.keptDraft++;
        linkedDraftSlugs.add(slug);
      } else {
        missingSlugs.add(slug);
      }
    }

    if (missingSlugs.size === 0) continue;

    let newContent = content;
    for (const slug of missingSlugs) {
      // lookahead تا اسلاگ پیشوندِ اسلاگ بلندتر را خراب نکند
      const re = new RegExp(`/blog/${slug}(?![a-z0-9-])`, "g");
      const hits = (newContent.match(re) || []).length;
      if (hits > 0) {
        newContent = newContent.replace(re, "/blog");
        rewrittenBySlug.set(slug, (rewrittenBySlug.get(slug) || 0) + hits);
        counts.rewritten += hits;
      }
    }

    if (newContent !== content) {
      writeFileSync(file, newContent, "utf8");
      const rel = file.replace(PROJECT_ROOT + "/", "");
      console.log(
        `  ✓ ${rel}: ${missingSlugs.size} اسلاگ مرده → ${"/blog"} | ${
          (newContent.match(LINK_RE) || []).length
        } لینک بلاگ سالم باقی`
      );
    }
  }

  console.log("\n— خلاصهٔ لینک‌ها:");
  console.log(`  keep (PUBLISHED): ${counts.keptPublished}`);
  console.log(`  keep (DRAFT در صف): ${counts.keptDraft} → ${[...linkedDraftSlugs].join(", ") || "—"}`);
  console.log(`  بازنویسی‌شده به /blog: ${counts.rewritten}`);
  for (const [slug, n] of [...rewrittenBySlug.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`    - ${slug}: ${n}x`);
  }

  // ─── جلو انداختن DRAFT های لینک‌شده در صف انتشار ───
  if (linkedDraftSlugs.size > 0) {
    console.log("\n== اولویت‌دهی صف انتشار برای مقالاتِ لینک‌شده ==");

    let intervalDays = DEFAULT_INTERVAL_DAYS;
    try {
      const row = await prisma.systemSettings.findUnique({
        where: { key: INTERVAL_SETTING_KEY },
      });
      const n = Number(row?.value);
      if (Number.isFinite(n) && n >= 1 && n <= 30) intervalDays = Math.round(n);
    } catch {
      /* ignore */
    }

    const queue = await prisma.blogPost.findMany({
      where: { status: "DRAFT", scheduledPublishAt: { not: null } },
      select: { id: true, slug: true, scheduleOrder: true, scheduledPublishAt: true },
    });
    console.log(`  صف فعال: ${queue.length} پیش‌نویس | بازه: هر ${intervalDays} روز`);

    const linked = queue
      .filter((q) => linkedDraftSlugs.has(q.slug))
      .sort((a, b) => (a.scheduleOrder ?? 999) - (b.scheduleOrder ?? 999));
    const rest = queue
      .filter((q) => !linkedDraftSlugs.has(q.slug))
      .sort((a, b) => (a.scheduleOrder ?? 999) - (b.scheduleOrder ?? 999));
    const newOrder = [...linked, ...rest];

    // مبنای نوبت‌ها: اولین نوبتِ آیندهٔ صفِ فعلی (اگر معتبر) وگرنه فردا ۹ صبح
    const now = Date.now();
    const earliest = newOrder
      .map((q) => new Date(q.scheduledPublishAt as unknown as string).getTime())
      .sort((a, b) => a - b)[0];
    const base = earliest && earliest > now ? new Date(earliest) : nextRunAt9am();
    console.log(`  مبنای نوبت‌ها: ${base.toISOString()}`);

    let promoted = 0;
    for (let i = 0; i < newOrder.length; i++) {
      const slot = new Date(base.getTime() + i * intervalDays * 24 * 60 * 60 * 1000);
      const item = newOrder[i];
      const oldOrder = item.scheduleOrder;
      await prisma.blogPost.update({
        where: { id: item.id },
        data: { scheduleOrder: i + 1, scheduledPublishAt: slot },
      });
      if (linkedDraftSlugs.has(item.slug) && oldOrder !== i + 1) {
        promoted++;
        console.log(
          `  ⭐ «${item.slug}» → نوبت ${i + 1} @ ${slot.toISOString()} (قبلاً نوبت ${oldOrder})`
        );
      }
    }
    console.log(`  ✓ ${promoted} مقالهٔ لینک‌شده به جلوی صف منتقل شد.`);
    console.log(
      `  → لینک‌های این مقالات حداکثر تا ${Math.ceil(linked.length * intervalDays)} روز آینده عمومی می‌شوند.`
    );
  } else {
    console.log("\n(هیچ DRAFT لینک‌شده‌ای برای اولویت‌دهی وجود ندارد)");
  }
}

main()
  .catch((err) => {
    console.error("خطا در فیکس لینک‌ها:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
