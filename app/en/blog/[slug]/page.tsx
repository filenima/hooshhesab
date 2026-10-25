import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, Clock, Globe, Sparkles, Calendar } from "lucide-react";
import { getSiteUrl, generateBreadcrumbSchema } from "@/lib/seo";
import { getBrandName } from "@/lib/brand-interpolate";
import { ENGLISH_PILLARS, ENGLISH_PILLARS_BY_SLUG } from "@/lib/seo/english-pillars";

// ============================================================
// app/en/blog/[slug]/page.tsx — نسخهٔ انگلیسی ۳ مقالهٔ ستون (Trick #14)
// ------------------------------------------------------------
// مخاطب: دیاسپورا، پژوهشگران B2B و تحلیل‌گران بین‌المللی بازار ایران.
//
// سئو:
//  - canonical به خودش (/en/blog/<slug>) — نه نسخهٔ فارسی (خلاصه ≠ اصل)
//  - hreflang دوسویه: fa → /blog/<slug> ، en → /en/blog/<slug> ،
//    x-default → نسخهٔ فارسی (مرجع کامل)
//  - Article JSON-LD انگلیسی با inLanguage "en"
//  - robots: index/follow — ایندکس‌پذیر
//  - lang="en" dir="ltr" روی wrapper (روت‌لی‌اوت fa/rtl است؛ در App Router
//    فقط روت‌لی‌اوت می‌تواند <html> را بسازد → lang معنایی روی div معتبر است)
// ============================================================

