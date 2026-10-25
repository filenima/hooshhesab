import * as React from "react";
import { db } from "@/lib/db";
// GOOGLE-MAPS-STARS(v37): امتیاز واقعی گوگل‌مپ از تنظیمات سوپرادمین
import {
 getGoogleMapsReviewsSettings,
 isGoogleRatingValidForSchema,
 getSameAsProfileUrls,
} from "@/lib/google-maps-reviews";
// REBRAND(v37): نام برند داینامیک برای اسکیماها
import { getBrandName } from "@/lib/brand-interpolate";
import {
 generateOrganizationSchema,
 generateWebSiteSchema,
 generateSoftwareApplicationSchema,
 generateLocalBusinessSchema,
 generateProductSchema,
 generateSpeakableSchema,
 getSiteUrl,
} from "@/lib/seo";

interface StructuredDataProps {
 /**
 * اسکیماهای اضافی که فقط در صفحات خاص باید تزریق شوند (مثلاً Article یا FAQPage).
 * پیش‌فرض: فقط Organization + WebSite + SoftwareApplication + LocalBusiness.
 *
 * نکته سئو: FAQPage به‌صورت سراسری تزریق نمی‌شود — هر صفحه فقط FAQ خودش را
 * از طریق extraSchemas یا <JsonLd> اختصاصی خودش می‌گیرد (صفحه اصلی: app/page.tsx).
 */
 extraSchemas?: object[];
}

/**
 * دریافت آمار واقعی نظرات تاییدشده از دیتابیس (برای AggregateRating واقعی).
 * SEO SAFETY: امتیاز فیک در schema.org خطر جریمه گوگل (rich snippet spam) دارد —
 * اینجا فقط نظرات تاییدشده‌ی واقعی شمرده می‌شوند. اگر نظری نبود،
 * aggregateRating حذف می‌شود تا ریسک صفر باشد.
 */
async function getRealRating() {
 try {
 const agg = await db.siteTestimonial.aggregate({
 where: { status: "APPROVED" },
 _avg: { rating: true },
 _count: { _all: true },
 });
 const count = agg._count._all;
 if (count < 3) return null; // حداقل ۳ نظر واقعی برای نمایش ستاره
 return {
 ratingValue: Math.round((agg._avg.rating?? 5) * 10) / 10,
 reviewCount: count,
 };
 } catch {
 return null;
 }
}

/** نظرات برتر تاییدشده برای schema.org Review (حداکثر ۵ نظر شاخص) */
async function getTopReviews() {
 try {
 const items = await db.siteTestimonial.findMany({
 where: { status: "APPROVED" },
 orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
 take: 5,
 select: { name: true, rating: true, content: true, role: true, company: true, createdAt: true },
 });
 return items;
 } catch {
 return [];
 }
}

/**
 * StructuredData — تزریق JSON-LD ساختاریافته سراسری (async server component)
 *
 * شامل:
 * - Organization — اطلاعات سازمانی هوش
 * - WebSite — با SearchAction (برای جستجوی سایت در Google)
 * - SoftwareApplication — با AggregateRating واقعی از دیتابیس (ستاره گوگل)
 * - Review — نظرات واقعی تاییدشده (rich snippet)
 * - LocalBusiness
 */
export async function StructuredData({ extraSchemas = [] }: StructuredDataProps) {
 // Task 7-ج: دامنه از تنظیمات برندینگ سوپرادمین (وایت‌لیبل) — نه هاردکد.
 const SITE_URL = await getSiteUrl();

 // آماده‌سازی SoftwareApplication با امتیاز واقعی
 const software = generateSoftwareApplicationSchema() as Record<string, unknown>;

 const [rating, reviews, gmaps, brandName] = await Promise.all([
  getRealRating(),
  getTopReviews(),
  getGoogleMapsReviewsSettings(),
  getBrandName(),
 ]);

 // REBRAND(v37): نام واقعی برند روی هر سه موجودیت اسکیما (سازگاری نام با
 // عنوان/متادیتای صفحه — ناسازگاری نام در JSON-LD سیگنال آشفتگی برای گوگل است)
 software.name = brandName;
 software.alternateName = `${brandName} Accounting Software`;

 // GOOGLE-MAPS-STARS(v37): اولویت با امتیاز گوگل‌مپ (معتبرترین منبع بیرونی —
 // همان عددی که کاربر در گوگل می‌بیند)؛ در غیر این‌صورت نظرات داخلی تاییدشده.
 if (isGoogleRatingValidForSchema(gmaps)) {
  software.aggregateRating = {
   "@type": "AggregateRating",
   ratingValue: String(gmaps.ratingValue),
   reviewCount: String(gmaps.reviewCount),
   bestRating: "5",
   worstRating: "1",
  };
 } else if (rating) {
 // امتیاز واقعی جایگزین مقادیر placeholder می‌شود
 software.aggregateRating = {
 "@type": "AggregateRating",
 ratingValue: String(rating.ratingValue),
 reviewCount: String(rating.reviewCount),
 bestRating: "5",
 worstRating: "1",
 };
 } else {
 // بدون حداقل ۳ نظر واقعی، امتیاد را کامل حذف کن (سئوی امن)
 delete software.aggregateRating;
 }

 // نظرات واقعی schema.org Review
 const reviewSchemas = reviews.slice(0, 5).map((r) => ({
 "@type": "Review",
 reviewRating: {
 "@type": "Rating",
 ratingValue: String(r.rating),
 bestRating: "5",
 worstRating: "1",
 },
 author: {
 "@type": "Person",
 name: r.name,
 jobTitle: r.role || undefined,
 affiliation: r.company
? { "@type": "Organization", name: r.company }
: undefined,
 },
 reviewBody: r.content,
 datePublished: r.createdAt.toISOString(),
 itemReviewed: { "@id": `${SITE_URL}/#software` },
 }));

 if (reviewSchemas.length > 0) {
 software.review = reviewSchemas;
 }

 // sameAs — پروفایل‌های بیرونی معتبر (Trick #7 راند ۱۲): گوگل‌مپ + Bing Places
 // + دایرکتوری محلی + LinkedIn + آپارات → اتصال موجودیت تجاری در Knowledge Graph
 // (تقویت Local Pack و پنل دانش) — فقط لینک‌های http(s) معتبر؛ خالی‌ها نادیده.
 const org = generateOrganizationSchema() as Record<string, unknown>;
 const localBusiness = generateLocalBusinessSchema() as Record<string, unknown>;
 org.name = brandName;
 localBusiness.name = brandName;
 const sameAsList = getSameAsProfileUrls(gmaps);
 if (sameAsList.length > 0) {
  const merged = Array.isArray(org.sameAs)
   ? [...(org.sameAs as string[])]
   : [];
  for (const u of sameAsList) {
   if (!merged.includes(u)) merged.push(u);
  }
  org.sameAs = merged;
  localBusiness.sameAs = merged;
 }

 const schemas = [
 org,
 generateWebSiteSchema(),
 software,
 localBusiness,
 // سئو: Product با قیمت مؤثر پلن‌ها (ویرایش سوپرادمین — FIX 9-a) + Speakable برای جستجوی صوتی
 await generateProductSchema(),
 generateSpeakableSchema(),
 ...extraSchemas,
 ];

 return (
 <>
 {schemas.map((schema, i) => (
 <script
 key={i}
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
 />
 ))}
 </>
 );
}

/**
 * JsonLd — کامپوننت کمکی برای تزریق یک اسکیمای منفرد
 */
export function JsonLd({ data }: { data: object }) {
 return (
 <script
 type="application/ld+json"
 dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
 />
 );
}
