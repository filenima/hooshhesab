"use client";

import * as React from "react";
import {
  TrendingUp,
  RefreshCw,
  Sparkles,
  Star,
  FileText,
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  Rocket,
  Map as MapIcon,
  Layers,
  ExternalLink,
  Loader2,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toPersianDigits } from "@/lib/persian";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ============================================================
// SeoGrowthTab (11-D) — تب «سئو و رشد» — مرکز کنترل سئو در یک صفحه
// ------------------------------------------------------------
// تجمیع درخواست مالک: همهٔ کارهای سئو پراکنده در یک تب:
//  ۱) دکمهٔ بازسازی فایل‌های سئو (sitemap/robots/llms/rss)
//  ۲) دکمهٔ ایندکس فوری (IndexNow/Bing/Yandex) + نتیجهٔ پینگ‌ها
//  ۳) پیش‌نمایش llms.txt (ربات‌های هوش مصنوعی)
//  ۴) وضعیت زمان‌بند انتشار بلاگ + نوبت بعدی
//  ۵) آمار رشد سئو (کتابخانهٔ بلاگ، ستارهٔ گوگل، پوشش خوشه‌ها)
// همهٔ داده‌ها واقعی و از APIهای موجود — بدون هیچ دادهٔ نمایشی.
// ============================================================

interface SchedStats {
  published: number;
  scheduled: number;
  drafts: number;
  intervalDays: number;
  paused: boolean;
  nextSlot: string | null;
}

interface SeoFileRow {
  id: "sitemap" | "robots" | "llms" | "rss";
  name: string;
  ok: boolean;
  urlCount?: number;
  sizeBytes?: number;
  error?: string;
}

interface PingResult {
  engine: string;
  kind: "search" | "ai";
  ok: boolean;
  status?: number;
  note?: string;
}

interface CoverageRow {
  id: string;
  label: string;
  total: number;
  published: number;
  draft: number;
}

interface GMapsShape {
  enabled: boolean;
  ratingValue: number;
  reviewCount: number;
}

interface SeoGrowthData {
  sched: SchedStats | null;
  files: SeoFileRow[];
  lastBuildAt: string | null;
  lastReindexAt: string | null;
  sitemapUrls: number | null;
  googleStars: GMapsShape | null;
  coverage: CoverageRow[];
}

const faDate = (iso: string | null | undefined, withTime = false) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fa-IR", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return "—";
  }
};

