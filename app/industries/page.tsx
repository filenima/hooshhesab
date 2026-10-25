import type { Metadata } from "next";
import Link from "next/link";
import { industries } from "@/lib/industry-data";
import { generateBreadcrumbSchema, generateArticleSchema, SITE_URL, generateFaqSchema, type FaqItem } from "@/lib/seo";
import { HubArticle } from "@/lib/hub-article";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
import { industriesArticleHtml, industriesFaqs } from "@/lib/hub-content/industries";
import { hubNavLinks } from "@/lib/hub-content/shared";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Sparkles, ArrowRight } from "lucide-react";
import Image from "next/image";
// v35.7 (نقشهٔ راه ۳-۴): گت‌وی تشخیص صنف — ۳ سوال تا صفحهٔ صنف اختصاصی
import { IndustryGateway } from "@/components/seo/industry-gateway";

const title = "نرم‌افزار حسابداری برای کسب و کار شما | ۷ صنعت";
const description =
 "راهنمای جامع نرم‌افزار حسابداری برای کسب و کار: نیازهای مالی ۷ صنعت (خرده‌فروشی، تولیدی، پیمانکاری، فروشگاه آنلاین و...) و راهکار هوش برای هر کدام";
const url = `${SITE_URL}/industries`;

export async function generateMetadata(): Promise<Metadata> {
 const brand = await getBrandName();
 const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(interpolateBrand("صنایع هوش", brand))}&type=listing`;
 return {
 title,
 description: interpolateBrand(description, brand),
 keywords: [
 "نرم افزار حسابداری برای کسب و کار",
 "نرم افزار حسابداري صنایع",
 "حسابداري خرده فروشي",
 "حسابداري توليدي",
 "حسابداري پيمانکاري",
 "حسابداري فروشگاه آنلاین",
 "هوشداري",
 ].map((k) => interpolateBrand(k, brand)),
 alternates: { canonical: url },
 openGraph: { title, description: interpolateBrand(description, brand), url, type: "website", locale: "fa_IR", siteName: interpolateBrand("هوش", brand), images: [{ url: ogImage, width: 1200, height: 630, alt: title }] },
 twitter: { card: "summary_large_image", title, description: interpolateBrand(description, brand), images: [ogImage] },
 robots: { index: true, follow: true },
 };
}

const itemListSchema = {
 "@context": "https://schema.org",
 "@type": "ItemList",
 name: "صنایع هوش",
 numberOfItems: industries.length,
 itemListElement: industries.map((ind, i) => ({
 "@type": "ListItem",
 position: i + 1,
 name: ind.name,
 url: `${SITE_URL}/industries/${ind.slug}`,
 })),
};

const breadcrumbSchema = generateBreadcrumbSchema([
 { name: "خانه", url: SITE_URL },
 { name: "صنایع", url },
]);

const articleSchema = generateArticleSchema({
 title: "نرم‌افزار حسابداری برای کسب و کار — راهنمای جامع صنعت‌به‌صنعت",
 description,
 url,
 image: "/images/hero-industries.webp",
 datePublished: "2025-09-12T08:00:00+03:30",
 dateModified: "2026-01-20T08:00:00+03:30",
 section: "صنایع",
 keywords: ["نرم‌افزار حسابداری برای کسب و کار", "حسابداری صنایع", "هوش"],
 canonicalUrl: url,
});

const faqSchema = generateFaqSchema(industriesFaqs as FaqItem[]);

export default async function IndustriesPage() {
 const brand = await getBrandName();
 return (
 <div className="flex min-h-screen flex-col bg-background" dir="rtl">
 <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
 <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
 <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" prefetch={false}>
 <ArrowRight className="h-4 w-4" />
 صفحه اصلی
 </Link>
 <Link href="/" className="inline-flex items-center gap-2" prefetch={false}>
 <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
 <Sparkles className="h-3.5 w-3.5" />
 </span>
 <span className="text-sm font-bold">{interpolateBrand("هوش", brand)}</span>
 </Link>
 </div>
 </header>

 <main className="flex-1">
 <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
 <nav aria-label="مسیر" className="mb-6 flex items-center gap-1 text-xs text-muted-foreground">
 <Link href="/" prefetch={false} className="transition-colors hover:text-foreground">خانه</Link>
 <ChevronLeft className="h-3 w-3" />
 <span className="text-foreground">صنایع</span>
 </nav>

 <div className="mb-8">
 <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl mb-6">
 <Image src="/images/hero-industries.webp" alt={interpolateBrand("نرم‌افزار حسابداری هوش برای صنایع مختلف", brand)} fill className="object-cover" priority sizes="(max-width: 768px) 100vw, 800px" />
 <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
 <div className="absolute bottom-0 inset-x-0 p-5 text-white">
 <h1 className="text-2xl font-extrabold drop-shadow-lg sm:text-3xl">نرم‌افزار حسابداری برای کسب و کار شما — صنعت‌به‌صنعت</h1>
 <p className="mt-1 text-sm opacity-90 drop-shadow-md sm:text-base">{interpolateBrand("هوش با ۱۶ ماژول تخصصی و قالب آمادهٔ هر صنعت، راهکار حسابداری اختصاصی برای کسب‌وکار شما", brand)}</p>
 </div>
 </div>
 </div>

 {/* v35.7 (۳-۴): گت‌وی تشخیص صنف — بالای شبکهٔ صنایع (شمولیت قیف) */}
 <IndustryGateway />

 <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
 {industries.map((ind) => {
 const Icon = ind.icon;
 return (
 <Link key={ind.slug} href={`/industries/${ind.slug}`} prefetch={false} className="group">
 {/* v35.7: کارت صنف با زبان طراحی هماهنگ گت‌وی — نوار لهجه + آیکون گرادیانی + لیفت */}
 <Card className="relative h-full overflow-hidden transition-all duration-300 group-hover:-translate-y-1 group-hover:border-primary/40 group-hover:shadow-lg group-hover:shadow-primary/10">
 <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-emerald-500 via-teal-400 to-amber-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100" aria-hidden="true" />
 <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)", backgroundSize: "18px 18px", color: "rgb(16 185 129 / 0.06)", maskImage: "radial-gradient(ellipse 80% 70% at 50% 0%, black, transparent 75%)", WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 50% 0%, black, transparent 75%)" }} aria-hidden="true" />
 <CardHeader>
 <div className="flex items-center gap-3">
 <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-amber-500/10 text-primary transition-transform duration-300 group-hover:scale-105">
 <Icon className="h-5 w-5" />
 </div>
 <CardTitle className="text-base font-bold transition-colors group-hover:text-primary">{ind.name}</CardTitle>
 </div>
 </CardHeader>
 <CardContent>
 <p className="text-sm leading-relaxed text-muted-foreground line-clamp-3">{ind.description}</p>
 <div className="mt-3 flex flex-wrap gap-1.5">
 {ind.recommendedModules.slice(0, 3).map((mod) => (
 <Badge key={mod} variant="outline" className="border-border/70 bg-background/40 text-[10px] transition-colors group-hover:border-primary/25 group-hover:text-foreground">{mod}</Badge>
 ))}
 </div>
 <div className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-primary opacity-0 transition-all duration-300 group-hover:translate-x-[-4px] group-hover:opacity-100">
 مشاهدهٔ راهکار
 <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
 </div>
 </CardContent>
 </Card>
 </Link>
 );
 })}
 </div>

 <div className="mt-10 rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
 <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
 <div>
 <p className="text-sm font-bold text-foreground">صنعت خود را نیافتید؟</p>
 <p className="mt-1 text-xs text-muted-foreground">{interpolateBrand("هوش قابل سفارشی‌سازی برای هر صنعت است — با پشتیبانی رایگان راه‌اندازی", brand)}</p>
 </div>
 <Link href="/pricing" prefetch={false} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
 شروع آزمایش رایگان ۷ روزه
 <ChevronLeft className="h-3.5 w-3.5" />
 </Link>
 </div>
 </div>

 {/* ===== محتوای بلند سئو: ۴۰۰۰+ کلمه + فهرست مطالب + FAQ + CTA ===== */}
 <HubArticle html={industriesArticleHtml} faqs={industriesFaqs} faqTitle="پرسش‌های متداول دربارهٔ نرم‌افزار حسابداری صنایع" />

 {/* Hub nav */}
 <div className="mt-10 border-t border-border pt-8">
 <h2 className="text-lg font-bold text-foreground">{interpolateBrand("ادامهٔ مسیر شما در هوش", brand)}</h2>
 <div className="mt-4 flex flex-wrap gap-2">
 {hubNavLinks("/industries").map((l) => (
 <Link key={l.href} href={l.href} prefetch={false} className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 hover:bg-primary/5">
 {l.title}
 </Link>
 ))}
 </div>
 </div>
 </div>
 </main>

 <footer className="mt-auto border-t border-border bg-card">
 <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
 <p>{interpolateBrand("هوش — تمامی حقوق محفوظ است.", brand)}</p>
 <div className="flex items-center gap-3">
 <Link href="/" prefetch={false} className="font-medium text-primary transition-colors hover:text-primary/80">صفحه اصلی</Link>
 <Link href="/features" prefetch={false} className="transition-colors hover:text-foreground">امکانات</Link>
 </div>
 </div>
 </footer>

 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify(itemListSchema), brand) }} />
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify(faqSchema), brand) }} />
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: interpolateBrand(JSON.stringify(articleSchema), brand) }} />
 </div>
 );
}
