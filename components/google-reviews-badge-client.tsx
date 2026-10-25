"use client";

import * as React from "react";
import { Star, ExternalLink } from "lucide-react";

// ============================================================
// GoogleReviewsBadgeClient (v37) — بج امتیاز گوگل در صفحات کلاینت
// ============================================================
// نسخهٔ کلاینتِ سبکِ GoogleReviewsBadge — از /api/google-maps می‌خواند
// (کش مرورگر ۵ دقیقه). در فوتر لندینگ و سرتیتر بخش نظرات استفاده می‌شود.
// اگر داده فعال نباشد → null (هیچ فضایی اشغال نمی‌شود).
// ============================================================

interface GMapsData {
 active: boolean;
 ratingValue?: number;
 reviewCount?: number;
 mapsUrl?: string;
}

export function GoogleReviewsBadgeClient({
 variant = "pill",
}: {
 variant?: "pill" | "inline";
}) {
 const [data, setData] = React.useState<GMapsData | null>(null);

 React.useEffect(() => {
  let cancelled = false;
  fetch("/api/google-maps", { cache: "default" })
  .then((r) => r.json())
  .then((j) => {
   if (!cancelled && j?.success && j.data?.active) setData(j.data);
  })
  .catch(() => {});
  return () => {
  cancelled = true;
  };
 }, []);

 if (!data?.active || !data.ratingValue || !data.reviewCount) return null;

 const faRating = data.ratingValue.toLocaleString("fa-IR", { maximumFractionDigits: 1 });
 const faCount = data.reviewCount.toLocaleString("fa-IR");
 const full = Math.round(data.ratingValue);

 const stars = (
 <span className="inline-flex items-center gap-0.5" aria-hidden="true">
  {[1, 2, 3, 4, 5].map((i) => (
  <Star
   key={i}
   className={`h-3.5 w-3.5 ${i <= full ? "fill-amber-400 text-amber-400" : "fill-muted text-muted-foreground/30"}`}
  />
  ))}
  </span>
 );

 if (variant === "inline") {
 return (
  <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
  {stars}
  <span dir="rtl">
  {faRating} از {faCount} نظر در گوگل
  </span>
 </span>
 );
 }

 return (
 <a
  href={data.mapsUrl || "#"}
  target="_blank"
  rel="noopener noreferrer"
  className="group inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50/70 px-3.5 py-1.5 text-xs font-semibold text-amber-900 transition-all hover:border-amber-300 hover:shadow-sm dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
  aria-label={`امتیاز ${faRating} از ۵ بر اساس ${faCount} نظر در گوگل`}
 >
 {stars}
 <span>
  {faRating} از {faCount} نظر گوگل
 </span>
 <ExternalLink className="h-3 w-3 opacity-60 transition-opacity group-hover:opacity-100" />
 </a>
 );
}