export function generateStaticParams() {
  return ENGLISH_PILLARS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const pillar = ENGLISH_PILLARS_BY_SLUG[slug];
  if (!pillar) {
    return {
      title: "Article not found",
      description: "The requested English article does not exist.",
      robots: { index: false, follow: false },
    };
  }
  const [siteUrl, brand] = await Promise.all([getSiteUrl(), getBrandName()]);
  const canonical = `${siteUrl}/en/blog/${pillar.slug}`;
  const persianUrl = `${siteUrl}/blog/${pillar.slug}`;
  const ogImage = `${siteUrl}/api/og?title=${encodeURIComponent(pillar.title)}&type=blog`;

  return {
    // قالب layout « | هوش» را اضافه می‌کند — برند در عنوان می‌آید
    title: pillar.title,
    description: pillar.description,
    keywords: pillar.keywords,
    authors: [{ name: brand }],
    alternates: {
      canonical,
      // hreflang — دوسویه با نسخهٔ فارسی (app/blog/[slug] همین را برمی‌گرداند)
      languages: {
        fa: persianUrl,
        en: canonical,
        "x-default": persianUrl,
      },
    },
    openGraph: {
      title: pillar.title,
      description: pillar.description,
      url: canonical,
      siteName: brand,
      locale: "en_US",
      type: "article",
      publishedTime: pillar.datePublished,
      modifiedTime: pillar.dateModified,
      images: [{ url: ogImage, width: 1200, height: 630, alt: pillar.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: pillar.title,
      description: pillar.description,
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

function formatEnDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

export default async function EnglishPillarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pillar = ENGLISH_PILLARS_BY_SLUG[slug];
  if (!pillar) notFound();

  const [siteUrl, brand] = await Promise.all([getSiteUrl(), getBrandName()]);
  const canonical = `${siteUrl}/en/blog/${pillar.slug}`;
  const persianUrl = `${siteUrl}/blog/${pillar.slug}`;

  // ─── Article JSON-LD (English) — inLanguage "en" ───
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${canonical}#article`,
    headline: pillar.title,
    description: pillar.description,
    inLanguage: "en",
    image: {
      "@type": "ImageObject",
      url: `${siteUrl}/api/og?title=${encodeURIComponent(pillar.title)}&type=blog`,
      width: 1200,
      height: 630,
    },
    datePublished: pillar.datePublished,
    dateModified: pillar.dateModified,
    articleSection: pillar.section,
    keywords: pillar.keywords.join(", "),
    author: {
      "@type": "Organization",
      name: brand,
      url: siteUrl,
    },
    publisher: {
      "@type": "Organization",
      name: brand,
      url: siteUrl,
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/logo.svg`,
      },
    },
    // ترجمهٔ رسمی مقالهٔ فارسی — اتصال موجودیت برای Knowledge Graph
    translationOfWork: {
      "@type": "CreativeWork",
      "@id": `${persianUrl}#article`,
      inLanguage: "fa",
      url: persianUrl,
    },
    isPartOf: { "@id": `${siteUrl}/en/blog#blog` },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
  };

  const breadcrumbJsonLd = generateBreadcrumbSchema([
    { name: "Home", url: siteUrl },
    { name: "English Guides", url: `${siteUrl}/en/blog` },
    { name: pillar.title, url: canonical },
  ]);

  const words = pillar.html
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  const readingMinutes = Math.max(1, Math.ceil(words / 220));

  return (
    <div lang="en" dir="ltr" className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            href="/en/blog"
            prefetch={false}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> English guides
          </Link>
          <Link href="/" prefetch={false} className="inline-flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-bold">{brand}</span>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <article className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/" prefetch={false} className="transition-colors hover:text-foreground">
              Home
            </Link>
            <ChevronRight className="h-3 w-3" />
            <Link href="/en/blog" prefetch={false} className="transition-colors hover:text-foreground">
              English guides
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="line-clamp-1 text-foreground">{pillar.title}</span>
          </nav>

          {/* Meta row */}
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              Published {formatEnDate(pillar.datePublished)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {readingMinutes} min read
            </span>
          </div>

          <h1 className="text-2xl font-extrabold leading-tight text-foreground sm:text-3xl">
            {pillar.title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
            {pillar.description}
          </p>

          {/* Language switcher — hreflang قابل‌مشاهده */}
          <div className="mt-5 flex flex-wrap items-center gap-2 border-y border-border py-3 text-xs">
            <Globe className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="font-semibold text-foreground">English</span>
            <span aria-hidden="true" className="text-muted-foreground">·</span>
            <Link
              href={`/blog/${pillar.slug}`}
              hrefLang="fa"
              prefetch={false}
              className="font-medium text-primary underline-offset-4 transition-colors hover:underline"
            >
              فارسی (full guide)
            </Link>
            <span aria-hidden="true" className="text-muted-foreground">·</span>
            <Link
              href="/en/blog"
              prefetch={false}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              All English guides
            </Link>
          </div>

          {/* Body — خلاصهٔ انگلیسی (اعلان بالای متن داخل html است) */}
          <div
            className="blog-content mt-8 text-[15px] leading-8 text-foreground/90 sm:text-base sm:leading-9"
            dangerouslySetInnerHTML={{ __html: pillar.html }}
          />

          {/* Footer CTA of the article */}
          <section className="mt-10 rounded-2xl border border-border bg-muted/30 p-5 sm:p-6">
            <h2 className="text-base font-bold text-foreground">Continue in Persian</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The full guide — with Iranian price tables, penalty-rate tables and legal citations — is
              published in Persian:
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/blog/${pillar.slug}`}
                hrefLang="fa"
                prefetch={false}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {pillar.persianTitle}
                <ChevronRight className="h-4 w-4 rotate-180" aria-hidden="true" />
              </Link>
              <Link
                href="/en/blog"
                prefetch={false}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/30"
              >
                More English guides
              </Link>
            </div>
          </section>
        </article>
      </main>

      {/* Footer — sticky (flex + mt-auto) */}
      <footer className="mt-auto border-t border-border bg-card">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <p>{brand} — All rights reserved.</p>
          <div className="flex items-center gap-3">
            <Link
              href="/en/blog"
              prefetch={false}
              className="font-medium text-primary transition-colors hover:text-primary/80"
            >
              English guides
            </Link>
            <Link href="/" prefetch={false} className="transition-colors hover:text-foreground">
              Home
            </Link>
          </div>
        </div>
      </footer>

      {/* JSON-LD — Article (en) + BreadcrumbList */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    </div>
  );
}
