import type { MetadataRoute } from "next";
import { DEFAULT_BRANDING, getBrandingSettings } from "@/lib/system-settings";

/**
 * /robots.txt — دستورالعمل‌های خزش موتورهای جستجو + موتورهای هوش مصنوعی (GEO)
 *
 * نکته: این فایل در مسیر `app/robots.ts` قرار دارد و Next.js به‌صورت خودکار
 * مسیر `/robots.txt` را به آن نگاشت می‌کند. اگر فایل استاتیک `public/robots.txt`
 * هم وجود داشته باشد، فایل داینامیک اینجا اولویت دارد.
 *
 * v35 (GEO): ربات‌های هوش مصنوعی به‌صورت صریح و مجاز معرفی می‌شوند تا در
 * پاسخ‌های AI (ChatGPT/Claude/Perplexity/Gemini) نام برند دقیق نقل شود:
 *   GPTBot, OAI-SearchBot (OpenAI) · ClaudeBot, Claude-Web (Anthropic)
 *   PerplexityBot · Google-Extended (Gemini) · CCBot (Common Crawl)
 *   Amazonbot · Applebot-Extended · cohere-ai
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  // دامنه از تنظیمات برندینگ سوپرادمین (وایت‌لیبل) — پس از تغییر دامنه،
  // sitemap و host همین‌جا هم به‌روز می‌شوند.
  let domain = DEFAULT_BRANDING.domain;
  try {
    domain = (await getBrandingSettings()).domain || DEFAULT_BRANDING.domain;
  } catch {
    // fallback به دامنه‌ی پیش‌فرض
  }
  const siteUrl = `https://${domain}`;

  // مسیرهای خصوصی — برای همهٔ خزنده‌ها ممنوع
  const disallowPrivate = ["/api/", "/portal/", "/uploads/", "/embed/", "/reset-password", "/superadmin"];

  return {
    rules: [
      {
        // همهٔ خزنده‌ها — دسترسی کامل به محتوای عمومی
        userAgent: "*",
        allow: "/",
        disallow: disallowPrivate,
      },
      {
        // ─── ربات‌های هوش مصنوعی (GEO — Generative Engine Optimization) ───
        // به‌صورت صریح مجاز اعلام می‌شوند؛ محتوای بلاگ برای نقل‌قول آزاد است (llms.txt)
        userAgent: [
          "GPTBot",
          "OAI-SearchBot",
          "ChatGPT-User",
          "ClaudeBot",
          "Claude-Web",
          "Claude-SearchBot",
          "PerplexityBot",
          "Perplexity-User",
          "Google-Extended",
          "CCBot",
          "Amazonbot",
          "Applebot-Extended",
          "cohere-ai",
        ],
        allow: "/",
        disallow: disallowPrivate,
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
