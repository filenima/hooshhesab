"use client";

import * as React from "react";
import { TrendingUp, RefreshCw, Star, Map as MapIcon, FileText, CalendarClock, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toPersianDigits } from "@/lib/persian";
import { cn } from "@/lib/utils";

// ============================================================
// SeoGrowthWidget (v37) — ویجت «رشد سئو» برای داشبورد سوپرادمین
// ------------------------------------------------------------
// درخواست مالک: پنل باید «بشدت دقیق و کامل» کار کند و سئو اولویت اول است.
// این ویجت در یک نگاه وضعیت سئو را نشان می‌دهد:
//  - کتابخانهٔ بلاگ: هدف ۲۶۷ (۶۷ منتشر + ۲۰۰ صف) + پیشرفت
//  - انتشار زمان‌بندی‌شده: بازهٔ هر-N-روز + نوبت بعدی
//  - sitemap: تعداد URL زنده + آخرین بازسازی فایل‌های سئو
//  - ستارهٔ گوگل: فعال/غیرفعال + امتیاز
// داده‌ها از APIهای موجود (scheduler + seo-files + google-maps).
// ============================================================

const LIBRARY_GOAL = 267;
const PUBLISHED_GOAL = 67;

interface SeoGrowthData {
  published: number;
  scheduled: number;
  drafts: number;
  intervalDays: number;
  paused: boolean;
  nextSlot: string | null;
  sitemapUrls: number | null;
  lastSeoBuild: string | null;
  googleStars: { enabled: boolean; rating: number; count: number } | null;
}

