import { db } from "@/lib/db";
import { getSiteUrl } from "@/lib/seo";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";

export const runtime = "nodejs";
// Task 7-د (۲): فایل llms-full.txt — متن سادهٔ ۵ مقالهٔ پیلار برای موتورهای
// پاسخ‌گویی هوش مصنوعی (AI Overviews / GEO). استاتیک با بازاعتبارسنجی روزانه.
export const dynamic = "force-static";
export const revalidate = 86400;

/** تبدیل HTML محتوای مقاله به متن سادهٔ خوانا برای LLM ها */
function htmlToPlainText(html: string): string {
 return html
  // شکستن خط در تگ‌های بلوکی
  .replace(/<\s*(br|\/p|\/h[1-6]|\/li|\/tr|\/table|\/blockquote|\/div)[^>]*>/gi, "\n")
  // حذف بقیهٔ تگ‌ها
  .replace(/<[^>]+>/g, " ")
  // نویسه‌های سازمانی
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  // فشرده‌سازی فاصله‌ها و حفظ ساختار پاراگراف
  .replace(/[ \t]+/g, " ")
  .replace(/\n[ \t]+/g, "\n")
  .replace(/[ \t]+\n/g, "\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();
}

// GET /llms-full.txt — متن کامل ۵ مقالهٔ پیلار (بدون HTML)
export async function GET() {
 const [siteUrl, brand] = await Promise.all([getSiteUrl(), getBrandName()]);

 const posts = await db.blogPost.findMany({
  where: { status: "PUBLISHED" },
  select: {
   slug: true,
   title: true,
   excerpt: true,
   content: true,
   publishedAt: true,
   readingTime: true,
   category: true,
  },
 });

 if (posts.length === 0) {
  return new Response("هنوز مقاله‌ای منتشر نشده است.", {
   headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
 }

 // رتبه‌بندی «مهم‌ترین پیلار» بر اساس publishedAt + readingTime:
 // جامعیت (زمان مطالعه؛ پیلار = راهنمای بلند ۳۰+ دقیقه‌ای) و تازگی (سال اخیر)
 const now = Date.now();
 const scored = posts
  .map((p) => {
   const daysOld = p.publishedAt
    ? Math.max(0, (now - new Date(p.publishedAt).getTime()) / 86_400_000)
    : 365;
   const recency = Math.max(0, 1 - daysOld / 365); // ۰ تا ۱
   const comprehensiveness = Math.min(1, (p.readingTime || 0) / 30); // ۳۰ دقیقه = پیلار کامل
   return { p, score: comprehensiveness * 0.65 + recency * 0.35 };
  })
  .sort((a, b) => b.score - a.score)
  .slice(0, 5);

 const parts: string[] = [];
 // FIX(v37→v38): درون‌یابی برند «هوش» بی‌اثر است (برند = قدیمی)؛
 // نام کامل «هوش‌حساب» فقط وقتی از برند کوتاه فرق دارد.
 parts.push(`# ${brand}${brand === "هوش" ? " (هوش‌حساب)" : ""} — مقالات پیلار`);
 parts.push("");
 parts.push(
  `> این فایل متن کامل ${scored.length} مقالهٔ راهنمای کلیدی ${brand} را به‌صورت متن ساده (بدون HTML) برای موتورهای پاسخ‌گویی و خلاصه‌سازی هوش مصنوعی ارائه می‌کند. برای فهرست کامل ساختار سایت، llms.txt را ببینید.`
 );
 parts.push("");
 parts.push(`منبع: ${siteUrl}`);
 parts.push(`نقشهٔ سایت: ${siteUrl}/sitemap.xml`);
 parts.push(`فهرست راهنما: ${siteUrl}/llms.txt`);
 parts.push("");

 for (const { p } of scored) {
  const url = `${siteUrl}/blog/${p.slug}`;
  const title = interpolateBrand(p.title, brand);
  const summary = interpolateBrand(p.excerpt || "", brand);
  const body = interpolateBrand(htmlToPlainText(p.content), brand);

  parts.push("=".repeat(72));
  parts.push(`# ${title}`);
  parts.push("");
  parts.push(`- URL: ${url}`);
  if (summary) parts.push(`- خلاصه: ${summary}`);
  parts.push(`- زمان مطالعه: ${p.readingTime || 5} دقیقه`);
  parts.push(`- تاریخ انتشار: ${p.publishedAt ? new Date(p.publishedAt).toISOString().slice(0, 10) : "-"}`);
  parts.push("");
  parts.push(body);
  parts.push("");
 }

 return new Response(parts.join("\n"), {
  headers: {
   "Content-Type": "text/plain; charset=utf-8",
   "Cache-Control": "public, max-age=86400, stale-while-revalidate=43200",
  },
 });
}
