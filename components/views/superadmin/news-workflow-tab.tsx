"use client";

import * as React from "react";
import {
  Zap,
  Plus,
  Loader2,
  RefreshCw,
  Save,
  Info,
  Clock,
  FileText,
  Copy,
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Linkedin,
  Check,
  ExternalLink,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toPersianDigits, toJalali } from "@/lib/persian";
import { useToast } from "@/hooks/use-toast";
import type {
  ActiveNewsRow,
  NewsSource,
  NewsSteps,
  NewsHistoryRow,
  NewsWorkflowConfig,
} from "@/lib/growth-tools-shared";
import { NEWS_SOURCE_LABELS } from "@/lib/growth-tools-shared";

// ============================================================
// NewsWorkflowTab (راند ۱۲ / Task 8) — «خبر ۴۸ ساعته» (ترفند #۱۳)
// ------------------------------------------------------------
// با هر ابلاغیه/تغییر قانونی مهم، هدف: مقالهٔ NEWS + پست GBP +
// پست LinkedIn در ۴۸ ساعت. برای هر خبر یک کارت با تایمر زندهٔ
// ۴۸ ساعته + چک‌لیست ۴ مرحله‌ای + قالب آمادهٔ مقاله/لینکدین.
// انتشار نهایی (هر ۴ تیک + تأیید) → تاریخچه.
// ذخیره: PUT /api/platform/growth-tools {tool:"news"} با debounce.
// ============================================================

const NEWS_DEADLINE_MS = 48 * 3_600_000;
const URGENT_THRESHOLD_MS = 12 * 3_600_000;

function faDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return toJalali(new Date(iso));
  } catch {
    return "—";
  }
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** قالب آمادهٔ مقالهٔ NEWS — ~۱۵۰ کلمه با جای‌نگهدار عدد/نرخ */
function buildNewsArticleDraft(title: string, sourceLabel: string): string {
  return `${title} — چه چیزی تغییر کرد و چه اثری بر حسابداری شما دارد؟

خبر کوتاه NEWS (${sourceLabel}): از [تاریخ اجرا] همهٔ کسب‌وکارهای ایرانی موظف به رعایت [موضوع اصلی] هستند. بدون حاشیه، سه نکتهٔ مهم:

۱. [بند اصلی + عدد/نرخ جدید]
۲. [مهلت اجرا و مشمولان — چه کسانی؟]
۳. [جریمه یا نرخ جدید — عدد دقیق]

چه باید بکنید؟
• تا [تاریخ X]: [اقدام فوری — مثلاً ثبت‌نام یا به‌روزرسانی سامانه]
• این هفته: [اقدام در نرم‌افزار — مثلاً تنظیم نرخ جدید روی فاکتورها]
• ماهانه: [کنترل نهایی — گزارش [نام گزارش] در هوش]

نرم‌افزار حسابداری ابری «هوش» محاسبهٔ همین نرخ‌ها، صورتحساب مادیان و گزارش‌های مالیاتی را از قبل پشتیبانی می‌کند. تست رایگان ۱۴ روزه: [لینک ثبت‌نام]

دستهٔ NEWS — به‌روزرسانی بعدی: [تاریخ]`;
}

/** قالب پست LinkedIn برای همان خبر */
function buildLinkedInPost(title: string, sourceLabel: string): string {
  return `📢 ${title}

${sourceLabel} — و برای کسب‌وکارهای ایرانی یعنی چه؟

→ [نکتهٔ ۱ — مهم‌ترین تغییر]
→ [نکتهٔ ۲ — مهلت اجرا]

چک‌لیست کامل اقدام در وبلاگ «هوش»: [لینک مقاله]

#حسابداری #مالیات #کسب‌وکار_ایرانی #هوش`;
}

const STEP_LABELS: { key: keyof NewsSteps; label: string }[] = [
  { key: "blogDraft", label: "پیش‌نویس مقاله ساخته شد" },
  { key: "gbpPost", label: "پست GBP" },
  { key: "linkedinPost", label: "پست LinkedIn" },
  { key: "published", label: "منتشر شد" },
];

