import { NextResponse } from "next/server";
import {
 getGoogleMapsReviewsSettings,
 isGoogleRatingValidForSchema,
 buildWriteReviewLink,
} from "@/lib/google-maps-reviews";

export const runtime = "nodejs";

// ============================================================
// /api/google-maps (عمومی) — دادهٔ نمایش بج امتیاز گوگل در سایت
// ============================================================
// فقط فیلدهای امنِ نمایش (بدون تنظیمات حساس). اگر showOnSite خاموش یا
// داده نامعتبر بود → active:false تا کلاینت چیزی رندر نکند.
// کش مرورگر ۵ دقیقه — عدد امتیاز زیاد تغییر نمی‌کند.
// ============================================================

export async function GET() {
 try {
 const s = await getGoogleMapsReviewsSettings();
 const valid = isGoogleRatingValidForSchema(s);
 if (!s.showOnSite || !valid) {
  return NextResponse.json(
  { success: true, data: { active: false } },
  { headers: { "Cache-Control": "public, max-age=300" } }
  );
 }
 return NextResponse.json(
  {
  success: true,
  data: {
  active: true,
  ratingValue: s.ratingValue,
  reviewCount: s.reviewCount,
  mapsUrl: s.mapsUrl,
  writeReviewUrl: buildWriteReviewLink(s.mapsUrl),
  },
  },
  { headers: { "Cache-Control": "public, max-age=300" } }
 );
 } catch {
 return NextResponse.json(
  { success: true, data: { active: false } },
  { headers: { "Cache-Control": "public, max-age=60" } }
 );
 }
}
