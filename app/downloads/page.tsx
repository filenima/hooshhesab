import type { Metadata } from "next";
import Link from "next/link";
import {
  generateBreadcrumbSchema,
  generateFaqSchema,
  getSiteUrl,
  type FaqItem,
} from "@/lib/seo";
import { HubArticle } from "@/lib/hub-article";
import { downloadsArticleHtml, downloadsFaqs } from "@/lib/hub-content/downloads";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
import { ReportDownloadButton } from "@/components/seo/report-download-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, Building2, ChevronLeft, CloudCog, FileDown, FileText, ShieldCheck, Sparkles, Store } from "lucide-react";

// ============================================================
// /downloads — گزارش‌های رایگان (لیدمگنت نرم)
// ============================================================
// ۳ گزارش مرجع → PDF قابل‌چاپ (بدون فرم/ایمیل — Save as PDF)
// سیگنال: برند + بازدید برگشتی + ارجاع طبیعی + E-E-A-T

export const dynamic = "force-dynamic";

const PAGE_TITLE = "گزارش‌های رایگان حسابداری و مالیات | دانلود PDF بدون ایمیل";
const PAGE_DESCRIPTION =
  "سه گزارش مرجع هوش: سامانه مودیان، راه‌اندازی حسابداری فروشگاه از صفر و مقایسهٔ حسابداری ابری — PDF رایگان بدون فرم و ایمیل";

const REPORTS = [
  {
    slug: "moadian-system-complete-guide",
    title: "مرجع کامل سامانه مودیان",
    desc: "از ثبت‌نام تا رفع مغایرت: مهلت‌ها، الگوهای الف/ب/ج، عیب‌یابی ردشدن صورتحساب و پیشگیری از ماده ۱۶۹ — برای همهٔ مودیان مشمول.",
    icon: ShieldCheck,
    tag: "پرتابرین",
    pages: "۱۲ بخش مرجعی",
  },
  {
    slug: "store-accounting-from-zero",
    title: "حسابداری فروشگاه از صفر تا مودیان",
    desc: "نقشهٔ راه هفته‌به‌هفتهٔ مهاجرت از دفتر کاغذی به سیستم واقعی: کدینگ ساده، روتین روزانه، انبار و اولین ارسال مودیان.",
    icon: Store,
    tag: "شروع سریع",
    pages: "برنامهٔ ۴ هفته‌ای",
  },
  {
    slug: "cloud-accounting-software-what-is-1404",
    title: "حسابداری ابری چیست؟ راهنمای انتخاب",
    desc: "مقایسهٔ ساختاری ابری و دسکتاپ با جدول هزینهٔ واقعی پنج‌ساله (TCO)، ریسک‌های هر مسیر و سوالات پیش از خرید از هر فروشنده.",
    icon: CloudCog,
    tag: "تصمیم پنج‌ساله",
    pages: "جدول‌های مقایسه",
  },
];

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandName();
  const siteUrl = await getSiteUrl();
  const ogImage = `${siteUrl}/api/og?title=${encodeURIComponent("گزارش‌های رایگان " + brand)}&description=${encodeURIComponent("PDF بدون ایمیل — مودیان، فروشگاه، ابری")}&type=report`;
  return {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    keywords: interpolateBrand(
      ["دانلود رایگان گزارش مالیاتی", "PDF سامانه مودیان", "راهنمای حسابداری فروشگاه", "مقایسه نرم افزار حسابداری pdf"],
      brand
    ),
    authors: [{ name: interpolateBrand("هوش", brand), url: `${siteUrl}/authors` }],
    alternates: { canonical: `${siteUrl}/downloads` },
    openGraph: {
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      url: `${siteUrl}/downloads`,
      siteName: interpolateBrand("هوش", brand),
      images: [{ url: ogImage, width: 1200, height: 630, alt: PAGE_TITLE }],
      locale: "fa_IR",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      images: [ogImage],
    },
    robots: { index: true, follow: true },
  };
}

export default async function DownloadsPage() {
  const brand = await getBrandName();
  const siteUrl = await getSiteUrl();

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: "خانه", url: siteUrl },
    { name: "گزارش‌های رایگان", url: `${siteUrl}/downloads` },
  ]);
  const faqSchema = generateFaqSchema(downloadsFaqs as FaqItem[]);

  // ItemList schema — سه گزارش دانلودی
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${siteUrl}/downloads#list`,
    name: PAGE_TITLE,
    itemListElement: REPORTS.map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: r.title,
      url: `${siteUrl}/blog/${r.slug}`,
    })),
  };

  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="inline-flex items-center gap-2" prefetch={false}>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-bold">{interpolateBrand("هوش", brand)}</span>
          </Link>
          <Link href="/pricing" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" prefetch={false}>
            پلن‌ها و قیمت
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <nav aria-label="مسیر" className="mb-6 flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/" prefetch={false} className="transition-colors hover:text-foreground">خانه</Link>
            <ChevronLeft className="h-3 w-3" />
            <span className="text-foreground">گزارش‌های رایگان</span>
          </nav>

          <div className="mb-10">
            <Badge variant="secondary" className="mb-4 text-xs">
              <FileDown className="h-3 w-3" /> بدون فرم · بدون ایمیل · بدون تعهد
            </Badge>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
              گزارش‌های مرجع {interpolateBrand("هوش", brand)} — دانلود PDF رایگان
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              سه گزارش مرجعِ حسابداری و مالیات ایران، آمادهٔ چاپ و جلسه. نسخهٔ زندهٔ هر گزارش در بلاگ
              {" "}{interpolateBrand("هوش", brand)} همیشه به‌روز است؛ نسخهٔ PDF برای میز جلسه و مرور آفلاین.
            </p>
          </div>

          {/* ─── کارت سه گزارش ─── */}
          <section aria-labelledby="reports" className="mb-12">
            <h2 id="reports" className="mb-5 text-xl font-extrabold text-foreground sm:text-2xl">
              سه گزارش قابل‌دانلود
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {REPORTS.map((r) => {
                const Icon = r.icon;
                return (
                  <Card key={r.slug} className="flex flex-col transition-shadow hover:shadow-lg">
                    <CardContent className="flex flex-1 flex-col gap-3 p-5">
                      <div className="flex items-center justify-between">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" />
                        </span>
                        <Badge variant="outline" className="text-[10px] text-primary">{r.tag}</Badge>
                      </div>
                      <h3 className="text-sm font-bold leading-snug text-foreground">{r.title}</h3>
                      <p className="flex-1 text-xs leading-relaxed text-muted-foreground">{r.desc}</p>
                      <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <BookOpen className="h-3 w-3" /> {r.pages}
                      </p>
                      <ReportDownloadButton slug={r.slug} title={r.title} brandName={brand} className="w-full" />
                      <Link
                        href={`/blog/${r.slug}`}
                        prefetch={false}
                        className="text-center text-[11px] font-medium text-primary hover:underline"
                      >
                        نسخهٔ زندهٔ همین گزارش در بلاگ
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* ─── محتوای بلند ─── */}
          <HubArticle html={downloadsArticleHtml} faqs={downloadsFaqs} faqTitle="پرسش‌های متداول گزارش‌ها" />
        </div>
      </main>

      <footer className="mt-auto border-t border-border bg-muted/30 py-6">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-2 px-4 text-center text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            {interpolateBrand("هوش", brand)} — نرم‌افزار حسابداری ابری هوشمند
          </div>
          <p>© {new Date().getFullYear()} — تمامی حقوق محفوظ است.</p>
        </div>
      </footer>
    </div>
  );
}
