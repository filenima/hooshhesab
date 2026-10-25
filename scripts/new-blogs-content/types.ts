// ============================================================
// scripts/new-blogs-content/types.ts — قرارداد دادهٔ ۲۷ وبلاگ جدید (Task 11-A)
// ============================================================
// هر ماژول محتوا یک آرایه از NewBlogSpec صادر می‌کند؛ اسکریپت اصلی
// (scripts/add-new-blogs.ts) این‌ها را مونتاژ، اعتبارسنجی و درج می‌کند.
// محتوا دست‌نویس و مخصوص هر صنعت/موضوع است — نه الگوی پارامتری.
// ============================================================

export interface NewBlogSpec {
  /** اسلاگ یکتا — از TopicBrief */
  slug: string;
  /** خوشه از TopicBrief (industry | accounting | tax | tools | education | …) */
  cluster: string;
  /** دستهٔ BlogPost: ACCOUNTING | TAX | TUTORIAL | … */
  category: string;
  /** از تصاویر موجود public/images/ */
  coverImage: string;
  title: string; // < 65 کاراکتر، دارای کلیدواژه
  focusKeyword: string;
  /** ۱۵۰-۱۶۰ کاراکتر جذاب */
  excerpt: string;
  /** ۱۵۰-۱۶۵ کاراکتر */
  metaDescription: string;
  /** ۸-۱۲ کلیدواژه شامل لانگ‌تیل شهر-محور */
  keywords: string[];
  /** پاراگراف‌های مقدمهٔ جذاب (HTML) — بدون h1 (صفحه h1 را رندر می‌کند) */
  intro: string[];
  /** بخش‌های H2 — هر عضو یک بخش کامل (h2 + پاراگراف‌ها/جدول) */
  sections: string[];
  /** پرسش‌های متداول ۶-۷ مورد */
  faq: { q: string; a: string }[];
  /** پاراگراف‌های جمع‌بندی */
  conclusion: string[];
  /** ۳ اسلاگ مقالهٔ PUBLISHED مرتبط برای بلوک «مطالب مرتبط» */
  relatedSlugs: string[];
}
