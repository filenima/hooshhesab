import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
 BookOpen,
 Calculator,
 Receipt,
 Users,
 GraduationCap,
 Newspaper,
 FileCheck,
 Calendar,
 Clock,
 ChevronLeft,
 ChevronRight,
 Sparkles,
 Home,
 type LucideIcon,
} from "lucide-react";
import { db } from "@/lib/db";
import { toPersianDigits } from "@/lib/persian";
import { generateBreadcrumbSchema, SITE_URL } from "@/lib/seo";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
// v35.6 (نقشهٔ راه ۳-۳): فهرست مقالات ذخیره‌شدهٔ کاربر
import { SavedArticlesFab } from "@/components/blog/saved-articles-fab";

export const runtime = "nodejs";
// نکته سئو: force-dynamic اطمینان می‌دهد که صفحه در هر درخواست از دیتابیس
// بخواند و cache استاله با ۰ پست سرو نمی‌دهد.
// FIX(3-a باگ #۷): قبلاً findMany بدون select کل content (~۵MB HTML از ۱۳۰ پست)
// را در هر بازدید می‌کشید. حالا: فقط فیلدهای لیست + صفحه‌بندی ۹تایی.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 9; // ۱ ویژه + ۸ شبکه‌ای

// نگاشت دسته‌بندی‌ها به برچسب و آیکون فارسی
const CATEGORY_META: Record<string, { label: string; icon: LucideIcon }> = {
 ACCOUNTING: { label: "حسابداری", icon: Calculator },
 TAX: { label: "مالیات", icon: Receipt },
 PAYROLL: { label: "حقوق و دستمزد", icon: Users },
 TUTORIAL: { label: "آموزش", icon: GraduationCap },
 EDUCATION: { label: "آموزش", icon: GraduationCap },
 NEWS: { label: "اخبار", icon: Newspaper },
 MODIAN: { label: "سامانه مودیان", icon: FileCheck },
};

interface ListSearchParams {
 category?: string;
 page?: string;
}

function clampPage(raw: string | undefined): number {
 const n = Number(raw);
 if (!Number.isFinite(n) || n < 1) return 1;
 return Math.min(1000, Math.floor(n));
}

export async function generateMetadata({
 searchParams,
}: {
 searchParams: Promise<ListSearchParams>;
}): Promise<Metadata> {
 const { category, page } = await searchParams;
 const brand = await getBrandName();
 const pageNo = clampPage(page);
 const catLabel = category ? CATEGORY_META[category]?.label || category : null;

 const title =
 pageNo > 1
 ? interpolateBrand(
 catLabel
 ? `${catLabel} — صفحه ${toPersianDigits(pageNo)} | بلاگ هوش`
 : `مقالات حسابداری — صفحه ${toPersianDigits(pageNo)} | بلاگ هوش`,
 brand
 )
 : interpolateBrand(
 catLabel
 ? `مقالات ${catLabel} | بلاگ هوش`
 : "مقالات حسابداری، مالیات و سامانه مودیان | بلاگ هوش",
 brand
 );

 const canonical =
 pageNo > 1
 ? `${SITE_URL}/blog?page=${pageNo}${category ? `&category=${category}` : ""}`
 : category
 ? `${SITE_URL}/blog?category=${category}`
 : `${SITE_URL}/blog`;

 return {
 title,
 description: interpolateBrand(
 "جدیدترین مقالات تخصصی حسابداری، مالیات، ارزش افزوده، سامانه مودیان و حقوق و دستمزد از تیم هوش.",
 brand
 ),
 alternates: { canonical },
 openGraph: {
 title: interpolateBrand("بلاگ هوش", brand),
 description: interpolateBrand("مقالات تخصصی حسابداری، مالیات و سامانه مودیان از تیم هوش", brand),
 url: canonical,
 siteName: brand,
 type: "website",
 locale: "fa_IR",
 images: [
 {
 url: "/og-image.png",
 width: 1200,
 height: 630,
 alt: interpolateBrand("بلاگ هوش — مقالات تخصصی حسابداری و مالیات", brand),
 type: "image/png",
 },
 ],
 },
 twitter: {
 card: "summary_large_image",
 title: interpolateBrand("بلاگ هوش", brand),
 description: interpolateBrand("مقالات تخصصی حسابداری، مالیات و سامانه مودیان از تیم هوش", brand),
 images: ["/og-image.png"],
 },
 robots: { index: true, follow: true },
 };
}