export function NewsWorkflowTab({ token }: { token: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [config, setConfig] = React.useState<NewsWorkflowConfig>({
    updatedAt: new Date(0).toISOString(),
    activeNews: [],
    history: [],
  });
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [savedFlash, setSavedFlash] = React.useState(false);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  // فرم افزودن خبر
  const [form, setForm] = React.useState<{ title: string; source: NewsSource }>({ title: "", source: "notice" });

  // دیالوگ قالب‌ها
  const [draftTarget, setDraftTarget] = React.useState<ActiveNewsRow | null>(null);
  const [draftText, setDraftText] = React.useState("");

  // ویرایش لینک تاریخچه
  const [urlEdits, setUrlEdits] = React.useState<Record<string, string>>({});

  // ساعت زنده برای تایمر ۴۸ ساعته
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const authHeaders = React.useMemo<Record<string, string>>(
    () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }),
    [token]
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/growth-tools?tool=news", { cache: "no-store", headers: authHeaders });
      const j = (await res.json().catch(() => null)) as {
        success?: boolean; error?: string;
        data?: { news?: NewsWorkflowConfig };
      } | null;
      if (j?.success && j.data?.news) {
        setConfig({
          updatedAt: j.data.news.updatedAt ?? new Date(0).toISOString(),
          activeNews: j.data.news.activeNews ?? [],
          history: j.data.news.history ?? [],
        });
        setUrlEdits({});
      } else {
        toast({ title: "خطا", description: j?.error || "دریافت گردش‌کار خبر ناموفق بود", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [authHeaders, toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  /* ============ ذخیرهٔ خودکار با debounce ============ */

  const timerRef = React.useRef<number | null>(null);
  const configRef = React.useRef<NewsWorkflowConfig>(config);
  configRef.current = config;

  const persist = React.useCallback(
    async (cfg: NewsWorkflowConfig) => {
      setSaving(true);
      try {
        const res = await fetch("/api/platform/growth-tools", {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ tool: "news", data: cfg }),
        });
        const j = (await res.json().catch(() => null)) as { success?: boolean; message?: string; error?: string } | null;
        if (j?.success) {
          setDirty(false);
          setSavedFlash(true);
          window.setTimeout(() => setSavedFlash(false), 2500);
        } else {
          toast({ title: "خطا در ذخیره", description: j?.error || "عملیات ناموفق بود", variant: "destructive" });
        }
      } catch {
        toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
      } finally {
        setSaving(false);
      }
    },
    [authHeaders, toast]
  );

  const mutate = React.useCallback(
    (next: NewsWorkflowConfig) => {
      setConfig(next);
      setDirty(true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void persist(next), 900);
    },
    [persist]
  );

  React.useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  /* ============ عملیات ============ */

  const addNews = () => {
    const title = form.title.trim();
    if (!title) {
      toast({ title: "عنوان خبر الزامی است", variant: "destructive" });
      return;
    }
    const startedAt = new Date().toISOString();
    const row: ActiveNewsRow = {
      id: newId("news"),
      title,
      source: form.source,
      startedAt,
      deadline: new Date(Date.parse(startedAt) + NEWS_DEADLINE_MS).toISOString(),
      steps: { blogDraft: false, gbpPost: false, linkedinPost: false, published: false },
    };
    mutate({ ...config, activeNews: [...config.activeNews, row] });
    setForm({ title: "", source: "notice" });
    toast({
      title: "تایمر ۴۸ ساعته شروع شد",
      description: "۴ مرحله: پیش‌نویس NEWS → پست GBP → پست LinkedIn → انتشار",
    });
  };

  const toggleStep = (id: string, key: keyof NewsSteps, checked: boolean) => {
    mutate({
      ...config,
      activeNews: config.activeNews.map((n) =>
        n.id === id ? { ...n, steps: { ...n.steps, [key]: checked } } : n
      ),
    });
  };

  const openDraft = (n: ActiveNewsRow) => {
    setDraftTarget(n);
    setDraftText(buildNewsArticleDraft(n.title, NEWS_SOURCE_LABELS[n.source]));
  };

  const removeActive = (id: string) => {
    mutate({ ...config, activeNews: config.activeNews.filter((n) => n.id !== id) });
    toast({ title: "خبر فعال حذف شد" });
  };

  const allDone = (n: ActiveNewsRow) =>
    n.steps.blogDraft && n.steps.gbpPost && n.steps.linkedinPost && n.steps.published;

  /** تأیید انتشار — خبر از فعال‌ها به تاریخچه منتقل می‌شود */
  const confirmPublish = (n: ActiveNewsRow) => {
    if (!allDone(n)) {
      toast({ title: "همهٔ ۴ مرحله باید تیک بخورند", variant: "destructive" });
      return;
    }
    const hist: NewsHistoryRow = {
      id: newId("nhist"),
      title: n.title,
      publishedAt: new Date().toISOString(),
      url: "",
    };
    mutate({
      ...config,
      activeNews: config.activeNews.filter((a) => a.id !== n.id),
      history: [hist, ...config.history],
    });
    toast({ title: "خبر منتشر و در تاریخچه ثبت شد", description: n.title });
  };

  const saveHistoryUrl = (id: string) => {
    const url = (urlEdits[id] ?? "").trim();
    mutate({
      ...config,
      history: config.history.map((h) => (h.id === id ? { ...h, url } : h)),
    });
    toast({ title: "لینک مقاله ذخیره شد" });
  };

  const removeHistory = (id: string) => {
    mutate({ ...config, history: config.history.filter((h) => h.id !== id) });
    toast({ title: "رکورد تاریخچه حذف شد" });
  };

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      toast({ title: "کپی ناموفق", description: "مرورگر اجازهٔ دسترسی به کلیپ‌بورد نداد", variant: "destructive" });
    }
  };

  /** برچسب آخرین ذخیره — updatedAt پیش‌فرض (epoch) یعنی «هنوز ذخیره نشده» */
  const lastSaved = React.useMemo(() => {
    const t = Date.parse(config.updatedAt);
    return Number.isFinite(t) && t > 946684800_000 ? faDate(config.updatedAt) : null;
  }, [config.updatedAt]);

  return (
    <div className="space-y-6">
      {/* هدر */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Zap className="h-5 w-5 text-primary" />
            خبر ۴۸ ساعته
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            با هر ابلاغیه یا تغییر قانونی مهم: مقالهٔ NEWS + پست GBP + پست LinkedIn در ۴۸ ساعت
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading || saving} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            بازخوانی
          </Button>
          <Button
            variant="outline"
            onClick={() => void persist(configRef.current)}
            disabled={saving || loading || !dirty}
            className="gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            ذخیره
          </Button>
        </div>
      </div>

      {/* وضعیت ذخیره */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] min-h-6">
        {saving ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            در حال ذخیره…
          </span>
        ) : savedFlash ? (
          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            ذخیره شد
          </span>
        ) : dirty ? (
          <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            تغییرات ذخیره نشده — به‌زودی خودکار ذخیره می‌شود
          </span>
        ) : lastSaved ? (
          <span className="text-muted-foreground">آخرین ذخیره: {lastSaved}</span>
        ) : (
          <span className="text-muted-foreground">هنوز ذخیره نشده است</span>
        )}
        <Badge variant="outline" className="text-[10px]">
          {toPersianDigits(config.activeNews.length)} خبر فعال
        </Badge>
      </div>

      {/* توضیح گردش‌کار */}
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardContent className="p-4 text-xs leading-6 space-y-1">
          <p className="flex items-center gap-1.5 font-bold text-foreground">
            <Info className="h-4 w-4 text-primary" />
            گردش‌کار خبر ۴۸ ساعته (ترفند #۱۳)
          </p>
          <p>
            با هر ابلاغیه/تغییر قانونی مهم، هدف: <strong>مقالهٔ NEWS + پست GBP + پست LinkedIn در ۴۸ ساعت</strong>.
            ترتیب: (۱) پیش‌نویس سریع NEWS با قالب آماده (۲) پست GBP از تب «پست گوگل بیزینس» (۳) پست LinkedIn با
            متن آماده (۴) انتشار و ثبت تاریخ. سرعت انتشار در اخبار مالیاتی، رتبهٔ اولین قانونی بودن را می‌آورد.
          </p>
        </CardContent>
      </Card>

      {/* افزودن خبر */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Plus className="h-4 w-4 text-primary" />
            خبر جدید را ثبت کنید
          </CardTitle>
          <CardDescription className="text-xs">
            با ثبت، تایمر ۴۸ ساعته شروع می‌شود و چک‌لیست ۴ مرحله‌ای فعال می‌شود
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[11px] text-muted-foreground">عنوان خبر *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="مثلاً: ابلاغیهٔ جدید سازمان امور مالیاتی دربارهٔ صورتحساب مادیان"
                maxLength={200}
                aria-label="عنوان خبر"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">منبع</Label>
              <div className="flex gap-2">
                <Select
                  value={form.source}
                  onValueChange={(v) => setForm((f) => ({ ...f, source: v as NewsSource }))}
                >
                  <SelectTrigger className="h-9 text-xs flex-1" aria-label="منبع خبر">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="notice">ابلاغیهٔ سازمان امور مالیاتی</SelectItem>
                    <SelectItem value="rate">تغییر نرخ</SelectItem>
                    <SelectItem value="ban">ممنوعیت</SelectItem>
                    <SelectItem value="other">سایر</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={addNews} disabled={loading || saving} className="shrink-0 gap-1.5">
                  <Zap className="h-4 w-4" />
                  شروع تایمر
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* اخبار فعال */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-primary" />
            اخبار فعال — تایمر ۴۸ ساعته
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : config.activeNews.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Zap className="h-10 w-10 mx-auto text-muted-foreground/30" />
              <p className="text-sm font-semibold">هیچ خبر فعالی در جریان نیست</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                ابلاغیه یا تغییر نرخ جدید را از فرم بالا ثبت کنید — تایمر ۴۸ ساعته و چک‌لیست انتشار همین‌جا
                فعال می‌شود.
              </p>
            </div>
          ) : (
            config.activeNews.map((n) => {
              const remaining = Date.parse(n.deadline) - now;
              const urgent = !n.steps.published && remaining < URGENT_THRESHOLD_MS;
              const overdue = !n.steps.published && remaining <= 0;
              return (
                <div
                  key={n.id}
                  className={`rounded-xl border p-4 space-y-3 ${
                    n.steps.published
                      ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
                      : overdue || urgent
                      ? "border-rose-300 bg-rose-50/40 dark:border-rose-800 dark:bg-rose-950/20"
                      : ""
                  }`}
                >
                  {/* عنوان + تایمر */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-bold leading-6">{n.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {NEWS_SOURCE_LABELS[n.source]} · شروع: {faDate(n.startedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {n.steps.published ? (
                        <Badge className="text-[10px] h-6 gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          منتشر شد — تأیید کنید
                        </Badge>
                      ) : overdue ? (
                        <Badge className="text-[10px] h-6 bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                          مهلت ۴۸ ساعته گذشته
                        </Badge>
                      ) : (
                        <Badge
                          className={`text-[10px] h-6 tnum ${
                            urgent
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                              : "bg-secondary text-secondary-foreground"
                          }`}
                        >
                          {urgent && "فوری — "}
                          {toPersianDigits(Math.max(0, Math.ceil(remaining / 3_600_000)))} ساعت مانده
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => removeActive(n.id)}
                        aria-label="حذف خبر فعال"
                        title="حذف خبر فعال"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* چک‌لیست ۴ مرحله‌ای */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {STEP_LABELS.map((s) => (
                      <label
                        key={s.key}
                        className="flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer hover:bg-accent/50 transition-colors min-h-11"
                      >
                        <Checkbox
                          checked={n.steps[s.key]}
                          onCheckedChange={(c) => toggleStep(n.id, s.key, c === true)}
                          aria-label={s.label}
                        />
                        <span className="text-xs">{s.label}</span>
                        {n.steps[s.key] && <Check className="h-3.5 w-3.5 text-emerald-600 mr-auto" />}
                      </label>
                    ))}
                  </div>

                  {/* اقدام‌ها */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" onClick={() => openDraft(n)}>
                      <FileText className="h-4 w-4" />
                      ساخت پیش‌نویس NEWS
                    </Button>
                    <Button
                      size="sm"
                      className="h-9 gap-1.5 text-xs"
                      disabled={!allDone(n) || saving}
                      onClick={() => confirmPublish(n)}
                    >
                      <Send className="h-4 w-4" />
                      تأیید انتشار → تاریخچه
                    </Button>
                    {!allDone(n) && (
                      <p className="text-[10px] text-muted-foreground self-center">
                        «تأیید انتشار» بعد از تیک‌خوردن هر ۴ مرحله فعال می‌شود
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* تاریخچه */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            تاریخچهٔ اخبار منتشرشده
          </CardTitle>
          <CardDescription className="text-xs">
            لینک مقالهٔ منتشرشده را وارد کنید — سابقهٔ سرعت انتشار شما
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : config.history.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <CheckCircle2 className="h-9 w-9 mx-auto text-muted-foreground/30" />
              <p className="text-sm font-semibold">هنوز خبری منتشر نشده است</p>
              <p className="text-xs text-muted-foreground">
                اولین خبر ۴۸ ساعته را کامل کنید — «تأیید انتشار» آن را اینجا ثبت می‌کند
              </p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {config.history.map((h) => {
                const urlValue = urlEdits[h.id] ?? h.url;
                return (
                  <div key={h.id} className="p-3 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-xs font-bold leading-5 min-w-0 flex-1">{h.title}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className="text-[9px] h-5 tnum">
                          {faDate(h.publishedAt)}
                        </Badge>
                        {h.url && (
                          <a
                            href={h.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                          >
                            مشاهده
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => removeHistory(h.id)}
                          aria-label="حذف رکورد تاریخچه"
                          title="حذف از تاریخچه"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        dir="ltr"
                        value={urlValue}
                        onChange={(e) => setUrlEdits((prev) => ({ ...prev, [h.id]: e.target.value }))}
                        placeholder="https://hoosh.nobatime.ir/blog/..."
                        className="font-mono text-[11px] h-8"
                        aria-label="لینک مقالهٔ منتشرشده"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0 gap-1.5 text-[11px]"
                        onClick={() => saveHistoryUrl(h.id)}
                        disabled={saving}
                      >
                        <Save className="h-3.5 w-3.5" />
                        ذخیرهٔ لینک
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* دیالوگ قالب آمادهٔ مقاله + LinkedIn */}
      <Dialog open={!!draftTarget} onOpenChange={(o) => !o && setDraftTarget(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">قالب آمادهٔ NEWS — {draftTarget?.title}</DialogTitle>
            <DialogDescription className="text-xs">
              اعداد داخل [کروشه] را با اعداد واقعی خبر پر کنید؛ متن را کپی کنید و در ویرایشگر بلاگ جای‌گذاری
              کنید و دستهٔ NEWS بگذارید.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  متن مقالهٔ NEWS (قابل ویرایش)
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-[11px]"
                  onClick={() => void copyText(draftText, "article")}
                >
                  {copiedKey === "article" ? (
                    <ClipboardCheck className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copiedKey === "article" ? "کپی شد" : "کپی مقاله"}
                </Button>
              </div>
              <Textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                className="min-h-[260px] text-[11px] leading-6"
                aria-label="متن پیش‌نویس مقاله"
              />
              <p className="text-[10px] text-muted-foreground">
                در ویرایشگر بلاگ paste کنید و دستهٔ NEWS بگذارید — سپس تیک «پیش‌نویس مقاله ساخته شد» را بزنید.
              </p>
            </div>

            {draftTarget && (
              <div className="space-y-1.5 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Linkedin className="h-3.5 w-3.5 text-primary" />
                    متن پست LinkedIn
                  </Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-[11px]"
                    onClick={() =>
                      void copyText(
                        buildLinkedInPost(draftTarget.title, NEWS_SOURCE_LABELS[draftTarget.source]),
                        "linkedin"
                      )
                    }
                  >
                    {copiedKey === "linkedin" ? (
                      <ClipboardCheck className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copiedKey === "linkedin" ? "کپی شد" : "کپی پست LinkedIn"}
                  </Button>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-[11px] leading-6 whitespace-pre-line max-h-40 overflow-y-auto">
                  {buildLinkedInPost(draftTarget.title, NEWS_SOURCE_LABELS[draftTarget.source])}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  پست GBP را از تب «پست گوگل بیزینس» با همین عنوان خبر بسازید.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default NewsWorkflowTab;
