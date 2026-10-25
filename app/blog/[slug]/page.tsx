import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
 ArrowRight,
 Clock,
 Calendar,
 BookOpen,
 Calculator,
 Receipt,
 Users,
 GraduationCap,
 Newspaper,
 FileCheck,
 ChevronLeft,
 Sparkles,
 type LucideIcon,
} from "lucide-react";
import { db } from "@/lib/db";
import { toPersianDigits } from "@/lib/persian";
import {
 generateArticleSchema,
 generateBreadcrumbSchema,
 generateFaqSchema,
 generateVideoObjectSchema,
 getSiteUrl,
 extractHeadingsWithIds,
 type FaqItem,
} from "@/lib/seo";
// E-E-A-T(v38): نویسندهٔ واقعی از تیم تحریریه
import { getEditorialTeamWithMaps } from "@/lib/editorial-team";
// GEO(v38): ویدیوی مقالات ستون — URL واقعی از تنظیمات (pillar_videos)
import { SocialShare } from "@/components/blog/social-share";
import { Badge } from "@/components/ui/badge";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
// Trick #14 (راند ۱۲): hreflang دوسویه — ۳ مقالهٔ ستون خلاصهٔ انگلیسی دارند
import { isEnglishMappedSlug } from "@/lib/seo/english-pillars";
import { TableOfContents } from "@/components/blog/table-of-contents";
// v35.6 (بخش ۴ سند پیشنهادها): امتیازدهی مقاله
import { ArticleRating } from "@/components/blog/article-rating";
// v35.6 (نقشهٔ راه ۳-۳): نوار پیشرفت مطالعه + ذخیره برای بعد
import { ArticleReadingTools } from "@/components/blog/article-reading-tools";

export const runtime = "nodejs";

// نگاشت دسته‌بندی‌ها به برچسب و آیکون فارسی
const CATEGORY_META: Record<
 string,
 { label: string; icon: LucideIcon }
> = {
 ACCOUNTING: { label: "حسابداری", icon: Calculator },
 TAX: { label: "مالیات", icon: Receipt },
 PAYROLL: { label: "حقوق و دستمزد", icon: Users },
 TUTORIAL: { label: "آموزش", icon: GraduationCap },
 EDUCATION: { label: "آموزش", icon: GraduationCap },
 NEWS: { label: "اخبار", icon: Newspaper },
 MODIAN: { label: "سامانه مودیان", icon: FileCheck },
};

interface BlogPostRow {
 id: string;
 slug: string;
 title: string;
 excerpt: string | null;
 content: string;
 coverImage: string | null;
 category: string;
 tags: string | null;
 status: string;
 publishedAt: Date | null;
 readingTime: number;
 metaTitle: string | null;
 metaDescription: string | null;
 focusKeyword: string | null;
 ogImage: string | null;
 canonicalUrl: string | null;
 authorId: string | null;
 createdAt: Date;
 updatedAt: Date;
}

// ساخت URL تصویر OG داینامیک برای مقالات
function buildOgImageUrl(post: BlogPostRow): string {
 const params = new URLSearchParams({
 title: post.title,
 type: "blog",
 });
 if (post.excerpt) params.set("description", post.excerpt);
 const catMeta = CATEGORY_META[post.category];
 if (catMeta) params.set("category", catMeta.label);
 if (post.publishedAt) {
 try {
 params.set(
 "date",
 new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "long",
 day: "numeric",
 }).format(post.publishedAt)
 );
 } catch {
 // ignore
 }
 }
 return `/api/og?${params.toString()}`;
}

// FIX(v37 — draft-aware blog): پیش‌نویس‌ها دیگر hard-404 نمی‌شوند.
// با ۲۰۰ مقالهٔ زمان‌بندی‌شده + لینک‌های داخلی بین مقاله‌ها، 404 یعنی صدها
// لینک شکسته و موج خطای Search Console. الگوی درست سئو برای محتوای زمان‌بندی‌شده:
//   HTTP 200 + robots:noindex,follow + صفحهٔ «به‌زودی» با مقاله‌های مرتبط
//   → اعتبار لینک حفظ می‌شود، URL قبلاً ایندکس‌شده به‌نرمی از ایندکس خارج می‌شود
//   و با انتشار خودکار، دوباره سریع ایندکس می‌شود.
async function getPost(slug: string): Promise<BlogPostRow | null> {
 const post = await db.blogPost.findUnique({ where: { slug } });
 if (!post || post.status === "ARCHIVED") return null;
 return post as unknown as BlogPostRow;
}