export function SeoGrowthTab({ token }: { token: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<"" | "rebuild" | "reindex" | "llms">("");
  const [data, setData] = React.useState<SeoGrowthData | null>(null);
  const [pings, setPings] = React.useState<PingResult[] | null>(null);
  const [llmsText, setLlmsText] = React.useState<string | null>(null);

  const authHeaders = React.useMemo<Record<string, string>>(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    const [schedRes, seoRes, gmapsRes, coverageRes] = await Promise.allSettled([
      fetch("/api/platform/blog/scheduler", { cache: "no-store", headers: authHeaders }).then((r) => r.json()).catch(() => null),
      fetch("/api/platform/seo-files", { cache: "no-store", headers: authHeaders }).then((r) => r.json()).catch(() => null),
      fetch("/api/platform/settings/google-maps", { cache: "no-store", headers: authHeaders }).then((r) => r.json()).catch(() => null),
      fetch("/api/platform/seo-content", { cache: "no-store", headers: authHeaders }).then((r) => r.json()).catch(() => null),
    ]);

    const d: SeoGrowthData = {
      sched: null, files: [], lastBuildAt: null, lastReindexAt: null,
      sitemapUrls: null, googleStars: null, coverage: [],
    };
    try {
      if (schedRes.status === "fulfilled" && schedRes.value?.success) d.sched = schedRes.value.data.stats;
    } catch { /* ignore */ }
    try {
      if (seoRes.status === "fulfilled" && seoRes.value?.success) {
        const sf = seoRes.value.data;
        d.lastBuildAt = sf.lastBuildAt ?? null;
        d.files = sf.files ?? [];
        const sm = d.files.find((f) => f.id === "sitemap");
        d.sitemapUrls = sm?.urlCount ?? (sf.lastStats?.sitemapUrls ?? null);
      }
    } catch { /* ignore */ }
    try {
      if (gmapsRes.status === "fulfilled" && gmapsRes.value?.success) {
        const gm = gmapsRes.value.data;
        d.googleStars = { enabled: gm.enabled, ratingValue: gm.ratingValue, reviewCount: gm.reviewCount };
      }
    } catch { /* ignore */ }
    try {
      if (coverageRes.status === "fulfilled" && coverageRes.value?.success) {
        d.coverage = coverageRes.value.data?.coverage ?? [];
      }
    } catch { /* ignore */ }
    setData(d);
    setLoading(false);
  }, [authHeaders]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // بازسازی فایل‌های سئو
  const rebuild = async () => {
    setBusy("rebuild");
    setPings(null);
    try {
      const res = await fetch("/api/platform/seo-files", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ action: "rebuild" }),
      });
      const j = (await res.json().catch(() => null)) as { success?: boolean; message?: string; error?: string } | null;
      if (j?.success) {
        toast({ title: "بازسازی فایل‌های سئو انجام شد", description: j.message });
        await load();
      } else {
        toast({ title: "خطا در بازسازی", description: j?.error || "عملیات ناموفق بود", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  // ایندکس فوری (IndexNow)
  const reindex = async () => {
    setBusy("reindex");
    setPings(null);
    try {
      const res = await fetch("/api/platform/seo-files", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ action: "reindex" }),
      });
      const j = (await res.json().catch(() => null)) as {
        success?: boolean; message?: string; error?: string;
        data?: { pings?: PingResult[]; at?: string };
      } | null;
      if (j?.success) {
        setPings(j.data?.pings ?? []);
        toast({ title: "اعلان ایندکس ارسال شد", description: j.message });
        await load();
      } else {
        toast({ title: "خطا در اعلان ایندکس", description: j?.error || "عملیات ناموفق بود", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  // پیش‌نمایش llms.txt (فایل عمومی — بدون احراز هویت)
  const loadLlms = async () => {
    setBusy("llms");
    try {
      const res = await fetch("/llms.txt", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const text = await res.text();
      setLlmsText(text);
    } catch {
      toast({ title: "خطا", description: "دریافت llms.txt ناموفق بود — ابتدا بازسازی کنید", variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const total = data?.sched ? data.sched.published + data.sched.scheduled + data.sched.drafts : 0;
  const starsActive = data?.googleStars?.enabled && (data.googleStars.ratingValue || 0) > 0 && (data.googleStars.reviewCount || 0) > 0;

  return (
    <div className="space-y-6">
      {/* هدر + اقدامات */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <TrendingUp className="h-5 w-5 text-primary" />
            سئو و رشد
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            مرکز کنترل سئو: بازسازی فایل‌ها، ایندکس فوری، زمان‌بند انتشار و آمار رشد
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={rebuild} disabled={busy !== ""} className="gap-2">
            {busy === "rebuild" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {busy === "rebuild" ? "در حال بازسازی…" : "بازسازی فایل‌های سئو"}
          </Button>
          <Button onClick={reindex} disabled={busy !== ""} variant="outline" className="gap-2 border-primary/40 hover:border-primary hover:bg-primary/5">
            {busy === "reindex" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-primary" />}
            ایندکس فوری (IndexNow)
          </Button>
        </div>
      </div>

      {/* نتیجهٔ پینگ موتورها */}
      {pings && (
        <Card className="border-primary/25 bg-primary/[0.03]">
          <CardContent className="p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-bold">
              <Sparkles className="h-4 w-4 text-primary" />
              نتیجهٔ اعلان ایندکس به موتورها
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {pings.map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-lg border bg-background/80 px-3 py-2">
                  <span className="text-xs font-medium">{p.engine}</span>
                  <span className={cn("text-[10px] font-bold", p.ok ? "text-emerald-600" : "text-muted-foreground")}>
                    {p.ok ? `پاسخ ${toPersianDigits(p.status ?? 200)} ✓` : "در این محیط قابل اتصال نبود"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ردیف آمار */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="card-hover border-t-2 border-t-emerald-600/70">
          <CardContent className="p-4">
            {loading ? <Skeleton className="h-8 w-16" /> : (
              <>
                <p className="tnum text-2xl font-extrabold text-emerald-600">{toPersianDigits(data?.sched?.published ?? 0)}</p>
                <p className="mt-1 text-xs text-muted-foreground">مقالهٔ منتشرشده</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="card-hover border-t-2 border-t-sky-600/70">
          <CardContent className="p-4">
            {loading ? <Skeleton className="h-8 w-16" /> : (
              <>
                <p className="tnum text-2xl font-extrabold text-sky-600">{toPersianDigits(data?.sched?.scheduled ?? 0)}</p>
                <p className="mt-1 text-xs text-muted-foreground">مقاله در صف انتشار</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="card-hover border-t-2 border-t-primary/70">
          <CardContent className="p-4">
            {loading ? <Skeleton className="h-8 w-20" /> : (
              <>
                <p className="tnum text-2xl font-extrabold text-primary">
                  {data?.sitemapUrls != null ? toPersianDigits(data.sitemapUrls) : "—"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">URL در سایت‌مپ</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className={cn("card-hover border-t-2", starsActive ? "border-t-amber-400" : "border-t-muted")}>
          <CardContent className="p-4">
            {loading ? <Skeleton className="h-8 w-16" /> : (
              <>
                <p className="tnum flex items-center gap-1 text-2xl font-extrabold text-amber-500">
                  <Star className={cn("h-4 w-4", starsActive && "fill-amber-400 text-amber-400")} />
                  {starsActive ? (data?.googleStars?.ratingValue ?? 0).toLocaleString("fa-IR", { maximumFractionDigits: 1 }) : "خاموش"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {starsActive ? `${toPersianDigits(data?.googleStars?.reviewCount ?? 0)} نظر گوگل` : "ستارهٔ نتایج جستجو"}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* زمان‌بند انتشار */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarClock className="h-4 w-4 text-primary" />
              زمان‌بند انتشار بلاگ
            </CardTitle>
            <CardDescription className="text-xs">انتشار خودکار پیش‌نویس‌های صف‌شده</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
            ) : !data?.sched ? (
              <p className="py-6 text-center text-xs text-muted-foreground">اطلاعات زمان‌بند در دسترس نیست</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    هر {toPersianDigits(data.sched.intervalDays)} روز
                  </Badge>
                  <Badge variant={data.sched.paused ? "destructive" : "default"} className="text-[10px]">
                    {data.sched.paused ? "متوقف" : "فعال"}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    مجموع: {toPersianDigits(total)} مقاله
                  </Badge>
                </div>
                <div className="rounded-xl border bg-muted/30 p-3 text-xs leading-6">
                  {data.sched.scheduled > 0 ? (
                    <>
                      نوبت بعدی: <strong>{faDate(data.sched.nextSlot, true)}</strong>
                      {data.sched.drafts > 0 && (
                        <span className="text-muted-foreground"> — {toPersianDigits(data.sched.drafts)} پیش‌نویس بدون نوبت</span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">صف انتشار خالی است — از «زمان‌بند انتشار» نوبت‌دهی کنید.</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {data.sched.published >= 67 ? (
                    <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> ساختار ۶۷ منتشر فعال است.</>
                  ) : (
                    <><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> منتشرشده کمتر از هدف ۶۷ است.</>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* پوشش خوشه‌های محتوایی */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Layers className="h-4 w-4 text-primary" />
              پوشش خوشه‌های محتوایی
            </CardTitle>
            <CardDescription className="text-xs">مقالهٔ منتشرشده در برابر کل خوشه — دادهٔ واقعی سئو</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
            ) : (data?.coverage ?? []).length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">هنوز دادهٔ خوشه‌ای ثبت نشده است</p>
            ) : (
              data?.coverage.map((c) => {
                const pct = c.total > 0 ? Math.round((c.published / c.total) * 100) : 0;
                return (
                  <div key={c.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate">{c.label}</span>
                      <span className="tnum shrink-0 text-muted-foreground">
                        {toPersianDigits(c.published)} از {toPersianDigits(c.total)} ({toPersianDigits(pct)}٪)
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-l from-primary to-emerald-500 transition-all duration-700"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* llms.txt */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-primary" />
                راهنمای هوش مصنوعی (llms.txt)
              </CardTitle>
              <CardDescription className="text-xs">
                فایلی که GPTBot، ClaudeBot و PerplexityBot برای نقل‌قول برند شما می‌خوانند
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href="/llms.txt" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  بازکردن فایل
                </a>
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={loadLlms} disabled={busy !== ""}>
                {busy === "llms" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                پیش‌نمایش
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {llmsText === null ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              برای مشاهدهٔ محتوای فایل، «پیش‌نمایش» را بزنید — آخرین بازسازی: {faDate(data?.lastBuildAt, true)}
            </p>
          ) : (
            <pre dir="ltr" className="max-h-64 overflow-auto rounded-xl bg-muted/60 p-4 text-[11px] leading-5">
{llmsText.slice(0, 6000)}
{llmsText.length > 6000 ? "\n… (برای متن کامل فایل را باز کنید)" : ""}
            </pre>
          )}
        </CardContent>
      </Card>

      {/* راهنمای رشد */}
      <Card>
        <CardContent className="p-4 text-xs leading-6 text-muted-foreground">
          <p className="mb-2 flex items-center gap-1.5 font-bold text-foreground">
            <Rocket className="h-4 w-4 text-primary" />
            چرخهٔ پیشنهادی رشد سئو
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border p-3">
              <p className="mb-1 font-bold text-foreground">۱. هفته‌ای یک‌بار</p>
              <p>پس از انتشار مقالهٔ جدید، «بازسازی فایل‌های سئو» و سپس «ایندکس فوری» را بزنید.</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="mb-1 font-bold text-foreground">۲. هر ۲۸ روز</p>
              <p>تایتل صفحات مهم را در تب «A/B تست تایتل» بازبینی و واریانت برنده را فعال کنید.</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="mb-1 font-bold text-foreground">۳. هفتگی</p>
              <p>یک پست در تب «پست گوگل بیزینس» آماده و در پروفایل گوگل منتشر کنید.</p>
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" />
            <MapIcon className="h-3.5 w-3.5" />
            همهٔ اعداد این صفحه از دیتابیس و سرویس‌های زنده خوانده می‌شوند.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default SeoGrowthTab;
