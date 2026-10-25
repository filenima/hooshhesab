import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen, ChevronRight, Sparkles } from "lucide-react";
import { getSiteUrl, generateBreadcrumbSchema } from "@/lib/seo";
import { getBrandName } from "@/lib/brand-interpolate";
import { ENGLISH_PILLARS } from "@/lib/seo/english-pillars";

// ============================================================
// app/en/blog/page.tsx — ایندکس راهنماهای انگلیسی (Trick #14)
// ------------------------------------------------------------
// صفحهٔ ایندکس‌پذیر ۳ خلاصهٔ انگلیسی؛ از مقالات انگلیسی و از
// hreflang فارسی به آن لینک می‌شود (هاب زبانی). canonical خودش؛
// x-default به /blog (نسخهٔ اصلی فارسی).
// ============================================================

export async function generateMetadata(): Promise<Metadata> {
  const [siteUrl, brand] = await Promise.all([getSiteUrl(), getBrandName()]);
  const canonical = `${siteUrl}/en/blog`;
  const title = "English Guides: Iranian Accounting, Moadian E-Invoicing & Software Selection";
  const description =
    "English summaries of Hoosh's Persian pillar guides: Iran's Moadian e-invoicing mandate, cloud vs desktop accounting TCO in Iran, and a 15-criteria framework for choosing accounting software. Full guides in Persian.";

  return {
    title,
    description,
    keywords: [
      "Iran accounting software English",
      "Moadian e-invoicing English",
      "Iran cloud accounting",
      "Iranian tax compliance guide",
    ],
    alternates: {
      canonical,
      languages: {
        fa: `${siteUrl}/blog`,
        en: canonical,
        "x-default": `${siteUrl}/blog`,
      },
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: brand,
      type: "website",
      locale: "en_US",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: title, type: "image/png" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.png"],
    },
    robots: { index: true, follow: true },
  };
}

export default async function EnglishBlogIndexPage() {
  const [siteUrl, brand] = await Promise.all([getSiteUrl(), getBrandName()]);
  const canonical = `${siteUrl}/en/blog`;

  // ItemList — ترتیب مشخص برای موتورهای جستجو
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Hoosh English Guides",
    numberOfItems: ENGLISH_PILLARS.length,
    itemListElement: ENGLISH_PILLARS.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.title,
      url: `${siteUrl}/en/blog/${p.slug}`,
    })),
  };
  const breadcrumbJsonLd = generateBreadcrumbSchema([
    { name: "Home", url: siteUrl },
    { name: "English Guides", url: canonical },
  ]);

  return (
    <div lang="en" dir="ltr" className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            prefetch={false}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to home
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
        <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/" prefetch={false} className="transition-colors hover:text-foreground">
              Home
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground">English guides</span>
          </nav>

          <h1 className="text-2xl font-extrabold leading-tight text-foreground sm:text-3xl">
            English Guides — Iranian Accounting &amp; Tax Compliance
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
            Professional English summaries of {brand}&apos;s Persian pillar guides, written for
            international researchers, diaspora business owners and B2B analysts covering the Iranian
            market. Each summary links to the complete Persian guide with full price tables, penalty
            rates and legal citations. The complete Persian blog — dozens of in-depth guides on
            accounting, taxes and the Moadian system — is at{" "}
            <Link href="/blog" hrefLang="fa" prefetch={false} className="font-medium text-primary underline-offset-4 hover:underline">
              /blog
            </Link>
            .
          </p>

          {/* Articles list */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {ENGLISH_PILLARS.map((p) => (
              <Link
                key={p.slug}
                href={`/en/blog/${p.slug}`}
                prefetch={false}
                className="group flex h-full flex-col rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-md"
              >
                <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                  <BookOpen className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  {p.section}
                </div>
                <h2 className="mt-2 text-sm font-bold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-base">
                  {p.title}
                </h2>
                <p className="mt-2 line-clamp-4 flex-1 text-xs leading-5 text-muted-foreground sm:text-[13px] sm:leading-6">
                  {p.description}
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary">
                  Read the English summary
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>

          {/* Persian hub link */}
          <section className="mt-8 rounded-2xl border border-border bg-muted/30 p-5">
            <h2 className="text-sm font-bold text-foreground sm:text-base">
              Looking for the complete guides?
            </h2>
            <p className="mt-2 text-xs leading-6 text-muted-foreground sm:text-sm">
              The full Persian blog contains the complete versions of these guides plus dozens more —
              with Iranian price tables, penalty calculators and step-by-step registration walkthroughs
              for the Moadian system.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/blog"
                hrefLang="fa"
                prefetch={false}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                بلاگ فارسی هوش
              </Link>
              <Link
                href="/tutorials"
                hrefLang="fa"
                prefetch={false}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/30"
              >
                Persian tutorials (free course)
              </Link>
            </div>
          </section>
        </div>
      </main>

      {/* Footer — sticky */}
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

      {/* JSON-LD — ItemList + BreadcrumbList */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    </div>
  );
}