async function getRelatedPosts(
 slug: string,
 category: string,
 limit = 3
): Promise<BlogPostRow[]> {
 const related = await db.blogPost.findMany({
 where: {
 status: "PUBLISHED",
 slug: { not: slug },
 category,
 },
 orderBy: { publishedAt: "desc" },
 take: limit,
 });
 // اگر مقالات مرتبط کافی نبود، از سایر دسته‌ها پر می‌کنیم
 if (related.length < limit) {
 const filler = await db.blogPost.findMany({
 where: {
 status: "PUBLISHED",
 slug: { not: slug, notIn: related.map((r) => r.slug) },
 },
 orderBy: { publishedAt: "desc" },
 take: limit - related.length,
 });
 return [...related,...filler] as unknown as BlogPostRow[];
 }
 return related as unknown as BlogPostRow[];
}

// ============ متادیتای پویا برای SEO ============
export async function generateMetadata({
 params,
}: {
 params: Promise<{ slug: string }>;
}): Promise<Metadata> {
 const { slug } = await params;
 const [post, brand] = await Promise.all([getPost(slug), getBrandName()]);
 if (!post) {
 return {
 title: "مقاله یافت نشد",
 description: "مقاله موردنظر پیدا نشد.",
 robots: { index: false, follow: false },
 };
 }

 // FIX(v37): پیش‌نویسِ زمان‌بندی‌شده — noindex,follow (صفحهٔ «به‌زودی» با ۲۰۰)
 if (post.status !== "PUBLISHED") {
 const siteUrlD = await getSiteUrl();
 return {
 title: interpolateBrand(post.metaTitle || post.title, brand),
 description: interpolateBrand(
  post.metaDescription || post.excerpt || "این مقاله تخصصی حسابداری به‌زودی در بلاگ منتشر می‌شود.",
  brand
 ),
 alternates: { canonical: `${siteUrlD}/blog/${post.slug}` },
 robots: { index: false, follow: true },
 };
 }

 // نکته سئو: بدون برند — قالب layout یک‌بار «| هوش» اضافه می‌کند
 const title = interpolateBrand(post.metaTitle || post.title, brand);
 const description = interpolateBrand(
 post.metaDescription ||
 post.excerpt ||
 "مقاله تخصصی حسابداری و مالیات از هوش.",
 brand
 );
 // Task 7-ج: دامنه از تنظیمات برندینگ (وایت‌لیبل) — نه هاردکد
 const siteUrl = await getSiteUrl();
 const url = `${siteUrl}/blog/${post.slug}`;
 // در صورت تنظیم URL کانونیکال، همان canonicalFirst است
 const canonical = post.canonicalUrl || url;
 // Trick #14 (راند ۱۲): hreflang — فقط برای ۳ مقالهٔ ستونی که نسخهٔ انگلیسی
 // دارند (lib/seo/english-pillars) و canonical خارجی ندارند (canonical
 // بیرونی یعنی مرجع محتوا جای دیگر است — hreflang ناسازگار است).
 // fa → همین صفحه، en → /en/blog/<slug>، x-default → نسخهٔ فارسی.
 // دوطرفه است: صفحهٔ انگلیسی همین نگاشت را به فارسی برمی‌گرداند.
 const languages =
 !post.canonicalUrl && isEnglishMappedSlug(post.slug)
 ? {
 fa: url,
 en: `${siteUrl}/en/blog/${post.slug}`,
 "x-default": url,
 }
 : undefined;
 // ترجیح: ogImage coverImage تصویر OG داینامیک از /api/og
 const dynamicOg = buildOgImageUrl(post);
 const ogImage = post.ogImage || post.coverImage || dynamicOg;

 const catMeta = CATEGORY_META[post.category] || {
 label: "مقاله",
 icon: BookOpen,
 };

 return {
 title,
 description,
 keywords: post.focusKeyword
? [post.focusKeyword, "حسابداری", brand, catMeta.label]
: ["حسابداری", brand, catMeta.label],
 authors: [{ name: brand }],
 alternates: {
 canonical,
 ...(languages ? { languages } : {}),
 },
 openGraph: {
 title,
 description,
 url,
 siteName: brand,
 images: [
 {
 url: ogImage,
 width: 1200,
 height: 630,
 alt: post.title,
 },
 ],
 locale: "fa_IR",
 type: "article",
 publishedTime: post.publishedAt?.toISOString(),
 modifiedTime: post.updatedAt.toISOString(),
 tags: post.focusKeyword? [post.focusKeyword]: undefined,
 },
 twitter: {
 card: "summary_large_image",
 title,
 description,
 images: [ogImage],
 },
 robots: {
 index: true,
 follow: true,
 googleBot: {
 index: true,
 follow: true,
 "max-image-preview": "large",
 },
 },
 };
}

