import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import {
 getGoogleMapsReviewsSettings,
 saveGoogleMapsReviewsSettings,
 buildWriteReviewLink,
 isGoogleRatingValidForSchema,
 getSameAsProfileUrls,
} from "@/lib/google-maps-reviews";

export const runtime = "nodejs";

// ============================================================
// /api/platform/settings/google-maps — نظرات و امتیاز گوگل مپ (v37)
// ============================================================
// درخواست مالک: بخش اختصاصی پنل ادمین برای لینک گوگل‌مپ + فعال‌سازی
// نمایش ستاره‌ها در نتایج جستجو.
//
// GET   → تنظیمات فعلی + پیش‌نمایش schema aggregateRating + فهرست sameAs
// PATCH → ذخیرهٔ تنظیمات { enabled, mapsUrl, ratingValue, reviewCount, showOnSite,
//         embedUrl, bingPlacesUrl, localDirectoryUrl, linkedinCompanyUrl, aparatProfileUrl }
//         (Trick #7 — سرویس‌های محلی دیگر: Bing Places / دایرکتوری محلی / LinkedIn / آپارات)
// ============================================================

export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const settings = await getGoogleMapsReviewsSettings();
 const schemaReady = isGoogleRatingValidForSchema(settings);
 // Trick #7: پروفایل‌های بیرونی معتبر برای sameAs (پیش‌نمایش پنل)
 const sameAsUrls = getSameAsProfileUrls(settings);
 return NextResponse.json({
  success: true,
  data: {
  ...settings,
  writeReviewUrl: buildWriteReviewLink(settings.mapsUrl),
  sameAsUrls,
  schemaPreview: schemaReady
   ? {
    "@type": "AggregateRating",
    ratingValue: settings.ratingValue,
    reviewCount: settings.reviewCount,
    bestRating: "5",
    worstRating: "1",
   }
   : null,
  },
 });
 } catch (error) {
 console.error("google-maps settings GET error:", error);
 return NextResponse.json(
  { success: false, error: "خطا در دریافت تنظیمات گوگل مپ" },
  { status: 500 }
 );
 }
}

export async function PATCH(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = (await req.json()) as {
  enabled?: boolean;
  mapsUrl?: string;
  ratingValue?: number;
  reviewCount?: number;
  showOnSite?: boolean;
  embedUrl?: string;
  // Trick #7 (راند ۱۲): سرویس‌های محلی دیگر — همان مکانیزم SystemSettings
  bingPlacesUrl?: string;
  localDirectoryUrl?: string;
  linkedinCompanyUrl?: string;
  aparatProfileUrl?: string;
 };

 // اعتبارسنجی لینک گوگل‌مپ — باید از سرویس‌های گوگل باشد
 if (body.mapsUrl) {
  try {
  const u = new URL(body.mapsUrl);
  const host = u.hostname.replace(/^www\./, "");
  const okHosts = ["maps.google.com", "google.com", "maps.app.goo.gl", "goo.gl", "search.google.com", "business.google.com"];
  if (!okHosts.includes(host) && !host.endsWith(".google.com")) {
   return NextResponse.json(
   { success: false, error: "لینک باید از سرویس‌های گوگل باشد (مثل maps.google.com یا maps.app.goo.gl)" },
   { status: 400 }
   );
  }
  } catch {
  return NextResponse.json(
   { success: false, error: "لینک واردشده معتبر نیست — لینک کامل را از گوگل‌مپ کپی کنید" },
   { status: 400 }
  );
  }
 }

 // Trick #7: اعتبارسنجی سرویس‌های محلی دیگر — محدودیت دامنه ندارند
 // (بینیگ/لینکدین/آپارات/دایرکتوری‌های ایرانی)؛ فقط URL معتبر http(s).
 const localServiceFields: Array<
  ["bingPlacesUrl" | "localDirectoryUrl" | "linkedinCompanyUrl" | "aparatProfileUrl", string]
 > = [
  ["bingPlacesUrl", "لینک Bing Places"],
  ["localDirectoryUrl", "لینک دایرکتوری محلی"],
  ["linkedinCompanyUrl", "لینک صفحهٔ شرکت در LinkedIn"],
  ["aparatProfileUrl", "لینک پروفایل آپارات"],
 ];
 for (const [field, label] of localServiceFields) {
  const value = body[field];
  if (value && value.trim()) {
  try {
   const u = new URL(value.trim());
   if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad protocol");
  } catch {
   return NextResponse.json(
   { success: false, error: `${label} معتبر نیست — لینک کامل http(s) وارد کنید` },
   { status: 400 }
   );
  }
  }
 }

 const saved = await saveGoogleMapsReviewsSettings(body);
 return NextResponse.json({
  success: true,
  message: "تنظیمات گوگل مپ ذخیره شد",
  data: saved,
 });
 } catch (error) {
 console.error("google-maps settings PATCH error:", error);
 return NextResponse.json(
  { success: false, error: "خطا در ذخیره تنظیمات گوگل مپ" },
  { status: 500 }
 );
 }
}
