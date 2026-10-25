import type { Metadata } from "next";
import Link from "next/link";
import {
  generateBreadcrumbSchema,
  generateFaqSchema,
  getSiteUrl,
  type FaqItem,
} from "@/lib/seo";
import { HubArticle } from "@/lib/hub-article";
import { pressArticleHtml, pressFaqs } from "@/lib/hub-content/press";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
import { PressRequestForm } from "@/components/seo/press-request-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, ChevronLeft, Database, FileDown, Megaphone, Newspaper, Sparkles } from "lucide-react";

// ============================================================
// /press — اتاق خبر هوش (Digital PR داده‌محور)
// ============================================================
// برنامهٔ پژوهش «نبض مالی کسب‌وکار ایرانی» + بستهٔ رسانه‌ای رایگان
// (PDF/اینفوگرافیک/CSV) + کارشناسان مصاحبه + فرم درخواست.
// هدف سئو: ارجاع رسانه‌های مالی = بک‌لینک‌های اتوریتی‌دار.

export const dynamic = "force-dynamic";

const PAGE_TITLE = "اتاق خبر هوش | گزارش‌های داده‌محور حسابداری و مالیات ایران";
const PAGE_DESCRIPTION =
  "برنامهٔ پژوهش داده‌محور هوش: گزارش‌های فصلی حسابداری، مالیات و مودیان، اینفوگرافیک و CSV رایگان برای رسانه‌ها + مصاحبه با کارشناسان";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandName();
  const siteUrl = await getSiteUrl();
  const ogImage = `${siteUrl}/api/og?title=${encodeURIComponent("اتاق خبر " + brand)}&description=${encodeURIComponent("گزارش‌های داده‌محور مالی برای رسانه‌ها")}&type=article`;
  return {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    keywords: interpolateBrand(
      ["گزارش حسابداری ایران", "پژوهش مالیاتی", "داده مودیان", "اتاق خبر هوش", "رایگان برای رسانه‌ها"],
      brand
    ),
    authors: [{ name: interpolateBrand("هوش", brand), url: `${siteUrl}/authors` }],
    alternates: { canonical: `${siteUrl}/press` },
    openGraph: {
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      url: `${siteUrl}/press`,
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

export default async function PressPage() {
  const brand = await getBrandName();
  const siteUrl = await getSiteUrl();

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: "خانه", url: siteUrl },
    { name: "اتاق خبر", url: `${siteUrl}/press` },
  ]);
  const faqSchema = generateFaqSchema(pressFaqs as FaqItem[]);

  // MediaPage/NewsMediaOrganization — معرفی موجودیت رسانه‌ای
  const newsOrgSchema = {
    "@context": "https://schema.org",
    "@type": "NewsMediaOrganization",
    "@id": `${siteUrl}/press#org`,
    name: interpolateBrand("اتاق خبر هوش", brand),
    url: `${siteUrl}/press`,
    description: PAGE_DESCRIPTION,
    parentOrganization: { "@type": "Organization", name: interpolateBrand("هوش", brand), url: siteUrl },
    inLanguage: "fa-IR",
  };

  const mediaKitItems = [
    { icon: FileDown, title: "گزارش PDF", desc: "۸-۱۲ صفحه با نمودار و تفسیر کارشناسی — آمادهٔ ارجاع" },
    { icon: BarChart3, title: "اینفوگرافیک", desc: "۱۲۰۰px عمودی فارسی — قابل بازنشر با ذکر منبع" },
    { icon: Database, title: "دادهٔ CSV", desc: "جدول استاندارد برای تحلیل مستقل رسانه" },
    { icon: Megaphone, title: "بولت‌پوینت خبری", desc: "۱۰ حقیقت برجسته — هرکدام یک تیتر بالقوه" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(newsOrgSchema) }} />
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
          <Link href="/authors" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" prefetch={false}>
            تیم تحریریه
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <nav aria-label="مسیر" className="mb-6 flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/" prefetch={false} className="transition-colors hover:text-foreground">خانه</Link>
            <ChevronLeft className="h-3 w-3" />
            <span className="text-foreground">اتاق خبر</span>
          </nav>

          <div className="mb-10">
            <Badge variant="secondary" className="mb-4 text-xs">
              <Newspaper className="h-3 w-3" /> دیجیتال PR داده‌محور
            </Badge>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
              اتاق خبر {interpolateBrand("هوش", brand)} — دادهٔ بومی برای رسانه‌های مالی ایران
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              گزارش‌های فصلی پژوهش «نبض مالی کسب‌وکار ایرانی»، اینفوگرافیک و دادهٔ خام CSV — رایگان برای
              رسانه‌ها، با ذکر منبع. به‌علاوهٔ کارشناسان آمادهٔ مصاحبه دربارهٔ مودیان، مالیات و نرم‌افزار حسابداری.
            </p>
          </div>

          {/* ─── بستهٔ رسانه‌ای ─── */}
          <section aria-labelledby="media-kit" className="mb-10">
            <h2 id="media-kit" className="mb-4 text-xl font-extrabold text-foreground sm:text-2xl">
              داخل هر بستهٔ رسانه‌ای چه چیزی هست؟
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {mediaKitItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Card key={item.title} className="transition-shadow hover:shadow-md">
                    <CardContent className="flex items-start gap-3 p-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-foreground">{item.title}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <PressRequestForm />

          {/* ─── محتوای بلند برنامهٔ پژوهش ─── */}
          <HubArticle html={pressArticleHtml} faqs={pressFaqs} faqTitle="پرسش‌های متداول اتاق خبر" />
        </div>
      </main>

      <footer className="mt-auto border-t border-border bg-muted/30 py-6">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-2 px-4 text-center text-xs text-muted-foreground">
          <p>
            {interpolateBrand("هوش", brand)} — نرم‌افزار حسابداری ابری هوشمند · گزارش‌ها با ذکر منبع رایگان‌اند
          </p>
          <p>© {new Date().getFullYear()} — تمامی حقوق محفوظ است.</p>
        </div>
      </footer>
    </div>
  );
}