interface BlogPostRow {
 id: string;
 slug: string;
 title: string;
 excerpt: string | null;
 coverImage: string | null;
 category: string;
 tags: string | null;
 publishedAt: Date | null;
 readingTime: number;
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

// FIX(3-a باگ #۷): فقط فیلدهای لیست (بدون content که ~۵MB بود) + صفحه‌بندی
async function getPublishedPage(category: string | undefined, page: number) {
 const where = category
 ? { status: "PUBLISHED", category }
 : { status: "PUBLISHED" };

 const [posts, total] = await Promise.all([
 db.blogPost.findMany({
 where,
 orderBy: { publishedAt: "desc" },
 select: {
 id: true,
 slug: true,
 title: true,
 excerpt: true,
 coverImage: true,
 category: true,
 tags: true,
 publishedAt: true,
 readingTime: true,
 },
 skip: (page - 1) * PAGE_SIZE,
 take: PAGE_SIZE,
 }),
 db.blogPost.count({ where }),
 ]);

 const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
 return {
 posts: posts as unknown as BlogPostRow[],
 total,
 totalPages,
 page: Math.min(page, totalPages),
 };
}

// دسته‌بندی‌های موجود با شمارش (سبک‌تر از fetch همهٔ ردیف‌ها)
async function getCategories(): Promise<string[]> {
 const rows = await db.blogPost.groupBy({
 by: ["category"],
 where: { status: "PUBLISHED" },
 _count: { _all: true },
 });
 return rows.map((r) => r.category).filter(Boolean);
}

function pageHref(page: number, category?: string): string {
 const params = new URLSearchParams();
 if (category) params.set("category", category);
 if (page > 1) params.set("page", String(page));
 const qs = params.toString();
 return qs ? `/blog?${qs}` : "/blog";
}

export default async function BlogIndexPage({
 searchParams,
}: {
 searchParams: Promise<ListSearchParams>;
}) {
 // FIX(3-a): در Next.js 16 باید searchParams قبل از دسترسی await شود —
 // قبلاً category از روی Promise خام destructur می‌شد → فیلتر دسته‌بندی
 // بی‌صدا کار نمی‌کرد (category همیشه undefined بود).
 const { category, page: pageRaw } = await searchParams;
 const pageParam = clampPage(pageRaw);
 const [result, brand, categories] = await Promise.all([
 getPublishedPage(category, pageParam),
 getBrandName(),
 getCategories(),
 ]);

 const { posts, totalPages, page } = result;

 // درون‌یابی برند روی عنوان/خلاصه (متن‌های DB با برند قدیمی «هوش» نوشته شده‌اند)
 const interpolated = posts.map((p) => ({
 ...p,
 title: interpolateBrand(p.title, brand),
 excerpt: p.excerpt ? interpolateBrand(p.excerpt, brand) : p.excerpt,
 }));

 // پست ویژه (اولین پست صفحهٔ اول)
 const showFeatured = page === 1;
 const featured = showFeatured ? interpolated[0] || null : null;
 const rest = showFeatured ? interpolated.slice(1) : interpolated;

 // JSON-LD BreadcrumbList برای صفحه‌ی ایندکس بلاگ
 const breadcrumbJsonLd = generateBreadcrumbSchema([
 { name: "خانه", url: SITE_URL },
 { name: "بلاگ", url: `${SITE_URL}/blog` },
 ]);

 // FIX(3-a باگ #۷): لینک‌های prev/next برای پیمایش سئو (React 19 به head می‌برد)
 const prevHref = page > 1 ? pageHref(page - 1, category) : null;
 const nextHref = page < totalPages ? pageHref(page + 1, category) : null;

 return (
 <div className="flex min-h-screen flex-col bg-background">
 {/* prev/next برای موتورهای جست‌وجو */}
 {prevHref && <link rel="prev" href={prevHref} />}
 {nextHref && <link rel="next" href={nextHref} />}

 {/* Header */}
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
 <Link
 href="/"
 className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
 prefetch={false}
 >
 <ChevronRight className="h-4 w-4" />
 بازگشت به خانه
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
 {/* Hero */}
 <section className="border-b border-border bg-gradient-to-b from-primary/5 to-background">
 <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
 {/* Breadcrumb */}
 <nav
 aria-label="مسیر"
 className="mb-6 flex items-center gap-1 text-xs text-muted-foreground"
 >
 <Link
 href="/"
 prefetch={false}
 className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
 >
 <Home className="h-3 w-3" />
 خانه
 </Link>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">بلاگ</span>
 </nav>

 <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl mb-6">
 <Image src="/images/hero-dashboard.webp" alt={interpolateBrand("بلاگ هوش — مقالات تخصصی حسابداری و مالیات", brand)} fill className="object-cover" priority sizes="(max-width: 768px) 100vw, 800px" />
 <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
 <div className="absolute bottom-0 inset-x-0 p-5 text-white">
 <h1 className="text-2xl font-extrabold drop-shadow-lg sm:text-3xl">مقالات تخصصی حسابداری و مالیات</h1>
 <p className="mt-1 text-sm opacity-90 drop-shadow-md sm:text-base">جدیدترین مطالب درباره‌ی حسابداری، سامانه مودیان، ارزش افزوده و حقوق و دستمزد — توسط متخصصان {brand}</p>
 </div>
 </div>

 {/* Category filter */}
 {categories.length > 0 && (
 <div className="mt-6 flex flex-wrap items-center gap-2">
 <Link
 href="/blog"
 prefetch={false}
 className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
 !category
 ? "border-primary bg-primary text-primary-foreground"
 : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30"
 }`}
 >
 همه
 </Link>
 {categories.map((cat) => {
 const meta = CATEGORY_META[cat] || { label: cat, icon: BookOpen };
 const Icon = meta.icon;
 const isActive = category === cat;
 return (
 <Link
 key={cat}
 href={`/blog?category=${cat}`}
 prefetch={false}
 className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
 isActive
 ? "border-primary bg-primary text-primary-foreground"
 : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30"
 }`}
 >
 <Icon className="h-3 w-3" />
 {meta.label}
 </Link>
 );
 })}
 </div>
 )}
 </div>
 </section>

 {/* Posts */}
 <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
 {interpolated.length === 0 ? (
 /* Empty state */
 <div className="flex flex-col items-center justify-center py-20 text-center">
 <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
 <BookOpen className="h-8 w-8 text-muted-foreground" />
 </div>
 <h2 className="mt-4 text-lg font-bold text-foreground">
 {category || page > 1
 ? "مقاله‌ای در این دسته‌بندی/صفحه یافت نشد"
 : "هنوز مقاله‌ای منتشر نشده"}
 </h2>
 <p className="mt-2 max-w-md text-sm text-muted-foreground">
 {category || page > 1
 ? "به‌زودی مقالات جدیدی در این زمینه منتشر خواهد شد."
 : "اولین مقالات بزودی منتشر می‌شوند. منتظر باشید!"}
 </p>
 <Link
 href="/"
 prefetch={false}
 className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
 >
 <Sparkles className="h-4 w-4" />
 شروع رایگان {brand}
 </Link>
 </div>
 ) : (
 <>
 {/* Featured post */}
 {featured && (
 <Link
 href={`/blog/${featured.slug}`}
 prefetch={false}
 className="group mb-8 flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 sm:flex-row"
 >
 <div className="relative h-48 w-full overflow-hidden bg-gradient-to-br from-primary/15 via-primary/5 to-background sm:h-auto sm:w-2/5">
 {featured.coverImage ? (
 <Image
 src={featured.coverImage}
 alt={featured.title}
 fill
 sizes="(max-width: 640px) 100vw, 40vw"
 loading="lazy"
 className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
 />
 ) : (
 <div
 aria-hidden="true"
 className="flex h-full w-full items-center justify-center opacity-30"
 style={{
 backgroundImage:
 "radial-gradient(circle at 25% 25%, rgba(79,70,229,0.4) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(79,70,229,0.2) 0%, transparent 50%)",
 }}
 />
 )}
 <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-[10px] font-medium text-primary shadow-sm backdrop-blur-sm">
 {(() => {
 const Icon = CATEGORY_META[featured.category]?.icon || BookOpen;
 return Icon ? <Icon className="h-3 w-3" /> : null;
 })()}
 {CATEGORY_META[featured.category]?.label || "مقاله"}
 </span>
 </div>
 <div className="flex flex-1 flex-col p-6">
 <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
 <Calendar className="h-3.5 w-3.5" />
 {formatJalali(featured.publishedAt)}
 <span className="mx-1">•</span>
 <Clock className="h-3.5 w-3.5" />
 {toPersianDigits(featured.readingTime)} دقیقه مطالعه
 </div>
 <h2 className="text-xl font-extrabold leading-tight text-foreground transition-colors group-hover:text-primary sm:text-2xl">
 {featured.title}
 </h2>
 {featured.excerpt && (
 <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
 {featured.excerpt}
 </p>
 )}
 <div className="mt-auto pt-4">
 <span className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors group-hover:text-primary/80">
 ادامه مطلب
 <ChevronLeft className="h-3.5 w-3.5" />
 </span>
 </div>
 </div>
 </Link>
 )}

 {/* Grid of other posts */}
 {rest.length > 0 && (
 <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
 {rest.map((post) => {
 const catMeta = CATEGORY_META[post.category] || {
 label: "مقاله",
 icon: BookOpen,
 };
 const Icon = catMeta.icon;
 return (
 <Link
 key={post.id}
 href={`/blog/${post.slug}`}
 prefetch={false}
 className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
 >
 <div className="relative h-32 w-full overflow-hidden bg-gradient-to-br from-primary/15 via-primary/5 to-background">
 {post.coverImage ? (
 <Image
 src={post.coverImage}
 alt={post.title}
 fill
 sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
 loading="lazy"
 className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
 />
 ) : (
 <div
 aria-hidden="true"
 className="absolute inset-0 grid grid-cols-6 grid-rows-3 gap-1 p-2 opacity-20"
 >
 {Array.from({ length: 18 }).map((_, i) => (
 <div
 key={i}
 className={`rounded-sm ${
 [3, 4, 9, 10].includes(i) ? "bg-primary" : "bg-transparent"
 }`}
 />
 ))}
 </div>
 )}
 <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium text-primary shadow-sm backdrop-blur-sm">
 <Icon className="h-2.5 w-2.5" />
 {catMeta.label}
 </span>
 </div>
 <div className="flex flex-1 flex-col p-4">
 <h3 className="text-sm font-bold text-foreground leading-snug line-clamp-2 transition-colors group-hover:text-primary">
 {post.title}
 </h3>
 {post.excerpt && (
 <p className="mt-2 text-xs leading-relaxed text-muted-foreground line-clamp-2 flex-1">
 {post.excerpt}
 </p>
 )}
 <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
 <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
 <Calendar className="h-2.5 w-2.5" />
 {formatJalali(post.publishedAt)}
 </span>
 <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
 <Clock className="h-2.5 w-2.5" />
 {toPersianDigits(post.readingTime)} دقیقه
 </span>
 </div>
 </div>
 </Link>
 );
 })}
 </div>
 )}

 {/* صفحه‌بندی — FIX(3-a باگ #۷) */}
 {totalPages > 1 && (
 <nav
 aria-label="صفحه‌بندی مقالات"
 className="mt-10 flex items-center justify-center gap-1.5 flex-wrap"
 >
 {/* قبلی */}
 {page > 1 ? (
 <Link
 href={pageHref(page - 1, category)}
 prefetch={false}
 className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
 aria-label="صفحهٔ قبل"
 rel="prev"
 >
 <ChevronRight className="h-3.5 w-3.5" />
 قبلی
 </Link>
 ) : (
 <span
 aria-disabled="true"
 className="inline-flex h-9 items-center gap-1 rounded-lg border border-border/50 px-3 text-xs text-muted-foreground/40"
 >
 <ChevronRight className="h-3.5 w-3.5" />
 قبلی
 </span>
 )}

 {/* شماره‌ها — پنجرهٔ اسلایدی حداکثر ۷ شماره */}
 {buildPageWindow(page, totalPages).map((p) =>
 p === page ? (
 <span
 key={p}
 aria-current="page"
 className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground"
 >
 {toPersianDigits(p)}
 </span>
 ) : (
 <Link
 key={p}
 href={pageHref(p, category)}
 prefetch={false}
 className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
 aria-label={`صفحهٔ ${toPersianDigits(p)}`}
 >
 {toPersianDigits(p)}
 </Link>
 )
 )}

 {/* بعدی */}
 {page < totalPages ? (
 <Link
 href={pageHref(page + 1, category)}
 prefetch={false}
 className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
 aria-label="صفحهٔ بعد"
 rel="next"
 >
 بعدی
 <ChevronLeft className="h-3.5 w-3.5" />
 </Link>
 ) : (
 <span
 aria-disabled="true"
 className="inline-flex h-9 items-center gap-1 rounded-lg border border-border/50 px-3 text-xs text-muted-foreground/40"
 >
 بعدی
 <ChevronLeft className="h-3.5 w-3.5" />
 </span>
 )}
 </nav>
 )}
 </>
 )}
 </section>
 </main>

 {/* Footer */}
 <footer className="mt-auto border-t border-border bg-card">
 <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
 <p>{brand} {toPersianDigits("۱۴۰۳")} — تمامی حقوق محفوظ است.</p>
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

 {/* v35.6 (۳-۳): دکمهٔ شناور ذخیره‌شده‌ها */}
 <SavedArticlesFab />

 {/* JSON-LD — BreadcrumbList */}
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
 />
 </div>
 );
}

/** پنجرهٔ اسلایدی شماره‌های صفحه — حداکثر ۷ شماره حول صفحهٔ فعلی */
function buildPageWindow(current: number, total: number): number[] {
 const maxVisible = 7;
 if (total <= maxVisible) {
 return Array.from({ length: total }, (_, i) => i + 1);
 }
 let start = Math.max(1, current - 3);
 const end = Math.min(total, start + maxVisible - 1);
 start = Math.max(1, end - maxVisible + 1);
 return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}