// تبدیل تاریخ میلادی به شمسی خوانا
function formatJalali(date: Date | null): string {
 if (!date) return "—";
 try {
 return new Intl.DateTimeFormat("fa-IR", {
 year: "numeric",
 month: "long",
 day: "numeric",
 }).format(date);
 } catch {
 return "—";
 }
}

// ============ ساخت JSON-LD با کمک‌توابع lib/seo.ts ============
// E-E-A-T(v38): نویسندهٔ واقعی (Person + sameAs + صفحهٔ /authors)
// GEO(v38): مقالات خبری مالیاتی NewsArticle می‌شوند (تاب اخبار گوگل)
function buildArticleJsonLd(
 post: BlogPostRow,
 brand: string,
 siteUrl: string,
 rating?: { average: number; count: number },
 author?: { name: string; role: string; sameAs: string[] }
) {
 const catMeta = CATEGORY_META[post.category] || { label: "مقاله" };
 const dynamicOg = buildOgImageUrl(post);
 const ogImage = post.ogImage || post.coverImage || dynamicOg;
 const postUrl = `${siteUrl}/blog/${post.slug}`;
 // GEO(v38): تشخیص مقالهٔ خبری — دستهٔ NEWS یا تگ news
 const isNews = post.category === "NEWS" || /(^|,)\s*news\s*(,|$)/i.test(post.tags || "");
 return generateArticleSchema({
 title: interpolateBrand(post.title, brand),
 description: interpolateBrand(
 post.metaDescription || post.excerpt || "مقاله تخصصی حسابداری و مالیات از هوش.",
 brand
 ),
 url: postUrl,
 image: ogImage,
 datePublished: post.publishedAt?.toISOString() || post.createdAt.toISOString(),
 dateModified: post.updatedAt.toISOString(),
 section: catMeta.label,
 keywords: post.focusKeyword? [post.focusKeyword, catMeta.label]: [catMeta.label],
 canonicalUrl: post.canonicalUrl || postUrl,
 rating,
 schemaType: isNews ? "NewsArticle" : "Article",
 // E-E-A-T(v38): نویسندهٔ Person با صفحهٔ نویسنده و sameAs
 authorType: author ? "Person" : "Organization",
 authorName: author?.name || interpolateBrand("هوش", brand),
 authorUrl: author ? `${siteUrl}/authors` : siteUrl,
 authorSameAs: author?.sameAs && author.sameAs.length > 0 ? author.sameAs : undefined,
 authorJobTitle: author?.role,
 });
}

// ─── Task 7-هـ (۴): FAQPage اختصاصی از محتوای خود مقاله ───
// قبلاً ۳ سوال ثابتِ generic روی «همهٔ» مقاله‌ها تزریق می‌شد = اسپم سیگنال برای
// گوگل (FAQ یکسان در ۱۳۰ صفحه). حالا بخش «سوالات متداول» خود مقاله پارس می‌شود
// (h2/h3 سوال + متن تا سوال بعدی)؛ اگر مقاله FAQ نداشت، FAQPage اصلاً emit نمی‌شود.

