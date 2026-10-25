"use client";

import * as React from "react";
import {
 MapPin,
 Star,
 Save,
 RefreshCw,
 ExternalLink,
 CheckCircle2,
 AlertTriangle,
 Info,
 Sparkles,
 Search,
 Building2,
 ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

/* ============================================================
 * GoogleMapsTab (v37) — نظرات و امتیاز گوگل مپ
 * ------------------------------------------------------------
 * درخواست مالک: «۳۰ ریویو در گوگل مپ دارم؛ کنار سایت در نتایج
 * جستجو ستاره نشان بده + قسمت اختصاصی در پنل با لینک گوگل‌مپ.»
 *
 * چه چیزی این تب انجام می‌دهد:
 *  ۱) لینک Google Maps Business Profile + امتیاز + تعداد نظرات
 *  ۲) فعال‌سازی aggregateRating در schema (ستارهٔ نتایج جستجو)
 *  ۳) نمایش بج امتیاز در سایت (لندینگ/فوتر) — قابل خاموش‌کردن
 *  ۴) پیش‌نمایش زندهٔ schema + راهنمای گام‌به‌گام
 * ============================================================ */

interface GMapsSettings {
 enabled: boolean;
 mapsUrl: string;
 ratingValue: number;
 reviewCount: number;
 showOnSite: boolean;
 embedUrl: string;
 // Trick #7 (راند ۱۲): سرویس‌های محلی دیگر — تزریق به sameAs
 bingPlacesUrl?: string;
 localDirectoryUrl?: string;
 linkedinCompanyUrl?: string;
 aparatProfileUrl?: string;
 writeReviewUrl?: string;
 sameAsUrls?: string[];
 schemaPreview?: Record<string, unknown> | null;
}

function apiFetch(path: string, token: string, options: RequestInit = {}) {
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
}

function PersianStars({ value }: { value: number }) {
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

export function GoogleMapsTab({ token }: { token: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [settings, setSettings] = React.useState<GMapsSettings | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/platform/settings/google-maps", token);
      const json = (await res.json()) as { success?: boolean; data?: GMapsSettings };
      if (json?.success && json.data) setSettings(json.data);
    } catch {
      toast({ title: "خطا در دریافت تنظیمات گوگل مپ", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!settings) return;
    if (settings.enabled && !settings.mapsUrl) {
      toast({
        title: "لینک گوگل‌مپ لازم است",
        description: "برای فعال‌سازی ستاره‌ها، لینک کامل Google Maps را وارد کنید",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/platform/settings/google-maps", token, {
        method: "PATCH",
        body: JSON.stringify({
          enabled: settings.enabled,
          mapsUrl: settings.mapsUrl,
          ratingValue: Number(settings.ratingValue) || 0,
          reviewCount: Number(settings.reviewCount) || 0,
          showOnSite: settings.showOnSite,
          embedUrl: settings.embedUrl,
          // Trick #7: سرویس‌های محلی دیگر — همان مکانیزم ذخیره
          bingPlacesUrl: settings.bingPlacesUrl || "",
          localDirectoryUrl: settings.localDirectoryUrl || "",
          linkedinCompanyUrl: settings.linkedinCompanyUrl || "",
          aparatProfileUrl: settings.aparatProfileUrl || "",
        }),
      });
      const json = (await res.json()) as { success?: boolean; message?: string; error?: string };
      if (json?.success) {
        toast({ title: json.message || "تنظیمات ذخیره شد", variant: "default" });
        void load();
      } else {
        toast({ title: json?.error || "خطا در ذخیره", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطا در ذخیره تنظیمات", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const schemaActive = settings.enabled && settings.ratingValue > 0 && settings.reviewCount >= 1 && settings.mapsUrl.length > 10;

  return (
    <div className="space-y-6">
      {/* سرتیتر + وضعیت */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <MapPin className="h-5 w-5 text-primary" />
            نظرات و امتیاز گوگل مپ
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            نمایش ستارهٔ امتیاز کنار سایت در نتایج جستجوی گوگل (Rich Snippet)
          </p>
        </div>
        <Badge variant={schemaActive ? "default" : "secondary"} className="gap-1.5 text-xs">
          {schemaActive ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" /> اسکیمای ستاره فعال
            </>
          ) : (
            <>
              <AlertTriangle className="h-3.5 w-3.5" /> اسکیمای ستاره غیرفعال
            </>
          )}
        </Badge>
      </div>

      {/* پیش‌نمایش بج */}
      <Card className="overflow-hidden border-amber-200/70 bg-gradient-to-l from-amber-50/60 to-background dark:border-amber-900/50 dark:from-amber-950/20">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
              <Star className="h-5 w-5" />
            </div>
            <div>
              <p className="flex items-center gap-2 text-sm font-bold">
                <PersianStars value={settings.ratingValue || 0} />
                <span>
                  امتیاز {(settings.ratingValue || 0).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} از ۵ در گوگل
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {(settings.reviewCount || 0).toLocaleString("fa-IR")} نظر واقعی در نقشه‌های گوگل — پیش‌نمایش بج سایت
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            پیش‌نمایش زندهٔ سایت
          </Badge>
        </CardContent>
      </Card>

      {/* پیش‌نمایش در نتایج گوگل (11-D) — شبیه‌سازی SERP با/بدون ستاره */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-primary" />
            پیش‌نمایش در نتایج گوگل
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {schemaActive
              ? "نمایش تقریبی نتیجهٔ سایت شما در گوگل پس از خزش مجدد — ستاره و امتیاز کنار عنوان"
              : "فعلاً بدون ستاره — پس از فعال‌سازی و خزش گوگل، ردیف امتیاز ظاهر می‌شود"}
          </p>
        </CardHeader>
        <CardContent>
          <div dir="ltr" className="mx-auto max-w-xl rounded-2xl border bg-white p-5 shadow-sm dark:bg-muted/40">
            {/* ردیف سایت */}
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                هـ
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm leading-4 text-[#202124] dark:text-foreground">هوش</p>
                <p className="truncate text-xs leading-4 text-[#4d5156] dark:text-muted-foreground">
                  hoosh.nobatime.ir
                </p>
              </div>
            </div>
            {/* عنوان آبی */}
            <p className="mt-1.5 text-lg leading-6 text-[#1a0dab] dark:text-sky-500 hover:underline">
              نرم‌افزار حسابداری هوش | حسابداری آنلاین هوشمند
            </p>
            {/* ردیف امتیاز — فقط وقتی اسکیما فعال است */}
            {schemaActive ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-[#4d5156] dark:text-muted-foreground">
                <span className="flex items-center gap-0.5" aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      className={`h-3.5 w-3.5 ${i <= Math.round(settings.ratingValue || 0) ? "fill-[#fbbc04] text-[#fbbc04]" : "fill-muted text-muted-foreground/30"}`}
                    />
                  ))}
                </span>
                <span className="font-medium text-[#202124] dark:text-foreground">
                  {(settings.ratingValue || 0).toLocaleString("fa-IR", { maximumFractionDigits: 1 })}
                </span>
                <span>({(settings.reviewCount || 0).toLocaleString("fa-IR")})</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground/70">★ ★ ★ ★ ★ — پس از فعال‌سازی این‌جا امتیاز ظاهر می‌شود</p>
            )}
            {/* توضیح */}
            <p className="mt-1 text-sm leading-5 text-[#4d5156] dark:text-muted-foreground" dir="rtl">
              نرم‌افزار حسابداری ابری هوش با هوش مصنوعی، اتصال به سامانه مودیان، انبار، خزانه‌داری و گزارش‌های حرفه‌ای…
            </p>
          </div>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            نمایش دقیق نهایی بر عهدهٔ گوگل است؛ این پیش‌نمایش ساختار و محل ستاره را نشان می‌دهد.
          </p>
        </CardContent>
      </Card>

      {/* فرم اصلی */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">تنظیمات</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* فعال‌سازی */}
          <div className="flex items-center justify-between rounded-xl border p-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold">نمایش ستاره‌ها در نتایج جستجو</Label>
              <p className="text-xs text-muted-foreground">
                aggregateRating به اسکیمای SoftwareApplication تزریق می‌شود + لینک گوگل‌مپ به sameAs سازمان
              </p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(v) => setSettings({ ...settings, enabled: v })}
            />
          </div>

          {/* لینک گوگل مپ */}
          <div className="space-y-2">
            <Label htmlFor="maps-url">لینک Google Maps (Business Profile)</Label>
            <div className="flex gap-2">
              <Input
                id="maps-url"
                dir="ltr"
                placeholder="https://maps.app.goo.gl/..."
                value={settings.mapsUrl}
                onChange={(e) => setSettings({ ...settings, mapsUrl: e.target.value })}
              />
              {settings.mapsUrl && (
                <Button variant="outline" size="icon" asChild>
                  <a href={settings.mapsUrl} target="_blank" rel="noopener noreferrer" aria-label="بازکردن لینک">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              از اپ نقشهٔ گوگل → پروفایل کسب‌وکار → «اشتراک‌گذاری» → «کپی لینک»
            </p>
          </div>

          {/* امتیاز + تعداد */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rating">امتیاز (۰ تا ۵)</Label>
              <Input
                id="rating"
                type="number"
                min={0}
                max={5}
                step={0.1}
                dir="ltr"
                value={settings.ratingValue || ""}
                onChange={(e) => setSettings({ ...settings, ratingValue: Number(e.target.value) })}
                placeholder="4.8"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="count">تعداد نظرات</Label>
              <Input
                id="count"
                type="number"
                min={0}
                dir="ltr"
                value={settings.reviewCount || ""}
                onChange={(e) => setSettings({ ...settings, reviewCount: Number(e.target.value) })}
                placeholder="30"
              />
            </div>
          </div>

          {/* نمایش در سایت */}
          <div className="flex items-center justify-between rounded-xl border p-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold">نمایش بج امتیاز در سایت</Label>
              <p className="text-xs text-muted-foreground">
                بج «⭐ امتیاز از N نظر در گوگل» در فوتر لندینگ و بخش نظرات
              </p>
            </div>
            <Switch
              checked={settings.showOnSite}
              onCheckedChange={(v) => setSettings({ ...settings, showOnSite: v })}
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? <RefreshCw className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
              {saving ? "در حال ذخیره..." : "ذخیره تنظیمات"}
            </Button>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className="ml-2 h-4 w-4" /> بازخوانی
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* پیش‌نمایش schema */}
      {schemaActive && settings.schemaPreview && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              اسکیمای تزریق‌شده به صفحه‌ها (AggregateRating)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre dir="ltr" className="max-h-48 overflow-auto rounded-xl bg-muted/60 p-4 text-xs leading-5">
{JSON.stringify(settings.schemaPreview, null, 2)}
            </pre>
            <p className="mt-2 text-xs text-muted-foreground">
              این داده به‌صورت خودکار در همهٔ صفحات عمومی تزریق می‌شود؛ Google Rich Results Test را برای راستی‌آزمایی اجرا کنید.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ─── Trick #7 (راند ۱۲): سرویس‌های محلی دیگر (Bing Places و...) ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />
            سرویس‌های محلی دیگر (Bing Places و...)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            پروفایل کسب‌وکار در دایرکتوری‌های محلی دیگر — هر لینک معتبر به آرایهٔ sameAs اسکیمای
            Organization/LocalBusiness اضافه می‌شود (اتصال موجودیت در Knowledge Graph و تقویت Local Pack)
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* فیلدهای URL */}
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                {
                  id: "bing-places-url",
                  label: "لینک Bing Places",
                  hint: "پروفایل کسب‌وکار در bing.com/places — برای نتایج محلی بینگ",
                  placeholder: "https://www.bing.com/places/...",
                  value: settings.bingPlacesUrl || "",
                  onChange: (v: string) => setSettings({ ...settings, bingPlacesUrl: v }),
                },
                {
                  id: "local-directory-url",
                  label: "پروفایل در دایرکتوری محلی",
                  hint: "سرویس‌های محلی ایرانی (نشان، دایرکتوری‌های اصناف و...)",
                  placeholder: "https://neshan.org/...",
                  value: settings.localDirectoryUrl || "",
                  onChange: (v: string) => setSettings({ ...settings, localDirectoryUrl: v }),
                },
                {
                  id: "linkedin-company-url",
                  label: "صفحهٔ شرکت در LinkedIn",
                  hint: "صفحهٔ شرکت — سیگنال اعتبار برای پنل دانش گوگل",
                  placeholder: "https://www.linkedin.com/company/...",
                  value: settings.linkedinCompanyUrl || "",
                  onChange: (v: string) => setSettings({ ...settings, linkedinCompanyUrl: v }),
                },
                {
                  id: "aparat-profile-url",
                  label: "پروفایل آپارات (ویدیو)",
                  hint: "کانال/پروفایل آپارات — ویدیوهای آموزشی کسب‌وکار",
                  placeholder: "https://www.aparat.com/...",
                  value: settings.aparatProfileUrl || "",
                  onChange: (v: string) => setSettings({ ...settings, aparatProfileUrl: v }),
                },
              ] as const
            ).map((f) => (
              <div key={f.id} className="space-y-2">
                <Label htmlFor={f.id}>{f.label}</Label>
                <div className="flex gap-2">
                  <Input
                    id={f.id}
                    dir="ltr"
                    placeholder={f.placeholder}
                    value={f.value}
                    onChange={(e) => f.onChange(e.target.value)}
                  />
                  {f.value && (
                    <Button variant="outline" size="icon" asChild>
                      <a href={f.value} target="_blank" rel="noopener noreferrer" aria-label="بازکردن لینک">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{f.hint}</p>
              </div>
            ))}
          </div>

          {/* چک‌لیست ثابت ثبت Bing Places — NAP یکسان با Google Business Profile */}
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ListChecks className="h-4 w-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
              چک‌لیست ثبت Bing Places (با همان NAP پروفایل گوگل)
            </p>
            <ol className="mt-3 list-inside list-decimal space-y-1.5 text-xs leading-6 text-muted-foreground">
              <li>در bing.com/places حساب بسازید و کسب‌وکار را با همان نام رسمی پروفایل گوگل ثبت کنید.</li>
              <li>نشانی را حرف‌به‌حرف همان نشانی Google Business Profile وارد کنید (ناهماهنگی NAP = سیگنال منفی).</li>
              <li>شمارهٔ تماس را دقیقاً همان شمارهٔ گوگل‌مپ (۰۷۱-۳۲۶۲۲۴۹۳) وارد کنید.</li>
              <li>دسته‌بندی فعالیت و ساعات کاری را با پروفایل گوگل یکسان تنظیم و تأیید مالکیت را کامل کنید.</li>
              <li>لینک عمومی پروفایل بینگ را کپی و در همین بخش وارد کنید تا به sameAs سازمان تزریق شود.</li>
            </ol>
          </div>

          {/* پیش‌نمایش sameAs */}
          {settings.sameAsUrls && settings.sameAsUrls.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">sameAs نهایی اسکیما (زنده)</p>
              <ul dir="ltr" className="max-h-40 space-y-1 overflow-y-auto rounded-xl bg-muted/60 p-3 text-[11px] leading-5">
                {settings.sameAsUrls.map((u) => (
                  <li key={u} className="truncate text-muted-foreground">
                    <CheckCircle2 className="ml-1 inline h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    {u}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            نکته: لینک‌های خالی نادیده گرفته می‌شوند — هر لینک فقط وقتی معتبر (http/https) باشد به اسکیما اضافه می‌شود؛
            پروفایل ساختگی طبق سیاست sameAs سیگنال منفی دارد.
          </p>
        </CardContent>
      </Card>

      {/* راهنما */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>چطور بیشترین شانس نمایش ستاره را داشته باشیم؟</AlertTitle>
        <AlertDescription>
          <ul className="list-inside list-disc space-y-1.5 text-xs leading-6">
            <li>
              عدد امتیاز و تعداد نظر را <strong>دقیقاً همان پروفایل گوگل</strong> وارد کنید — ناسازگاری دادهٔ schema با پروفایل، اعتبار را کم می‌کند.
            </li>
            <li>
              ستاره معمولاً بین <strong>۱ تا ۴ هفته</strong> پس از خزش مجدد در نتایج ظاهر می‌شود (صفحات پرخزش سریع‌تر).
            </li>
            <li>
              نظرات را در گوگل‌مپ <strong>دوره‌به‌دوره بیشتر</strong> کنید (از مشتریان راضی با لینک ثبت نظر بخواهید) — تعداد بیشتر = اعتماد بیشتر = CTR بالاتر.
            </li>
            <li>
              بعد از ذخیره، از بخش «سایت‌مپ و فایل‌های سئو» دکمهٔ <strong>ایندکس فوری</strong> را بزنید تا گوگل زودتر صفحه‌ها را با ستارهٔ جدید ببیند.
            </li>
            <li>
              نمایش ستاره برای نرم‌افزار (SoftwareApplication) رایج است؛ گوگل برای مشاغل محلی امتیاز «خوداظهاری» را نشان نمی‌دهد — به همین دلیل امتیاز روی اسکیمای محصول نرم‌افزار تزریق می‌شود و در سایت هم بج قابل‌مشاهده قرار می‌گیرد.
            </li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}

export default GoogleMapsTab;