export function SeoGrowthWidget() {
  const [data, setData] = React.useState<SeoGrowthData | null>(null);
  const [loading, setLoading] = React.useState(true);

  const authHeaders = React.useMemo(() => {
    try {
      const token = localStorage.getItem("hoshhesab_admin_token") || "";
      return { Authorization: `Bearer ${token}` } as Record<string, string>;
    } catch {
      return {} as Record<string, string>;
    }
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [schedRes, seoRes, gmapsRes] = await Promise.allSettled([
      fetch("/api/platform/blog/scheduler", { cache: "no-store", headers: authHeaders }).then((r) => r.json()),
      fetch("/api/platform/seo-files", { cache: "no-store", headers: authHeaders }).then((r) => r.json()),
      fetch("/api/platform/settings/google-maps", { cache: "no-store", headers: authHeaders }).then((r) => r.json()),
    ]);
    const d: SeoGrowthData = {
      published: 0, scheduled: 0, drafts: 0, intervalDays: 2, paused: false, nextSlot: null,
      sitemapUrls: null, lastSeoBuild: null, googleStars: null,
    };
    try {
      if (schedRes.status === "fulfilled" && schedRes.value?.success) {
        const st = schedRes.value.data.stats;
        d.published = st.published; d.scheduled = st.scheduled; d.drafts = st.drafts;
        d.intervalDays = st.intervalDays; d.paused = st.paused;
        d.nextSlot = st.nextSlot ?? null;
      }
    } catch { /* ignore */ }
    try {
      if (seoRes.status === "fulfilled" && seoRes.value?.success) {
        const sf = seoRes.value.data;
        d.lastSeoBuild = sf.lastBuildAt ?? null;
        const sm = (sf.files || []).find((f: { id: string }) => f.id === "sitemap");
        d.sitemapUrls = sm?.urlCount ?? null;
      }
    } catch { /* ignore */ }
    try {
      if (gmapsRes.status === "fulfilled" && gmapsRes.value?.success) {
        const gm = gmapsRes.value.data;
        d.googleStars = { enabled: gm.enabled, rating: gm.ratingValue, count: gm.reviewCount };
      }
    } catch { /* ignore */ }
    setData(d);
    setLoading(false);
  }, [authHeaders]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const total = data ? data.published + data.scheduled + data.drafts : 0;
  const progress = Math.min(100, Math.round((total / LIBRARY_GOAL) * 100));
  const nextSlotFa = data?.nextSlot
    ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "full" }).format(new Date(data.nextSlot))
    : null;

  return (
    <Card className="overflow-hidden border-t-2 border-t-emerald-600/70">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            رشد سئو — وضعیت یک‌نگاهی
          </CardTitle>
          <button
            onClick={() => void load()}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="به‌روزرسانی وضعیت سئو"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3.5">
        {loading || !data ? (
          <>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : (
          <>
            {/* پیشرفت کتابخانهٔ بلاگ */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium">کتابخانهٔ بلاگ (هدف {toPersianDigits(LIBRARY_GOAL)})</span>
                <span className="tnum text-muted-foreground">
                  {toPersianDigits(total)} / {toPersianDigits(LIBRARY_GOAL)}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-emerald-600 transition-all duration-700"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="text-[10px]">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  {toPersianDigits(data.published)} منتشر
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  <CalendarClock className="h-3 w-3 text-sky-600" />
                  {toPersianDigits(data.scheduled)} در صف
                </Badge>
                {data.drafts > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    <FileText className="h-3 w-3 text-amber-600" />
                    {toPersianDigits(data.drafts)} بدون نوبت
                  </Badge>
                )}
                {data.paused && (
                  <Badge variant="secondary" className="bg-amber-500/15 text-[10px] text-amber-700 dark:text-amber-400">
                    صف متوقف
                  </Badge>
                )}
              </div>
            </div>

            {/* نوبت بعدی */}
            <div className="rounded-xl border bg-muted/30 p-3 text-xs leading-6">
              {data.scheduled > 0 ? (
                <>
                  انتشار خودکار: هر {toPersianDigits(data.intervalDays)} روز
                  {nextSlotFa ? <> — نوبت بعدی: <strong>{nextSlotFa}</strong></> : null}
                </>
              ) : (
                <span className="text-muted-foreground">صف انتشار خالی است — از «زمان‌بند انتشار» نوبت‌دهی کنید.</span>
              )}
            </div>

            {/* sitemap + llms + ستاره */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border p-2.5 text-center">
                <FileText className="mx-auto mb-1 h-4 w-4 text-primary/70" />
                <p className="tnum text-sm font-extrabold">
                  {data.sitemapUrls != null ? toPersianDigits(data.sitemapUrls) : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">URL سایت‌مپ</p>
              </div>
              <div className="rounded-xl border p-2.5 text-center">
                <Star className={cn("mx-auto mb-1 h-4 w-4", data.googleStars?.enabled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
                <p className="tnum text-sm font-extrabold">
                  {data.googleStars?.enabled
                    ? `${(data.googleStars.rating || 0).toLocaleString("fa-IR", { maximumFractionDigits: 1 })}★`
                    : "خاموش"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {data.googleStars?.enabled ? `${toPersianDigits(data.googleStars.count)} نظر گوگل` : "ستارهٔ گوگل"}
                </p>
              </div>
              <div className="rounded-xl border p-2.5 text-center">
                <MapIcon className="mx-auto mb-1 h-4 w-4 text-primary/70" />
                <p className="tnum text-sm font-extrabold">
                  {data.lastSeoBuild
                    ? new Intl.DateTimeFormat("fa-IR", { month: "short", day: "numeric" }).format(new Date(data.lastSeoBuild))
                    : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">آخرین بازسازی سئو</p>
              </div>
            </div>

            {/* وضعیت هدف ۶۷ منتشر */}
            {data.published > 0 && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {data.published === PUBLISHED_GOAL ? (
                  <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> ساختار ۶۷ منتشر + ۲۰۰ صف فعال است.</>
                ) : (
                  <><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> منتشرشده {toPersianDigits(data.published)} است (هدف: {toPersianDigits(PUBLISHED_GOAL)}) — از «زمان‌بند انتشار → ساختاردهی ۶۷/۲۰۰» استفاده کنید.</>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default SeoGrowthWidget;
