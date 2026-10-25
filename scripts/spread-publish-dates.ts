// ============================================================================
// scripts/spread-publish-dates.ts — پخش تاریخ انتشار انبوهٔ ۱۲۰ پست بلاگ
// ----------------------------------------------------------------------------
// Task 7-الف (بخش دوم): ۱۲۰ پست PUBLISHED همهٔ publishedAt یکسان دارند
// (timestamp انبوه 1791275072016 = انتشار ۱۲۰ مقاله در یک ثانیه = سیگنال بد سئو).
// این اسکریپت تاریخ‌ها را به‌صورت «تقویم محتوای طبیعی» پخش می‌کند:
//
//   ۱) خوشهٔ انبوه را پیدا می‌کند (هر timestamp که ≥۱۰ پست رویش است)
//   ۲) مرتب‌سازی: scheduleOrder → createdAt (قدیمی‌ترین تولید، قدیمی‌ترین انتشار)
//   ۳) فاصلهٔ هر پست با پست قبلی: ۶ تا ۲۴ ساعت (رندم قطعی با seed ثابت)
//   ۴) انتهای تقویم = امروز ساعت ۱۶:۰۰ زمان محلی؛ تاریخ‌ها به‌عقب ساخته می‌شوند
//      (نکته: ۱۲۰ پست × فاصلهٔ ۶-۲۴ ساعته ≈ ۷۴ روز — پنجرهٔ «۱۰ روز قبل»
//      با فاصلهٔ ۶-۲۴ ساعته ریاضی‌جات جور نمی‌شود؛ فاصلهٔ ساعتی ملاک است
//      و پنجره به‌اندازهٔ لازم کش می‌آید ≈ از اوایل شهریور تا امروز)
//   ۵) هیچ دو پستِ خوشه تاریخ یکسان نمی‌گیرند
//
// Idempotent: پس از اجرا، دیگر «خوشهٔ انبوه» وجود ندارد → اجرای مجدد no-op.
//
// اجرا:
//   DATABASE_URL="file:/home/z/my-project/hooshhesab-work/extracted/hooshhesab/db/custom.db" \
//     bun scripts/spread-publish-dates.ts
// ============================================================================

import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

// ─── تعیین مسیر مطلق دیتابیس پروژه (ضد-hijack متغیر محیطی سندباکس) ───
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORCED_DB_URL = `file:${join(PROJECT_ROOT, "db", "custom.db")}`;
process.env.DATABASE_URL = FORCED_DB_URL;

const prisma = new PrismaClient({ log: ["error", "warn"] });

// ─── رندم قطعی (deterministic) — mulberry32 با seed ثابت ───
const SEED = 20261023;
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** فاصلهٔ تصادفی ۶ تا ۲۴ ساعت (میلی‌ثانیه) — قطعی با seed */
function randomGapHours(rand: () => number): number {
  return 6 + rand() * 18; // ۶ تا ۲۴ ساعت
}

const MIN_CLUSTER = 10; // timestamp با ≥۱۰ پست = انبوه

