import * as React from "react";
import { Star, ExternalLink, MapPin } from "lucide-react";
import {
 getGoogleMapsReviewsSettings,
 isGoogleRatingValidForSchema,
 buildWriteReviewLink,
} from "@/lib/google-maps-reviews";

// ============================================================
// GoogleReviewsBadge (v37) — بج «امتیاز گوگل» برای نمایش در سایت
// ============================================================
// چرا در سایت نمایشش می‌دهیم؟
//  ۱) اعتماد کاربر: عدد امتیاز + تعداد نظر + لینک به گوگل = اثبات اجتماعی
//  ۲) سئو: گوگل برای نشان‌دادن ستاره، محتوای امتیاز را باید «در صفحه» ببیند؛
//     بج قابل‌مشاهده + schema هم‌راستا = بیشترین شانس نمایش ستاره در SERP
//  ۳) GEO: مدل‌های هوش مصنوعی اعداد قابل‌استناد (امتیاز/تعداد نظر) را نقل می‌کنند
//
// Server Component — مستقیم از تنظیمات سوپرادمین می‌خواند (کش ۵ دقیقه).
// اگر تنظیمات معتبر نباشد، هیچی رندر نمی‌شود (صفر-ریسک).
// ============================================================

function PersianStars({ value }: { value: number }) {
 // امتیاز ۰-۵ → ستاره‌های پر/خالی
 const full = Math.round(value);
 return (
 <span className="inline-flex items-center gap-0.5" aria-hidden="true">
  {[1, 2, 3, 4, 5].map((i) => (
  <Star
   key={i}
   className={`h-4 w-4 ${i <= full ? "fill-amber-400 text-amber-400" : "fill-muted text-muted-foreground/30"}`}
  />
  ))}
  </span>
 );
}

export async function GoogleReviewsBadge({ compact = false }: { compact?: boolean }) {
 const settings = await getGoogleMapsReviewsSettings();
 if (!settings.showOnSite || !isGoogleRatingValidForSchema(settings)) return null;

 const faCount = settings.reviewCount.toLocaleString("fa-IR");
 const faRating = settings.ratingValue.toLocaleString("fa-IR", { maximumFractionDigits: 1 });
 const writeUrl = buildWriteReviewLink(settings.mapsUrl);

 if (compact) {
 return (
  <a
  href={settings.mapsUrl}
  target="_blank"
  rel="noopener noreferrer"
  className="group inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50/70 px-3 py-1.5 text-xs font-medium text-amber-900 transition-all hover:border-amber-300 hover:shadow-sm dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
  aria-label={`امتیاز ${faRating} از ۵ بر اساس ${faCount} نظر در گوگل`}
  >
  <PersianStars value={settings.ratingValue} />
  <span>
   {faRating} از {faCount} نظر گوگل
  </span>
  <ExternalLink className="h-3 w-3 opacity-60 transition-opacity group-hover:opacity-100" />
  </a>
 );
 }

 return (
 <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-l from-amber-50/80 to-background p-5 dark:border-amber-900/60 dark:from-amber-950/30">
  <div className="flex flex-wrap items-center justify-between gap-4">
  <div className="flex items-center gap-3">
   <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
   <MapPin className="h-5 w-5" />
   </div>
   <div>
   <p className="flex items-center gap-2 text-sm font-bold">
    <PersianStars value={settings.ratingValue} />
    <span>
    امتیاز {faRating} از ۵ در گوگل
    </span>
   </p>
   <p className="text-xs text-muted-foreground">
    بر اساس {faCount} نظر واقعی مشتریان در نقشه‌های گوگل
   </p>
   </div>
  </div>
  <div className="flex items-center gap-2">
   <a
   href={settings.mapsUrl}
   target="_blank"
   rel="noopener noreferrer"
   className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/70 bg-background px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-50 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950/60"
   >
   دیدن نظرات در گوگل
   <ExternalLink className="h-3.5 w-3.5" />
   </a>
   {writeUrl && (
   <a
   href={writeUrl}
   target="_blank"
   rel="noopener noreferrer"
   className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white transition-transform hover:scale-[1.03]"
   >
   <Star className="h-3.5 w-3.5 fill-white" />
   ثبت نظر شما
   </a>
   )}
  </div>
  </div>
 </div>
 );
}