/** حذف تگ‌های HTML + نویسه‌های سازمانی + فشرده‌سازی فاصله‌ها */
function stripHtmlToText(html: string): string {
 return html
 .replace(/<[^>]+>/g, " ")
 .replace(/&nbsp;/gi, " ")
 .replace(/&amp;/gi, "&")
 .replace(/&quot;/gi, '"')
 .replace(/&#39;/g, "'")
 .replace(/&lt;/gi, "<")
 .replace(/&gt;/gi, ">")
 .replace(/\s+/g, " ")
 .trim();
}

interface HeadingPos {
 start: number;
 end: number;
 level: number;
 text: string;
}

const MAX_FAQ_ITEMS = 10;

/** پارس بخش سوالات متداول از HTML محتوای مقاله */
export function parseFaqFromContent(content: string): FaqItem[] {
 // ۱) همهٔ هدینگ‌های h2/h3 به‌ترتیبِ سند
 const headings: HeadingPos[] = [];
 const H_RE = /<(h[23])\b[^>]*>([\s\S]*?)<\/\1>/gi;
 let hm: RegExpExecArray | null;
 while ((hm = H_RE.exec(content)) !== null) {
 headings.push({
 start: hm.index,
 end: hm.index + hm[0].length,
 level: Number(hm[1][1]),
 text: stripHtmlToText(hm[2]),
 });
 }

 // ۲) پیدا کردن هدینگِ شروع بخش سوالات متداول
 const faqIdx = headings.findIndex((h) =>
 /(سوالات|سؤالات|پرسش‌های|پرسشهای)\s*(متداول|پرتکرار)/.test(h.text)
 );
 if (faqIdx === -1) return [];
 const faqHead = headings[faqIdx];

 // ۳) سوال‌ها: هدینگ‌های سطح زیرین بعد از سرصفحهٔ FAQ، تا هدینگِ هم‌سطح بعدی
 const faqHeadings: HeadingPos[] = [];
 for (let i = faqIdx + 1; i < headings.length; i++) {
 if (headings[i].level <= faqHead.level) break;
 faqHeadings.push(headings[i]);
 }

 // ۴) ساخت جفت‌های سوال/پاسخ — پاسخ = محتوای بین این سوال و سوال بعدی
 const faqs: FaqItem[] = [];
 for (const q of faqHeadings.slice(0, MAX_FAQ_ITEMS)) {
 // مرزِ پایان: هدینگِ بعدی (هر سطحی) یا انتهای محتوا
 let nextBoundary = content.length;
 for (const h of headings) {
 if (h.start >= q.end) {
 nextBoundary = h.start;
 break;
 }
 }
 const question = q.text
 .replace(/^\s*(?:سوال|سؤال|پرسش)\s*[:،]?\s*/u, "")
 .trim();
 const answerHtml = content.slice(q.end, nextBoundary);
 const answer = stripHtmlToText(answerHtml)
 .replace(/^\s*پاسخ\s*[:،]?\s*/u, "")
 .trim();
 if (question && answer) {
 faqs.push({ question, answer: answer.slice(0, 1200) });
 }
 }
 return faqs;
}

function buildFaqJsonLd(post: BlogPostRow): object | null {
 const faqs = parseFaqFromContent(post.content);
 if (faqs.length === 0) return null; // بدون بخش FAQ → بدون FAQPage (ضد-اسپم)
 return generateFaqSchema(faqs);
}

function buildBreadcrumbJsonLd(post: BlogPostRow, siteUrl: string) {
 const catMeta = CATEGORY_META[post.category] || { label: "مقاله" };
 return generateBreadcrumbSchema([
 { name: "خانه", url: siteUrl },
 { name: "بلاگ", url: `${siteUrl}/blog` },
 { name: catMeta.label, url: `${siteUrl}/blog?category=${post.category}` },
 { name: post.title, url: `${siteUrl}/blog/${post.slug}` },
 ]);
}

export default async function BlogPostPage({
 params,
}: {
 params: Promise<{ slug: string }>;
}) {
 const { slug } = await params;
 const [postRaw, brand, siteUrl] = await Promise.all([
 getPost(slug),
 getBrandName(),
 getSiteUrl(),
 ]);
 if (!postRaw) {
 notFound();
 }
 // ─── FIX(v37): رندر «به‌زودی» برای پیش‌نویس‌های زمان‌بندی‌شده (HTTP 200 + noindex) ───
 if (postRaw.status !== "PUBLISHED") {
 const draftTitle = interpolateBrand(postRaw.metaTitle || postRaw.title, brand);
 const draftExcerpt = postRaw.excerpt
 ? interpolateBrand(postRaw.excerpt, brand)
 : "این مقاله در صف انتشار زمان‌بندی‌شدهٔ بلاگ است و به‌زودی به‌صورت کامل منتشر می‌شود.";
 // مقاله‌های مرتبطِ منتشرشده — تا کاربر بدون لینک شکسته، محتوای مرتبط ببیند
 const relatedDraft = (await getRelatedPosts(postRaw.slug, postRaw.category, 3)).map((rp) => ({
 slug: rp.slug,
 title: interpolateBrand(rp.title, brand),
 excerpt: rp.excerpt ? interpolateBrand(rp.excerpt, brand) : "",
 }));
 // تاریخ انتشار برنامه‌ریزی‌شده (اگر زمان‌بندی شده باشد)
 let scheduledLabel = "";
 if (postRaw.scheduledPublishAt) {
 try {
 scheduledLabel = new Intl.DateTimeFormat("fa-IR", { dateStyle: "full" }).format(
 new Date(postRaw.scheduledPublishAt)
 );
 } catch {
 scheduledLabel = "";
 }
 }
 return (
 <div className="flex min-h-screen flex-col bg-background">
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
 <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" prefetch={false}>
 <ArrowRight className="h-4 w-4" /> بلاگ
 </Link>
 <Link href="/" className="inline-flex items-center gap-2" prefetch={false}>
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Sparkles className="h-3.5 w-3.5" /></span>
 <span className="text-sm font-bold">{brand}</span>
 </Link>
 </div>
 </header>
 <main className="flex-1">
 <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
 <div className="mb-8 flex items-center gap-3">
 <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"><Clock className="h-6 w-6" /></div>
 <Badge variant="secondary" className="text-xs">به‌زودی منتشر می‌شود</Badge>
 </div>
 <h1 className="mb-4 text-2xl font-extrabold leading-relaxed tracking-tight sm:text-3xl">{draftTitle}</h1>
 <p className="mb-6 leading-8 text-muted-foreground">{draftExcerpt}</p>
 <div className="mb-10 rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-5 text-sm leading-7 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
 <p>
 این مقاله در صف انتشار زمان‌بندی‌شدهٔ بلاگ {brand} است
 {scheduledLabel ? <> و طبق برنامهٔ انتشار، در <strong>{scheduledLabel}</strong> به‌صورت کامل منتشر می‌شود</> : null}.
 می‌توانید تا آن زمان مقاله‌های منتشرشدهٔ مرتبط زیر را بخوانید.
 </p>
 </div>
 {relatedDraft.length > 0 && (
 <section aria-label="مقاله‌های مرتبط" className="mb-10">
 <h2 className="mb-4 text-lg font-bold">مقاله‌های منتشرشدهٔ مرتبط</h2>
 <div className="grid gap-4 sm:grid-cols-3">
 {relatedDraft.map((rp) => (
 <Link key={rp.slug} href={`/blog/${rp.slug}`} prefetch={false} className="group rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm">
 <p className="mb-2 line-clamp-3 text-sm font-semibold leading-6 group-hover:text-primary">{rp.title}</p>
 <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{rp.excerpt}</p>
 </Link>
 ))}
 </div>
 </section>
 )}
 <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center">
 <p className="mb-3 text-sm font-semibold leading-7">همین حالا {brand} را ۷ روز رایگان امتحان کنید — بدون نیاز به کارت بانکی</p>
 <Link href="/pricing" className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-transform hover:scale-[1.02]" prefetch={false}>
 شروع رایگان <ChevronLeft className="h-4 w-4" />
 </Link>
 </div>
 </div>
 </main>
 </div>
 );
 }

 // درون‌یابی برند روی کل مقاله (عنوان/خلاصه/محتوای HTML) — تغییر برند
 // از پنل سوپرادمین بدون بازنویسی دیتابیس، همهٔ مقالات را پوشش می‌دهد
 const post: BlogPostRow = {
 ...postRaw,
 title: interpolateBrand(postRaw.title, brand),
 excerpt: postRaw.excerpt ? interpolateBrand(postRaw.excerpt, brand) : postRaw.excerpt,
 content: interpolateBrand(postRaw.content, brand),
 };
 const relatedRaw = await getRelatedPosts(post.slug, post.category, 3);
 const related = relatedRaw.map((rp) => ({
 ...rp,
 title: interpolateBrand(rp.title, brand),
 excerpt: rp.excerpt ? interpolateBrand(rp.excerpt, brand) : rp.excerpt,
 }));
 // v35.6: میانگین امتیاز مقاله از دیتابیس (SSR — بدون درخواست اضافهٔ کلاینت)
 let ratingAgg: { average: number; count: number } | undefined;
 try {
 const agg = await db.blogArticleRating.aggregate({
 where: { slug: post.slug },
 _avg: { rating: true },
 _count: { _all: true },
 });
 if (agg._count._all > 0) {
 ratingAgg = {
 average: Math.round((agg._avg.rating || 0) * 10) / 10,
 count: agg._count._all,
 };
 }
 } catch {
 // جدول امتیاز در دسترس نیست — ویجت با مقادیر صفر رندر می‌شود
 }
 const catMeta = CATEGORY_META[post.category] || {
 label: "مقاله",
 icon: BookOpen,
 };
 const CategoryIcon = catMeta.icon;

 // استخراج هدینگ‌ها برای TOC و افزودن id به هدینگ‌ها
 const { html: contentWithIds, headings } = extractHeadingsWithIds(post.content);
 const hasToc = headings.length >= 3; // فقط برای مقالاتی که ۳+ هدینگ دارند TOC نمایش بده

 // E-E-A-T(v38): نویسندهٔ ارشد تحریریه به اسکیما تزریق می‌شود
 let leadAuthor: { name: string; role: string; sameAs: string[] } | undefined;
 try {
 const team = await getEditorialTeamWithMaps();
 if (team.length > 0) leadAuthor = { name: team[0].name, role: team[0].role, sameAs: team[0].sameAs };
 } catch {
 // fallback نویسندهٔ سازمانی
 }
 const articleJsonLd = buildArticleJsonLd(post, brand, siteUrl, ratingAgg, leadAuthor);
 const faqJsonLd = buildFaqJsonLd(post);
 const breadcrumbJsonLd = buildBreadcrumbJsonLd(post, siteUrl);
 const postUrl = `${siteUrl}/blog/${post.slug}`;

 // GEO(v38): VideoObject — فقط وقتی URL ویدیوی واقعی برای این مقاله ست شده باشد
 // (SystemSettings کلید pillar_videos: { [slug]: { videoUrl, duration, uploadDate } })
 let videoJsonLd: ReturnType<typeof generateVideoObjectSchema> | null = null;
 try {
 const row = await db.systemSettings.findUnique({ where: { key: "pillar_videos" } });
 const map = row?.value ? (JSON.parse(row.value) as Record<string, { videoUrl?: string; duration?: string; uploadDate?: string }>) : null;
 const video = map?.[post.slug];
 if (video?.videoUrl && /^https?:\/\//.test(video.videoUrl)) {
 videoJsonLd = generateVideoObjectSchema({
 name: interpolateBrand(post.title, brand),
 description: post.metaDescription || post.excerpt || post.title,
 pageUrl: postUrl,
 videoUrl: video.videoUrl,
 thumbnailUrl: post.ogImage || post.coverImage || "/og-image.png",
 uploadDate: video.uploadDate || post.publishedAt?.toISOString() || post.createdAt.toISOString(),
 duration: video.duration,
 });
 }
 } catch {
 // بدون ویدیو — اسکیما emit نمی‌شود (سئوی صادقانه)
 }

 return (
 <div className="flex min-h-screen flex-col bg-background">
 {/* Header */}
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
 <Link
 href="/blog"
 className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
 prefetch={false}
 >
 <ArrowRight className="h-4 w-4" />
 بازگشت به بلاگ
 </Link>
 <Link
 href="/"
 className="inline-flex items-center gap-2"
 prefetch={false}
 >
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
 <Sparkles className="h-3.5 w-3.5" />
 </span>
 <span className="text-sm font-bold">{brand}</span>
 </Link>
 </div>
 </header>

 <main className="flex-1">
 <article className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
 {/* Breadcrumb */}
 <nav
 aria-label="مسیر"
 className="mb-6 flex items-center gap-1 text-xs text-muted-foreground"
 >
 <Link
 href="/"
 prefetch={false}
 className="transition-colors hover:text-foreground"
 >
 خانه
 </Link>
 <ChevronLeft className="h-3 w-3" />
 <Link
 href="/blog"
 prefetch={false}
 className="transition-colors hover:text-foreground"
 >
 بلاگ
 </Link>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">{catMeta.label}</span>
 </nav>

 {/* Category badge + meta */}
 <div className="mb-5 flex flex-wrap items-center gap-2">
 <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
 <CategoryIcon className="h-3.5 w-3.5" />
 {catMeta.label}
 </span>
 <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
 <Calendar className="h-3.5 w-3.5" />
 {formatJalali(post.publishedAt)}
 </span>
 <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
 <Clock className="h-3.5 w-3.5" />
 {toPersianDigits(post.readingTime)} دقیقه مطالعه
 </span>
 </div>

 {/* v35.6 (۳-۳): ابزار مطالعه — ذخیره برای بعد (+ نوار پیشرفت و چیپ وضعیت fixed) */}
 <div className="mb-6">
 <ArticleReadingTools
 slug={post.slug}
 title={post.title}
 readingMinutes={post.readingTime || 5}
 />
 </div>

 {/* Title */}
 <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
 {post.title}
 </h1>

 {post.excerpt && (
 <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
 {post.excerpt}
 </p>
 )}

 {/* Cover image placeholder */}
 {!post.coverImage && (
 <div className="mt-8 h-48 w-full overflow-hidden rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-background sm:h-64">
 <div
 aria-hidden="true"
 className="flex h-full w-full items-center justify-center opacity-30"
 style={{
 backgroundImage:
 "radial-gradient(circle at 25% 25%, rgba(79,70,229,0.4) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(79,70,229,0.2) 0%, transparent 50%)",
 }}
 />
 </div>
 )}
 {post.coverImage && (
 <Image
 src={post.coverImage}
 alt={post.title}
 width={1200}
 height={630}
 priority
 className="mt-8 h-48 w-full rounded-2xl object-cover sm:h-64"
 />
 )}

 {/* محتوا + TOC (در دو ستون برای دسکتاپ اگر TOC داریم) */}
 {hasToc? (
 <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-8">
 <div
 className="blog-content text-[15px] leading-8 text-foreground/90 sm:text-base sm:leading-9 min-w-0"
 dangerouslySetInnerHTML={{ __html: contentWithIds }}
 />
 <aside className="hidden lg:block">
 <div className="sticky top-20">
 <TableOfContents items={headings} />
 </div>
 </aside>
 </div>
 ): (
 <div
 className="blog-content mt-8 text-[15px] leading-8 text-foreground/90 sm:text-base sm:leading-9"
 dangerouslySetInnerHTML={{ __html: contentWithIds }}
 />
 )}

 {/* TOC موبایل (اگر طولانی است) */}
 {hasToc && (
 <div className="mt-8 lg:hidden">
 <TableOfContents items={headings} />
 </div>
 )}

 {/* Tags / focus keyword */}
 {post.focusKeyword && (
 <div className="mt-10 flex flex-wrap items-center gap-2 border-t border-border pt-6">
 <span className="text-xs text-muted-foreground">برچسب‌ها:</span>
 <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
 <BookOpen className="h-3 w-3 text-primary" />
 {post.focusKeyword}
 </span>
 <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
 {catMeta.label}
 </span>
 </div>
 )}

 {/* اشتراک‌گذاری اجتماعی */}
 <div className="mt-6 border-t border-border pt-6">
 <SocialShare
 url={postUrl}
 title={post.title}
 description={post.excerpt || post.metaDescription || undefined}
 />
 </div>

 {/* Share / CTA */}
 <div className="mt-8 rounded-2xl border border-primary/20 bg-primary/5 p-5">
 <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
 <div>
 <p className="text-sm font-bold text-foreground">
 {brand} — نرم‌افزار حسابداری هوشمند ایرانی
 </p>
 <p className="mt-1 text-xs text-muted-foreground">
 با هوش مصنوعی، اتصال به سامانه مودیان و ۱۶ ماژول تخصصی. ۷ روز
 رایگان، بدون کارت اعتباری.
 </p>
 </div>
 <a
 href="/"
 className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
 >
 شروع رایگان
 <ArrowRight className="h-3.5 w-3.5 rotate-180" />
 </a>
 </div>
 </div>
 {/* v35.6 (بخش ۴ سند پیشنهادها): امتیازدهی «این مقاله چقدر مفید بود؟» */}
 <ArticleRating
 slug={post.slug}
 initialAverage={ratingAgg?.average ?? 0}
 initialCount={ratingAgg?.count ?? 0}
 />
 </article>

 {/* Related posts — مقالات مرتبط (internal linking) */}
 {related.length > 0 && (
 <section className="border-t border-border bg-muted/30">
 <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
 <h2 className="text-xl font-bold text-foreground sm:text-2xl">
 مقالات مرتبط
 </h2>
 <p className="mt-1 text-sm text-muted-foreground">
 مطالب بیشتری که ممکن است برای شما جالب باشند.
 </p>

 <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
 {related.map((rp) => {
 const rpCat = CATEGORY_META[rp.category] || {
 label: "مقاله",
 icon: BookOpen,
 };
 const RpIcon = rpCat.icon;
 return (
 <Link
 key={rp.id}
 href={`/blog/${rp.slug}`}
 prefetch={false}
 className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
 >
 <div className="relative h-32 w-full overflow-hidden bg-gradient-to-br from-primary/15 via-primary/5 to-background">
 <div
 aria-hidden="true"
 className="absolute inset-0 grid grid-cols-6 grid-rows-3 gap-1 p-2 opacity-20"
 >
 {Array.from({ length: 18 }).map((_, i) => (
 <div
 key={i}
 className={`rounded-sm ${
 [3, 4, 9, 10].includes(i)? "bg-primary": "bg-transparent"
 }`}
 />
 ))}
 </div>
 <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium text-primary shadow-sm backdrop-blur-sm">
 <RpIcon className="h-2.5 w-2.5" />
 {rpCat.label}
 </span>
 </div>
 <div className="flex flex-1 flex-col p-4">
 <h3 className="text-sm font-bold text-foreground leading-snug line-clamp-2">
 {rp.title}
 </h3>
 <p className="mt-2 text-xs leading-relaxed text-muted-foreground line-clamp-2 flex-1">
 {rp.excerpt || "—"}
 </p>
 <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
 <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
 <Calendar className="h-2.5 w-2.5" />
 {formatJalali(rp.publishedAt)}
 </span>
 <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary transition-colors group-hover:text-primary/80">
 ادامه مطلب
 <ChevronLeft className="h-2.5 w-2.5" />
 </span>
 </div>
 </div>
 </Link>
 );
 })}
 </div>
 </div>
 </section>
 )}
 </main>

 {/* Footer */}
 <footer className="mt-auto border-t border-border bg-card">
 <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
 <p>
 {brand} {toPersianDigits("۱۴۰۳")} — تمامی حقوق محفوظ است.
 </p>
 <div className="flex items-center gap-3">
 <Link
 href="/blog"
 prefetch={false}
 className="inline-flex items-center gap-1 font-medium text-primary transition-colors hover:text-primary/80"
 >
 <BookOpen className="h-3.5 w-3.5" />
 بلاگ {brand}
 </Link>
 <Link
 href="/"
 prefetch={false}
 className="transition-colors hover:text-foreground"
 >
 صفحه اصلی
 </Link>
 </div>
 </div>
 </footer>

 {/* JSON-LD structured data — Article */}
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
 />
 {/* JSON-LD — FAQPage (Task 7-هـ: فقط وقتی مقاله واقعاً بخش سوالات متداول دارد) */}
 {faqJsonLd && (
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
 />
 )}
 {/* JSON-LD — BreadcrumbList */}
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
 />
 {/* GEO(v38) — VideoObject: فقط وقتی ویدیوی واقعی برای مقاله ست شده باشد */}
 {videoJsonLd && (
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: JSON.stringify(videoJsonLd) }}
 />
 )}
 </div>
 );
}
