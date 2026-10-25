// ============================================================
// lib/google-maps-reviews.ts — نظرات و امتیاز گوگل مپ (v37)
// ============================================================
// درخواست مالک: «۳۰ تا ریویو توی گوگل مپ دارم؛ میتونی یکاری کنی سرچ
// میزنن کنار سایتم چندستاره بودن رو نشون بده؟ توی پنل ادمین هم ی قسمت
// اختصاصی برای این بزار لینک گوگل مپم رو اونجا بزارم فعالشه»
//
// سازوکار (بر اساس نحوهٔ واقعی نمایش ستاره در نتایج گوگل):
//   ۱) سوپرادمین لینک Google Maps (Business Profile)، امتیاز و تعداد نظرات
//      را در پنل وارد می‌کند → ذخیره در SystemSettings.
//   ۲) StructuredData (سراسری) وقتی فعال باشد:
//       - aggregateRating با امتیاز/تعداد گوگل به SoftwareApplication تزریق می‌شود
//         (ستاره در نتایج جستجو = Review Snippet)
//       - sameAs لینک گوگل‌مپ به Organization اضافه می‌شود (اتصال موجودیت
//         تجاری در Knowledge Graph → تقویت Local Pack)
//   ۳) نمایش در سایت (اختیاری): بج «⭐ ۴٫۸ از ۳۰ نظر در گوگل» — تأیید
//      بصری برای کاربر و خزنده.
//
// سیاست صداقت: این ماژول امتیاز را از صاحب کسب‌وکار می‌گیرد؛ گوگل برای
// LocalBusiness امتیاز «self-serving» را نمایش نمی‌دهد ولی برای
// SoftwareApplication/Product نشان‌دادن ستاره رایج است. توصیهٔ ما:
// امتیاز دقیقِ همان گوگل‌مپ را وارد کنید تا دادهٔ schema با دادهٔ
// Google Business Profile یکسان باشد (ناسازگاری = ریسک).
// ============================================================

import { db } from "@/lib/db";
import { cacheGetOrSet, cacheDeleteByPrefix } from "@/lib/cache";

export const GM_KEYS = {
 ENABLED: "google_maps_stars_enabled",
 URL: "google_maps_url",
 RATING: "google_maps_rating",
 COUNT: "google_maps_review_count",
 SHOW_ON_SITE: "google_maps_show_on_site",
 EMBED_URL: "google_maps_embed_url",
 // ── Trick #7 (راند ۱۲): سرویس‌های محلی دیگر — پروفایل‌های بیرونی هم به
 // sameAs سازمان/LocalBusiness تزریق می‌شوند (اتصال موجودیت در Knowledge Graph)
 BING_PLACES_URL: "bing_places_url",
 LOCAL_DIRECTORY_URL: "local_directory_url",
 LINKEDIN_COMPANY_URL: "linkedin_company_url",
 APARAT_PROFILE_URL: "aparat_profile_url",
} as const;

const CACHE_PREFIX = "gmaps:";

export interface GoogleMapsReviewsSettings {
 /** فعال‌بودن ستاره‌ها در نتایج جستجو (تزریق aggregateRating) */
 enabled: boolean;
 /** لینک کامل Google Maps / Business Profile */
 mapsUrl: string;
 /** امتیاز ۰ تا ۵ (مثلاً ۴٫۸) */
 ratingValue: number;
 /** تعداد نظرات (مثلاً ۳۰) */
 reviewCount: number;
 /** نمایش بج نظرات گوگل در سایت (لندینگ/فوتر) */
 showOnSite: boolean;
 /** لینک iframe نقشه (اختیاری) */
 embedUrl: string;
 // ── Trick #7 (راند ۱۲): سرویس‌های محلی دیگر — وقتی غیرخالی باشند به
 // sameAs در اسکیمای Organization/LocalBusiness اضافه می‌شوند.
 /** پروفایل Bing Places (بینگ — سرویس محلی مایکروسافت) */
 bingPlacesUrl: string;
 /** پروفایل در دایرکتوری محلی ایرانی (نشان/سرویس‌های محلی مشابه) */
 localDirectoryUrl: string;
 /** صفحهٔ شرکت در LinkedIn */
 linkedinCompanyUrl: string;
 /** پروفایل/کانال آپارات (ویدیو) */
 aparatProfileUrl: string;
}