async function main() {
  console.log("== spread-publish-dates: پخش تاریخ انتشار انبوه ==");
  console.log("DB:", FORCED_DB_URL);

  const published = await prisma.blogPost.findMany({
    where: { status: "PUBLISHED", publishedAt: { not: null } },
    select: {
      id: true,
      slug: true,
      publishedAt: true,
      createdAt: true,
      scheduleOrder: true,
    },
  });
  console.log(`کل پست‌های منتشرشده: ${published.length}`);

  // ─── خوشه‌یابی بر اساس timestamp یکسان ───
  const byTs = new Map<number, typeof published>();
  for (const p of published) {
    const ts = new Date(p.publishedAt as unknown as string).getTime();
    const arr = byTs.get(ts) || [];
    arr.push(p);
    byTs.set(ts, arr);
  }
  const clusters: Array<{ ts: number; posts: typeof published }> = [];
  for (const [ts, arr] of byTs) {
    if (arr.length >= MIN_CLUSTER) clusters.push({ ts, posts: arr });
  }

  if (clusters.length === 0) {
    console.log("هیچ خوشهٔ انبوهی پیدا نشد — تقویم انتشار سالم است. ✓ (no-op)");
    return;
  }

  const rand = mulberry32(SEED);
  let totalSpread = 0;

  for (const cluster of clusters) {
    console.log(
      `\n— خوشهٔ انبوه: ${cluster.posts.length} پست @ ${new Date(cluster.ts).toISOString()}`
    );

    // مرتب‌سازی: scheduleOrder (null آخر) سپس createdAt
    const posts = [...cluster.posts].sort((a, b) => {
      const oa = a.scheduleOrder ?? Number.MAX_SAFE_INTEGER;
      const ob = b.scheduleOrder ?? Number.MAX_SAFE_INTEGER;
      if (oa !== ob) return oa - ob;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    // انتهای تقویم = امروز ساعت ۱۶:۰۰ زمان محلی
    const end = new Date();
    end.setHours(16, 0, 0, 0);
    if (end.getTime() > Date.now()) {
      // اگر ساعت ۱۶ امروز هنوز نرسیده، انکر را یک ساعت قبل از «الان» بگذار
      end.setTime(Date.now() - 1 * 60 * 60 * 1000);
    }

    // تاریخ‌ها به‌عقب: آخرین پستِ مرتب‌شده = جدیدترین تاریخ
    const dates: Date[] = new Array(posts.length);
    dates[posts.length - 1] = new Date(end.getTime());
    for (let i = posts.length - 2; i >= 0; i--) {
      const gapH = randomGapHours(rand);
      dates[i] = new Date(dates[i + 1].getTime() - gapH * 3600 * 1000);
    }

    // به‌روزرسانی + گزارش
    let prev: Date | null = null;
    for (let i = 0; i < posts.length; i++) {
      const d = dates[i];
      await prisma.blogPost.update({
        where: { id: posts[i].id },
        data: { publishedAt: d },
      });
      totalSpread++;
      if (i < 3 || i === posts.length - 1) {
        const gap = prev ? ((d.getTime() - prev.getTime()) / 3600000).toFixed(1) : "—";
        console.log(
          `  ${String(i + 1).padStart(3, "0")}/${posts.length} «${posts[i].slug.slice(0, 42)}» → ${d.toISOString()} (فاصله از قبلی: ${gap}h)`
        );
      }
      prev = d;
    }
    console.log(
      `  بازهٔ تقویم: ${dates[0].toISOString()} → ${dates[dates.length - 1].toISOString()}`
    );
  }

  console.log(`\n✓ ${totalSpread} پست تاریخ‌دار شد.`);

  // ─── Verify ───
  const after = await prisma.blogPost.findMany({
    where: { status: "PUBLISHED", publishedAt: { not: null } },
    select: { slug: true, publishedAt: true },
  });
  const tsCount = new Map<string, number>();
  for (const p of after) {
    const k = new Date(p.publishedAt as unknown as string).toISOString();
    tsCount.set(k, (tsCount.get(k) || 0) + 1);
  }
  const dupes = [...tsCount.entries()].filter(([k, c]) => c > 1);
  const sortedDates = after
    .map((p) => new Date(p.publishedAt as unknown as string).getTime())
    .sort((a, b) => a - b);
  console.log(
    `Verify: ${after.length} پست منتشرشده | timestamp مشترک: ${dupes.length} ${
      dupes.length === 0 ? "✓" : JSON.stringify(dupes.slice(0, 5))
    }`
  );
  console.log(
    `Verify بازه: ${new Date(sortedDates[0]).toISOString()} → ${new Date(sortedDates[sortedDates.length - 1]).toISOString()}`
  );
  // بیشترین تعداد انتشار در یک روز تقویمی
  const perDay = new Map<string, number>();
  for (const t of sortedDates) {
    const k = new Date(t).toISOString().slice(0, 10);
    perDay.set(k, (perDay.get(k) || 0) + 1);
  }
  const busiest = [...perDay.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  console.log("پرمخاطرت‌ترین روزها:", JSON.stringify(busiest));
}

main()
  .catch((err) => {
    console.error("خطا در پخش تاریخ‌ها:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
