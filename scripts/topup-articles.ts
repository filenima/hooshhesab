// ============================================================================
// scripts/topup-articles.ts — پر کردن شکاف کتابخانهٔ بلاگ تا سقف ۲۶۷ (v37)
// ----------------------------------------------------------------------------
// هدف مالک: «۲۶۷ وبلاگ کامل (۶۷ منتشر + ۲۰۰ پیش‌نویس)».
// موتور LLM (seo-worker) با سقف نرخ 429 در سندباکس کند است (~۹دقیق/مقاله)؛
// این اسکریپت شکاف باقی‌مانده را با مولد قطعیِ topup-generator پر می‌کند
// (مقاله‌های ۳۰۰۰+ کلمه‌ای از بانک محتوای واقعی خوشه‌ها؛ قابل بازتولید بعدی
// با AI از پنل «محتوا و سئو»).
//
// منطق:
//   ۱) هدف = TARGET_TOTAL (پیش‌فرض ۲۶۷)
//   ۲) موجود = COUNT(BlogPost)
//   ۳) نیاز = هدف − موجود
//   ۴) تاپیک‌های مجاز = TOPIC_BANK مرتب، منهایِ اسلاگ‌های موجود،
//      منهایِ لیستِ «در دستِ seo-worker» (که قطعی بازتولیدی‌اش می‌کنیم)
//   ۵) برای هر تاپیک: generateTemplateArticle → ذخیره به‌عنوان DRAFT
//      با تگ‌های cluster:<x> و gen:template (قابل شناسایی/بازتولید)
//
// اجرا:  bun scripts/topup-articles.ts [هدف]
// ============================================================================

import { readFileSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.env.DATABASE_URL = `file:${join(PROJECT_ROOT, "db", "custom.db")}`;

const prisma = new PrismaClient({ log: ["error", "warn"] });

const TARGET_TOTAL = Number(process.argv[2]) || 267;

async function main() {
  console.log("== topup-articles: پر کردن شکاف کتابخانهٔ بلاگ ==");

  // بانک موضوع (relative import با bun کار می‌کند)
  const { TOPIC_BANK } = await import("../lib/seo/topic-bank");
  const { generateTemplateArticle } = await import("../lib/seo/topup-generator");
  const { countWords } = await import("../lib/seo/article-core");

  const existingCount = await prisma.blogPost.count();
  const need = TARGET_TOTAL - existingCount;
  console.log(`موجود: ${existingCount} | هدف: ${TARGET_TOTAL} | نیاز: ${need}`);
  if (need <= 0) {
    console.log("کتابخانه از قبل به هدف رسیده — کاری نیست.");
    return;
  }

  const existingSlugs = new Set(
    (await prisma.blogPost.findMany({ select: { slug: true } })).map((p) => p.slug)
  );

  // FIX(v37): به‌جای حذف کل لیست ۸۴تایی worker (که شاید کامل نشود)، فقط
  // اسلاگ‌های «در حال تولید» را از وضعیت زندهٔ worker مستثنی می‌کنیم تا
  // تداخل نوشتن پیش نیاید؛ doneها که در DB هستند با dupe-check رد می‌شوند.
  const inflight = new Set<string>();
  try {
    const res = await fetch("http://127.0.0.1:3035/status", { signal: AbortSignal.timeout(4000) });
    const j = (await res.json()) as { runs?: { articles?: { slug: string; status: string }[] }[] };
    for (const run of j.runs || []) {
      for (const a of run.articles || []) {
        if (a.status === "generating") inflight.add(a.slug);
      }
    }
    console.log(`در حال تولید توسط seo-worker: ${inflight.size} تاپیک (رد می‌شوند)`);
  } catch {
    console.log("seo-worker پاسخ نداد — بدون مستثنی‌کردن in-flight ادامه می‌دهیم (dupe-check محافظ است)");
  }

  // تاپیک‌های مجاز: استفاده‌نشده و not-in-flight — به‌ترتیب بانک (اولویت طبیعی)
  const candidates = TOPIC_BANK.filter(
    (t) => !existingSlugs.has(t.slug) && !inflight.has(t.slug)
  );
  console.log(`تاپیک‌های آزاد برای topup: ${candidates.length}`);

  // مقالات مرتبط برای لینک‌سازی — از همین خوشه، منتشرشده
  const relatedPool = await prisma.blogPost.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true, title: true, tags: true },
    take: 120,
  });

  let created = 0;
  let shortSkipped = 0;
  for (const topic of candidates) {
    if (created >= need) break;
    // رد تایپیک‌هایی که وسط کار توسط worker ساخته شده‌اند (قفل SQLite هم محافظت می‌کند)
    const dupe = await prisma.blogPost.findUnique({ where: { slug: topic.slug } });
    if (dupe) continue;

    // مرتبط‌ها از همان خوشه در صورت وجود
    const related = relatedPool
      .filter((p) => {
        try {
          const tags: string[] = JSON.parse(p.tags || "[]");
          return tags.includes(`cluster:${topic.cluster}`);
        } catch {
          return false;
        }
      })
      .slice(0, 3)
      .map((p) => ({ slug: p.slug, title: p.title }));

    const { html, validation } = generateTemplateArticle(topic, related);
    if (validation.words < 3000 || validation.cjkChars > 0) {
      shortSkipped++;
      console.log(`  SKIP ${topic.slug} — words=${validation.words} cjk=${validation.cjkChars}`);
      continue;
    }

    const now = new Date();
    const minutes = Math.max(6, Math.round(validation.words / 220));
    await prisma.blogPost.create({
      data: {
        slug: topic.slug,
        title: topic.title,
        excerpt: (await import("../lib/seo/article-core")).extractExcerpt(html),
        content: html,
        coverImage: topic.coverImage,
        category: topic.category,
        tags: JSON.stringify([`cluster:${topic.cluster}`, "gen:template"]),
        status: "DRAFT",
        readingTime: minutes,
        metaTitle: topic.title,
        metaDescription: `${topic.focusKeyword} — راهنمای کامل با مثال عددی، جدول و چک‌لیست عملی | ${topic.title}`,
        focusKeyword: topic.focusKeyword,
        createdAt: now,
        updatedAt: now,
      },
    });
    created++;
    console.log(
      `  + ${topic.slug} — ${validation.words} کلمه، ${validation.tables} جدول ✓`
    );
  }

  const finalCount = await prisma.blogPost.count();
  console.log(
    `\nساخته‌شده: ${created} | رد‌شده(کوتاه): ${shortSkipped} | جمع نهایی: ${finalCount}/${TARGET_TOTAL}`
  );
  if (finalCount < TARGET_TOTAL) {
    console.log(
      `⚠️ هنوز ${TARGET_TOTAL - finalCount} تا کم است — بانک موضوع تمام شده یا منابع کافی نیست؛ گزینه: اجرای دوباره پس از اتمام runِ worker.`
    );
  }
}

main()
  .catch((e) => {
    console.error("topup error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
