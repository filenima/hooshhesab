"use client";

import * as React from "react";
import {
  Send,
  ExternalLink,
  Copy,
  ClipboardCheck,
  Trash2,
  Plus,
  Loader2,
  RefreshCw,
  Info,
  MoreHorizontal,
  StickyNote,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Target,
  Newspaper,
  Save,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toPersianDigits, toJalali, toLocalISODate } from "@/lib/persian";
import { useToast } from "@/hooks/use-toast";
import type {
  PrMediaRow,
  PrMediaStatus,
  PrActivityRow,
  PrOutreachConfig,
} from "@/lib/growth-tools-shared";
import { PR_EMAIL_TEMPLATES, PR_SEASON_REFERRAL_GOAL } from "@/lib/growth-tools-shared";

// ============================================================
// PrOutreachTab (راند ۱۲ / Task 8) — «کیت Digital PR و رسانه» (ترفند #۱)
// ------------------------------------------------------------
// برنامهٔ فصلی: ماهی ۲ رسانهٔ اقتصادی را با ایمیل شخصی‌سازی‌شده +
// یک یافتهٔ برجستهٔ پژوهش «نبض مالی» (فرم /press) مخاطب کنید؛
// هدف: ۳ تا ۵ ارجاع در هر فصل. این تب: قالب‌های ایمیل آماده +
// فهرست رسانه‌ها + لاگ فعالیت + نوار پیشرفت ارجاع فصل.
// ذخیره: PUT /api/platform/growth-tools {tool:"pr"} با debounce.
// ============================================================

const PR_STATUS_LABELS: Record<PrMediaStatus, string> = {
  new: "جدید",
  contacted: "تماس‌گرفته‌شده",
  replied: "پاسخ‌داده",
  published: "منتشرشده",
  dead: "منتفی",
};

const PR_STATUS_CLS: Record<PrMediaStatus, string> = {
  new: "bg-secondary text-secondary-foreground",
  contacted: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  replied: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  dead: "bg-muted text-muted-foreground",
};

function faDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return toJalali(new Date(iso));
  } catch {
    return "—";
  }
}

function faDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** لینک mailto آماده — موضوع و متن قالب به‌صورت URL-encoded */
function buildMailto(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function PrOutreachTab({ token }: { token: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [config, setConfig] = React.useState<PrOutreachConfig>({
    updatedAt: new Date(0).toISOString(),
    media: [],
    activityLog: [],
  });
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [savedFlash, setSavedFlash] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  // فرم افزودن رسانه
  const [form, setForm] = React.useState({ name: "", email: "", beat: "", note: "" });

  // فرم ثبت رویداد فعالیت
  const [activityForm, setActivityForm] = React.useState({ mediaId: "", action: "", note: "" });

  // دیالوگ ویرایش رسانه (نام/ایمیل/حوزه/یادداشت)
  const [editTarget, setEditTarget] = React.useState<PrMediaRow | null>(null);
  const [editDraft, setEditDraft] = React.useState({ name: "", email: "", beat: "", note: "" });

  const authHeaders = React.useMemo<Record<string, string>>(
    () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }),
    [token]
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/growth-tools?tool=pr", { cache: "no-store", headers: authHeaders });
      const j = (await res.json().catch(() => null)) as {
        success?: boolean; error?: string;
        data?: { pr?: PrOutreachConfig };
      } | null;
      if (j?.success && j.data?.pr) {
        setConfig({
          updatedAt: j.data.pr.updatedAt ?? new Date(0).toISOString(),
          media: j.data.pr.media ?? [],
          activityLog: j.data.pr.activityLog ?? [],
        });
      } else {
        toast({ title: "خطا", description: j?.error || "دریافت کیت PR ناموفق بود", variant: "destructive" });
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
  const configRef = React.useRef<PrOutreachConfig>(config);
  configRef.current = config;

  const persist = React.useCallback(
    async (cfg: PrOutreachConfig) => {
      setSaving(true);
      try {
        const res = await fetch("/api/platform/growth-tools", {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ tool: "pr", data: cfg }),
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
    (next: PrOutreachConfig) => {
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

  /** رویداد جدید در لاگ فعالیت — جدیدترین اول */
  const appendActivity = (
    cfg: PrOutreachConfig,
    mediaId: string,
    action: string,
    note: string
  ): PrOutreachConfig => {
    const entry: PrActivityRow = {
      id: newId("act"),
      date: new Date().toISOString(),
      mediaId,
      action,
      note,
    };
    return { ...cfg, activityLog: [entry, ...cfg.activityLog] };
  };

  /* ============ عملیات رسانه‌ها ============ */

  const addMedia = () => {
    const name = form.name.trim();
    if (!name) {
      toast({ title: "نام رسانه الزامی است", variant: "destructive" });
      return;
    }
    const row: PrMediaRow = {
      id: newId("media"),
      name,
      email: form.email.trim(),
      beat: form.beat.trim(),
      lastContact: toLocalISODate(new Date()),
      status: "new",
      note: form.note.trim(),
    };
    mutate({
      ...config,
      media: [...config.media, row],
    });
    setForm({ name: "", email: "", beat: "", note: "" });
    toast({ title: "رسانه اضافه شد", description: "با قالب ۱ ایمیل بفرستید و وضعیت را «تماس‌گرفته‌شده» کنید" });
  };

  const setStatus = (id: string, status: PrMediaStatus) => {
    const media = config.media.find((m) => m.id === id);
    const next: PrOutreachConfig = { ...config, media: config.media.map((m) => (m.id === id ? { ...m, status } : m)) };
    // تغییر وضعیت خودکار در لاگ فعالیت ثبت می‌شود — تردستِ این کیت
    const nextWithLog = appendActivity(
      next,
      id,
      "تغییر وضعیت",
      `${media?.name ?? id} → ${PR_STATUS_LABELS[status]}`
    );
    mutate(nextWithLog);
  };

  const touchToday = (id: string) => {
    const media = config.media.find((m) => m.id === id);
    if (!media) return;
    const next: PrOutreachConfig = {
      ...config,
      media: config.media.map((m) => (m.id === id ? { ...m, lastContact: toLocalISODate(new Date()) } : m)),
    };
    mutate(appendActivity(next, id, "تماس/پیگیری امروز", media.name));
    toast({ title: "تماس امروز ثبت شد", description: `${media.name} — تاریخ آخرین تماس به امروز رفت` });
  };

  const removeMedia = (id: string) => {
    mutate({ ...config, media: config.media.filter((m) => m.id !== id) });
    toast({ title: "رسانه حذف شد" });
  };

  const saveMediaEdit = () => {
    if (!editTarget) return;
    if (!editDraft.name.trim()) {
      toast({ title: "نام رسانه نمی‌تواند خالی باشد", variant: "destructive" });
      return;
    }
    mutate({
      ...config,
      media: config.media.map((m) =>
        m.id === editTarget.id
          ? {
              ...m,
              name: editDraft.name.trim(),
              email: editDraft.email.trim(),
              beat: editDraft.beat.trim(),
              note: editDraft.note.trim(),
            }
          : m
      ),
    });
    setEditTarget(null);
    toast({ title: "اطلاعات رسانه ذخیره شد" });
  };

  /* ============ لاگ فعالیت ============ */

  const addActivity = () => {
    if (!activityForm.mediaId) {
      toast({ title: "رسانه را انتخاب کنید", variant: "destructive" });
      return;
    }
    if (!activityForm.action.trim()) {
      toast({ title: "متن اقدام الزامی است", description: "مثلاً: ارسال ایمیل قالب ۱", variant: "destructive" });
      return;
    }
    mutate(appendActivity(config, activityForm.mediaId, activityForm.action.trim(), activityForm.note.trim()));
    setActivityForm({ mediaId: "", action: "", note: "" });
    toast({ title: "رویداد ثبت شد" });
  };

  const mediaName = (id: string) => config.media.find((m) => m.id === id)?.name ?? "—";

  /** برچسب آخرین ذخیره — updatedAt پیش‌فرض (epoch) یعنی «هنوز ذخیره نشده» */
  const lastSaved = React.useMemo(() => {
    const t = Date.parse(config.updatedAt);
    return Number.isFinite(t) && t > 946684800_000 ? faDate(config.updatedAt) : null;
  }, [config.updatedAt]);

  const copyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast({ title: "کپی ناموفق", description: "مرورگر اجازهٔ دسترسی به کلیپ‌بورد نداد", variant: "destructive" });
    }
  };

  /* ============ آمار ============ */

  const total = config.media.length;
  const contactedCount = config.media.filter((m) => m.status !== "new" && m.status !== "dead").length;
  const publishedCount = config.media.filter((m) => m.status === "published").length;
  const progressPct = Math.min(100, Math.round((publishedCount / PR_SEASON_REFERRAL_GOAL) * 100));

  const sortedActivity = React.useMemo(
    () => [...config.activityLog].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
    [config.activityLog]
  );

  return (
    <div className="space-y-6">
      {/* هدر */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Send className="h-5 w-5 text-primary" />
            کیت Digital PR و رسانه
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            قالب‌های ایمیل آماده + فهرست رسانه‌های اقتصادی + پیگیری ارجاع‌های فصل
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
      </div>

      {/* توضیح برنامهٔ فصلی */}
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardContent className="p-4 text-xs leading-6 space-y-1">
          <p className="flex items-center gap-1.5 font-bold text-foreground">
            <Info className="h-4 w-4 text-primary" />
            برنامهٔ فصلی Digital PR (ترفند #۱)
          </p>
          <p>
            <strong>ماهی ۲ رسانهٔ اقتصادی</strong> را با ایمیل شخصی‌سازی‌شده + یک{" "}
            <strong>یافتهٔ برجستهٔ پژوهش «نبض مالی»</strong> مخاطب کنید؛ هدف:{" "}
            <strong>۳ تا ۵ ارجاع رسانه‌ای در هر فصل</strong>. بستهٔ رسانه‌ای، گزارش‌های داده‌محور و فرم درخواست
            رسانه در اتاق خبر هوش آماده است.
          </p>
          <a
            href="/press"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            باز کردن اتاق خبر هوش (/press)
            <ExternalLink className="h-3 w-3" />
          </a>
        </CardContent>
      </Card>

      {/* آمار + نوار پیشرفت ارجاع فصل */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center bg-violet-100 dark:bg-violet-900/30">
              <Newspaper className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground leading-tight">کل رسانه‌ها</p>
              <p className="text-lg font-bold leading-tight tnum">{toPersianDigits(total)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center bg-amber-100 dark:bg-amber-900/30">
              <Mail className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground leading-tight">تماس‌گرفته‌شده</p>
              <p className="text-lg font-bold leading-tight tnum">{toPersianDigits(contactedCount)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/30">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground leading-tight">منتشرشده (ارجاع)</p>
              <p className="text-lg font-bold leading-tight tnum">{toPersianDigits(publishedCount)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Target className="h-3.5 w-3.5 text-primary" />
                هدف فصل: {toPersianDigits(PR_SEASON_REFERRAL_GOAL)} ارجاع
              </p>
              <span className="text-[11px] font-bold tnum">
                {toPersianDigits(publishedCount)}/{toPersianDigits(PR_SEASON_REFERRAL_GOAL)}
              </span>
            </div>
            <Progress value={progressPct} className="h-2" aria-label="پیشرفت ارجاع فصل" />
            <p className="text-[10px] text-muted-foreground">
              {publishedCount >= PR_SEASON_REFERRAL_GOAL
                ? "هدف فصل محقق شد — عالی!"
                : `${toPersianDigits(PR_SEASON_REFERRAL_GOAL - publishedCount)} ارجاع دیگر تا هدف فصل`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* قالب‌های ایمیل */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-primary" />
            قالب‌های ایمیل آماده (فارسی)
          </CardTitle>
          <CardDescription className="text-xs">
            جای‌نگهدارها ([نام سردبیر]، [نام رسانه]، [یافتهٔ برجسته]، [نام شما]) را قبل از ارسال پر کنید
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {PR_EMAIL_TEMPLATES.map((t) => (
            <div key={t.id} className="rounded-xl border p-3 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold">{t.title}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{t.description}</p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-[11px]"
                    onClick={() => void copyText(`موضوع: ${t.subject}\n\n${t.body}`, `tpl-${t.id}`)}
                  >
                    {copiedId === `tpl-${t.id}` ? (
                      <ClipboardCheck className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copiedId === `tpl-${t.id}` ? "کپی شد" : "کپی"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-[11px]"
                    onClick={() => {
                      window.location.href = buildMailto(t.subject, t.body);
                    }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    باز کردن در ایمیل
                  </Button>
                </div>
              </div>
              <p className="text-[11px]">
                <span className="text-muted-foreground">موضوع: </span>
                <strong>{t.subject}</strong>
              </p>
              <div className="rounded-lg bg-muted/50 p-3 text-[11px] leading-6 whitespace-pre-line max-h-56 overflow-y-auto">
                {t.body}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* فهرست رسانه‌ها */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Newspaper className="h-4 w-4 text-primary" />
            فهرست رسانه‌ها
          </CardTitle>
          <CardDescription className="text-xs">
            تغییر وضعیت هر رسانه خودکار در لاگ فعالیت ثبت می‌شود
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* فرم افزودن */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">نام رسانه *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="مثلاً: دنیای اقتصاد"
                maxLength={120}
                aria-label="نام رسانه"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">ایمیل سردبیر</Label>
              <Input
                dir="ltr"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="editor@media.ir"
                maxLength={200}
                aria-label="ایمیل سردبیر"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">حوزهٔ پوشش</Label>
              <Input
                value={form.beat}
                onChange={(e) => setForm((f) => ({ ...f, beat: e.target.value }))}
                placeholder="مالیات، فین‌تک، کسب‌وکار"
                maxLength={200}
                aria-label="حوزهٔ پوشش"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">یادداشت</Label>
              <div className="flex gap-2">
                <Input
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="مثلاً: به دادهٔ مالیاتی علاقه دارد"
                  maxLength={500}
                  aria-label="یادداشت"
                />
                <Button onClick={addMedia} disabled={loading || saving} className="shrink-0 gap-1.5" aria-label="افزودن رسانه">
                  <Plus className="h-4 w-4" />
                  افزودن
                </Button>
              </div>
            </div>
          </div>

          {/* جدول */}
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : config.media.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Newspaper className="h-10 w-10 mx-auto text-muted-foreground/30" />
              <p className="text-sm font-semibold">هنوز رسانه‌ای ثبت نشده است</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                فهرست رسانه‌های اقتصادی هدف را بسازید؛ ماهی ۲ رسانه با قالب‌های بالا مخاطب کنید و وضعیت
                پیگیری‌تان را همین‌جا به‌روز نگه دارید.
              </p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] h-9">رسانه</TableHead>
                    <TableHead className="text-[11px] h-9">ایمیل</TableHead>
                    <TableHead className="text-[11px] h-9">آخرین تماس</TableHead>
                    <TableHead className="text-[11px] h-9">وضعیت</TableHead>
                    <TableHead className="text-[11px] h-9 w-12">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {config.media.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="max-w-44">
                        <p className="font-bold truncate" title={m.name}>
                          {m.name}
                        </p>
                        {m.beat && <p className="text-[10px] text-muted-foreground truncate">{m.beat}</p>}
                        {m.note && (
                          <p className="text-[10px] text-muted-foreground/80 truncate" title={m.note}>
                            {m.note}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="max-w-44">
                        {m.email ? (
                          <p className="font-mono text-[10px] truncate" dir="ltr" title={m.email}>
                            {m.email}
                          </p>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="tnum text-[11px]">{faDate(m.lastContact)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge className={`text-[9px] h-5 w-fit ${PR_STATUS_CLS[m.status]}`}>
                            {PR_STATUS_LABELS[m.status]}
                          </Badge>
                          <Select value={m.status} onValueChange={(v) => setStatus(m.id, v as PrMediaStatus)}>
                            <SelectTrigger className="h-7 w-36 text-[11px]" aria-label={`تغییر وضعیت ${m.name}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="new">جدید</SelectItem>
                              <SelectItem value="contacted">تماس‌گرفته‌شده</SelectItem>
                              <SelectItem value="replied">پاسخ‌داده</SelectItem>
                              <SelectItem value="published">منتشرشده</SelectItem>
                              <SelectItem value="dead">منتفی</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="عملیات رسانه">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => touchToday(m.id)}>
                              <Phone className="h-3.5 w-3.5" />
                              ثبت تماس امروز
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setEditTarget(m);
                                setEditDraft({ name: m.name, email: m.email, beat: m.beat, note: m.note });
                              }}
                            >
                              <StickyNote className="h-3.5 w-3.5" />
                              ویرایش اطلاعات رسانه
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onClick={() => removeMedia(m.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                              حذف رسانه
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* لاگ فعالیت */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-primary" />
            لاگ فعالیت (فقط افزودنی)
          </CardTitle>
          <CardDescription className="text-xs">
            تاریخچهٔ تماس‌ها و پیگیری‌ها — جدیدترین اول
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* فرم ثبت رویداد */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">رسانه *</Label>
              <Select
                value={activityForm.mediaId || undefined}
                onValueChange={(v) => setActivityForm((f) => ({ ...f, mediaId: v }))}
              >
                <SelectTrigger className="h-9 text-xs" aria-label="انتخاب رسانه برای رویداد">
                  <SelectValue placeholder="انتخاب رسانه…" />
                </SelectTrigger>
                <SelectContent>
                  {config.media.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">اقدام *</Label>
              <Input
                value={activityForm.action}
                onChange={(e) => setActivityForm((f) => ({ ...f, action: e.target.value }))}
                placeholder="مثلاً: ارسال ایمیل قالب ۱"
                maxLength={200}
                aria-label="شرح اقدام"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">یادداشت</Label>
              <Input
                value={activityForm.note}
                onChange={(e) => setActivityForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="اختیاری"
                maxLength={500}
                aria-label="یادداشت رویداد"
              />
            </div>
            <div className="space-y-1.5 flex items-end">
              <Button
                onClick={addActivity}
                disabled={loading || saving || config.media.length === 0}
                className="w-full gap-1.5"
              >
                <Plus className="h-4 w-4" />
                ثبت رویداد
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : sortedActivity.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Phone className="h-9 w-9 mx-auto text-muted-foreground/30" />
              <p className="text-sm font-semibold">هنوز رویدادی ثبت نشده است</p>
              <p className="text-xs text-muted-foreground">
                هر ایمیل، تماس یا تغییر وضعیت را ثبت کنید — این لاگ حافظهٔ برنامهٔ فصلی شماست
              </p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {sortedActivity.map((a) => (
                <div key={a.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 p-3 text-xs">
                  <Badge variant="outline" className="shrink-0 text-[9px] h-5 tnum">
                    {faDateTime(a.date)}
                  </Badge>
                  <span className="font-bold shrink-0">{mediaName(a.mediaId)}</span>
                  <span className="min-w-0">{a.action}</span>
                  {a.note && (
                    <span className="min-w-0 text-muted-foreground basis-full sm:basis-auto" title={a.note}>
                      — {a.note}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* دیالوگ ویرایش رسانه */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ویرایش رسانه — {editTarget?.name}</DialogTitle>
            <DialogDescription>
              نام، ایمیل، حوزهٔ پوشش و یادداشت مخاطب این رسانه
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">نام رسانه *</Label>
              <Input
                value={editDraft.name}
                onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                maxLength={120}
                aria-label="نام رسانه"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ایمیل سردبیر</Label>
              <Input
                dir="ltr"
                value={editDraft.email}
                onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))}
                maxLength={200}
                aria-label="ایمیل سردبیر"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">حوزهٔ پوشش</Label>
              <Input
                value={editDraft.beat}
                onChange={(e) => setEditDraft((d) => ({ ...d, beat: e.target.value }))}
                maxLength={200}
                aria-label="حوزهٔ پوشش"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">یادداشت</Label>
              <Textarea
                value={editDraft.note}
                onChange={(e) => setEditDraft((d) => ({ ...d, note: e.target.value }))}
                className="min-h-[80px]"
                maxLength={500}
                aria-label="یادداشت"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              انصراف
            </Button>
            <Button onClick={saveMediaEdit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              ذخیرهٔ تغییرات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PrOutreachTab;