export const DEFAULT_GMAPS_SETTINGS: GoogleMapsReviewsSettings = {
 enabled: false,
 mapsUrl: "",
 ratingValue: 0,
 reviewCount: 0,
 showOnSite: true,
 embedUrl: "",
 bingPlacesUrl: "",
 localDirectoryUrl: "",
 linkedinCompanyUrl: "",
 aparatProfileUrl: "",
};

function parseBool(v: string | undefined, dflt = false): boolean {
 if (v === "1" || v === "true") return true;
 if (v === "0" || v === "false") return false;
 return dflt;
}

/** خواندن تنظیمات نظرات گوگل (کش ۵ دقیقه‌ای) */
export async function getGoogleMapsReviewsSettings(): Promise<GoogleMapsReviewsSettings> {
 return cacheGetOrSet(`${CACHE_PREFIX}settings`, async () => {
  try {
   const keys = Object.values(GM_KEYS);
   const rows = await db.systemSettings.findMany({ where: { key: { in: [...keys] } } });
   const map = new Map(rows.map((r) => [r.key, r.value]));
   const rating = Number(map.get(GM_KEYS.RATING));
   const count = Number(map.get(GM_KEYS.COUNT));
   return {
    enabled: parseBool(map.get(GM_KEYS.ENABLED)),
    mapsUrl: (map.get(GM_KEYS.URL) || "").trim(),
    ratingValue: Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : 0,
    reviewCount: Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0,
    showOnSite: parseBool(map.get(GM_KEYS.SHOW_ON_SITE), true),
    embedUrl: (map.get(GM_KEYS.EMBED_URL) || "").trim(),
    // Trick #7: پروفایل‌های محلی/اجتماعی — مثل الگوی mapsUrl (trim + خالی مجاز)
    bingPlacesUrl: (map.get(GM_KEYS.BING_PLACES_URL) || "").trim(),
    localDirectoryUrl: (map.get(GM_KEYS.LOCAL_DIRECTORY_URL) || "").trim(),
    linkedinCompanyUrl: (map.get(GM_KEYS.LINKEDIN_COMPANY_URL) || "").trim(),
    aparatProfileUrl: (map.get(GM_KEYS.APARAT_PROFILE_URL) || "").trim(),
   };
  } catch {
   return DEFAULT_GMAPS_SETTINGS;
  }
 });
}

