import type { Metadata } from "next";
import Link from "next/link";
import {
  generateBreadcrumbSchema,
  generateFaqSchema,
  getSiteUrl,
  type FaqItem,
} from "@/lib/seo";
import { HubArticle } from "@/lib/hub-article";
import { authorsArticleHtml, authorsFaqs } from "@/lib/hub-content/authors";
import { getEditorialTeamWithMaps } from "@/lib/editorial-team";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Award, BadgeCheck, Building2, ChevronLeft, ExternalLink, Sparkles, Users } from "lucide-react";

// ============================================================
// /authors — تیم تحریریه هوش (E-E-A-T / YMYL)
// ============================================================
// سیگنال‌های اعتماد گوگل برای محتوای مالی:
//  • نویسندگان با نام، سمت، سوابق و sameAs (لینکدین/گوگل‌مپ)
//  • AboutPage + Person schema برای هر عضو
//  • روش‌شناسی، سیاست تصحیح و تعارض منافع شفاف
// اعضا از SystemSettings (کلید editorial_team) خوانده می‌شوند و
// از پنل سوپرادمین با نام‌ها/لینک‌های واقعی قابل ویرایش‌اند.

export const dynamic = "force-dynamic";

const PAGE_TITLE = "تیم تحریریه هوش | نویسندگان و کارشناسان محتوای مالی";
const PAGE_DESCRIPTION =
  "آشنایی با تیم تحریریه هوش: سوابق حسابداری و مالیاتی نویسندگان، روش‌شناسی منابع رسمی، سیاست تصحیح و استانداردهای E-E-A-T محتوای مالی";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandName();
  const siteUrl = await getSiteUrl();
  const ogImage = `${siteUrl}/api/og?title=${encodeURIComponent("تیم تحریریه " + brand)}&description=${encodeURIComponent("سوابق، تخصص و استانداردهای محتوای مالی")}&type=article`;
  return {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    keywords: interpolateBrand(
      ["تیم تحریریه هوش", "نویسندگان هوش", "E-E-A-T محتوای مالی", "کارشناس مالیاتی", "مشاور حسابداری"],
      brand
    ),
    authors: [{ name: interpolateBrand("هوش", brand) }],
    alternates: { canonical: `${siteUrl}/authors` },
    openGraph: {
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      url: `${siteUrl}/authors`,
      siteName: interpolateBrand("هوش", brand),
      images: [{ url: ogImage, width: 1200, height: 630, alt: PAGE_TITLE }],
      locale: "fa_IR",
      type: "profile",
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

export default async function AuthorsPage() {
  const brand = await getBrandName();
  const siteUrl = await getSiteUrl();
  const team = await getEditorialTeamWithMaps();

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: "خانه", url: siteUrl },
    { name: "تیم تحریریه", url: `${siteUrl}/authors` },
  ]);
  const faqSchema = generateFaqSchema(authorsFaqs as FaqItem[]);

  // E-E-A-T: AboutPage + Person برای هر عضو (sameAs تأییدپذیر)
  const aboutSchema = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "@id": `${siteUrl}/authors#about`,
    name: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: `${siteUrl}/authors`,
    inLanguage: "fa-IR",
    mainEntity: {
      "@type": "Organization",
      name: interpolateBrand("هوش", brand),
      url: siteUrl,
    },
  };
  const personSchemas = team.map((m) => ({
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${siteUrl}/authors#${m.id}`,
    name: m.name,
    jobTitle: m.role,
    description: m.bio,
    knowsAbout: m.expertise,
    ...(m.sameAs && m.sameAs.length > 0 ? { sameAs: m.sameAs } : {}),
    worksFor: {
      "@type": "Organization",
      name: interpolateBrand("هوش", brand),
      url: siteUrl,
    },
  }));

  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutSchema) }} />
      {personSchemas.map((p, i) => (
        <script key={`person-${i}`} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(p) }} />
      ))}
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
          <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" prefetch={false}>
            بایگانی راهنماها
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <nav aria-label="مسیر" className="mb-6 flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/" prefetch={false} className="transition-colors hover:text-foreground">خانه</Link>
            <ChevronLeft className="h-3 w-3" />
            <span className="text-foreground">تیم تحریریه</span>
          </nav>

          <div className="mb-10">
            <Badge variant="secondary" className="mb-4 text-xs">
              <Users className="h-3 w-3" /> تحریریه و اعتبار محتوا
            </Badge>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
              تیم تحریریه {interpolateBrand("هوش", brand)} — چه کسی محتوای مالی شما را می‌نویسد؟
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              محتوای مالی، در دستهٔ حساس YMYL گوگل است. این صفحه با شفافیت کامل نشان می‌دهد چه کسی راهنماهای
              {" "}{interpolateBrand("هوش", brand)} را می‌نویسد، با چه سوابقی، از چه منابعی و با چه فرایند بازبینی.
            </p>
          </div>

          {/* ─── کارت اعضای تحریریه (از تنظیمات پلتفرم — قابل ویرایش از پنل سوپرادمین) ─── */}
          <section aria-labelledby="team-members" className="mb-12">
            <h2 id="team-members" className="mb-5 text-xl font-extrabold text-foreground sm:text-2xl">
              اعضای تحریریه
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {team.map((m) => (
                <Card key={m.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <BadgeCheck className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-base font-bold leading-snug">{m.name}</CardTitle>
                    <p className="mt-1 text-xs font-medium text-primary">{m.role}</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs leading-relaxed text-muted-foreground">{m.bio}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {m.expertise.slice(0, 4).map((e) => (
                        <Badge key={e} variant="outline" className="text-[10px]">{e}</Badge>
                      ))}
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      <Award className="ml-1 inline h-3 w-3 text-primary" />
                      {m.credentials.slice(0, 140)}{m.credentials.length > 140 ? "…" : ""}
                    </p>
                    {m.sameAs && m.sameAs.length > 0 && (
                      <div className="border-t border-border pt-2">
                        {m.sameAs.slice(0, 2).map((u) => (
                          <a
                            key={u}
                            href={u}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            پروفایل تأییدشده
                          </a>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* ─── محتوای بلند استانداردهای تحریریه ─── */}
          <HubArticle html={authorsArticleHtml} faqs={authorsFaqs} faqTitle="پرسش‌های متداول دربارهٔ تحریریه هوش" />
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