/** ذخیرهٔ تنظیمات (سوپرادمین) — کش باطل می‌شود */
export async function saveGoogleMapsReviewsSettings(
 input: Partial<GoogleMapsReviewsSettings>
): Promise<GoogleMapsReviewsSettings> {
 const current = await getGoogleMapsReviewsSettings();
 const next: GoogleMapsReviewsSettings = {
  enabled: Boolean(input.enabled ?? current.enabled),
  mapsUrl: (input.mapsUrl ?? current.mapsUrl).trim(),
  ratingValue: Math.max(
   0,
   Math.min(5, Number(input.ratingValue ?? current.ratingValue) || 0)
  ),
  reviewCount: Math.max(0, Math.round(Number(input.reviewCount ?? current.reviewCount) || 0)),
  showOnSite: Boolean(input.showOnSite ?? current.showOnSite),
  embedUrl: (input.embedUrl ?? current.embedUrl).trim(),
  // Trick #7: سرویس‌های محلی دیگر — همان الگوی embedUrl (رشتهٔ اختیاری)
  bingPlacesUrl: (input.bingPlacesUrl ?? current.bingPlacesUrl).trim(),
  localDirectoryUrl: (input.localDirectoryUrl ?? current.localDirectoryUrl).trim(),
  linkedinCompanyUrl: (input.linkedinCompanyUrl ?? current.linkedinCompanyUrl).trim(),
  aparatProfileUrl: (input.aparatProfileUrl ?? current.aparatProfileUrl).trim(),
 };

 const pairs: Array<[string, string]> = [
  [GM_KEYS.ENABLED, next.enabled ? "1" : "0"],
  [GM_KEYS.URL, next.mapsUrl],
  [GM_KEYS.RATING, String(next.ratingValue)],
  [GM_KEYS.COUNT, String(next.reviewCount)],
  [GM_KEYS.SHOW_ON_SITE, next.showOnSite ? "1" : "0"],
  [GM_KEYS.EMBED_URL, next.embedUrl],
  [GM_KEYS.BING_PLACES_URL, next.bingPlacesUrl],
  [GM_KEYS.LOCAL_DIRECTORY_URL, next.localDirectoryUrl],
  [GM_KEYS.LINKEDIN_COMPANY_URL, next.linkedinCompanyUrl],
  [GM_KEYS.APARAT_PROFILE_URL, next.aparatProfileUrl],
 ];

 for (const [key, value] of pairs) {
  await db.systemSettings.upsert({
   where: { key },
   create: { key, value },
   update: { value },
  });
 }

 // ابطال کش (پیشوندی — همهٔ نسخه‌ها)
 try {
  cacheDeleteByPrefix(CACHE_PREFIX);
 } catch {
  /* best-effort */
 }
 return next;
}

/**
 * دادهٔ معتبر برای schema؟ — حداقل ۱ نظر و امتیاز > ۰ و فعال.
 * (توصیه: ≥۳ نظر؛ گوگل برای کمتر از آن معمولاً ستاره نشان نمی‌دهد)
 */
export function isGoogleRatingValidForSchema(s: GoogleMapsReviewsSettings): boolean {
 return (
  s.enabled && s.ratingValue > 0 && s.reviewCount >= 1 && s.mapsUrl.length > 10
 );
}

/**
 * Trick #7 (راند ۱۲): همهٔ پروفایل‌های بیرونی معتبر برای sameAs —
 * گوگل‌مپ + Bing Places + دایرکتوری محلی + LinkedIn + آپارات.
 * فیلتر: فقط http(s) معتبر؛ نتیجه یکتا (بدون تکرار) به ترتیب اولویت.
 * استفاده: components/seo/structured-data.tsx (تزریق به Organization/LocalBusiness)
 */
export function getSameAsProfileUrls(s: GoogleMapsReviewsSettings): string[] {
 const urls = [
  s.mapsUrl,
  s.bingPlacesUrl,
  s.localDirectoryUrl,
  s.linkedinCompanyUrl,
  s.aparatProfileUrl,
 ];
 const seen = new Set<string>();
 const out: string[] = [];
 for (const raw of urls) {
  const u = (raw || "").trim();
  // همان آستانهٔ اعتبار الگوی موجود (طول > ۱۰) + پروتکل http(s)
  if (u.length > 10 && /^https?:\/\//i.test(u) && !seen.has(u)) {
   seen.add(u);
   out.push(u);
  }
 }
 return out;
}

/** تبدیل لینک صفحهٔ گوگل‌مپ به لینک «ثبت نظر» — از الگوی استاندارد place */
export function buildWriteReviewLink(mapsUrl: string): string {
 if (!mapsUrl) return "";
 try {
  const u = new URL(mapsUrl);
  // اگر خودش لینک ثبت نظر بود → دست‌نخورده
  if (u.pathname.includes("/write-a-review") || u.searchParams.has("entry")) return mapsUrl;
  // الگوی استاندارد: search?...→ place/...?...action=write
  if (u.searchParams.has("q") || u.pathname.includes("/search/") || u.pathname.includes("/place/")) {
   return `${u.origin}${u.pathname}?${u.searchParams.toString()}&entry=write_review`;
  }
  return mapsUrl;
 } catch {
  return mapsUrl;
 }
}
