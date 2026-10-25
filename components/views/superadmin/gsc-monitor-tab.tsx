"use client";

import * as React from "react";
import {
  LineChart,
  Plus,
  Trash2,
  Copy,
  ClipboardCheck,
  Clock,
  Info,
  Loader2,
  RefreshCw,
  Save,
  FlaskConical,
  Search,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { toPersianDigits, toJalali, toLocalISODate } from "@/lib/persian";
import { useToast } from "@/hooks/use-toast";
import type { GscWatchRow, GscWatchStatus, GscWatchlistConfig } from "@/lib/growth-tools-shared";
import { GSC_CYCLE_DAYS } from "@/lib/growth-tools-shared";

// ============================================================
// GscMonitorTab (راند ۱۲ / Task 8) — «پایش GSC و CTR» (ترفند #۵)
// ------------------------------------------------------------
// روش هفتگی: در Search Console → Performance صفحات ضعیف (CTR<۲٪،
// موقعیت ۸-۲۵) را پیدا کنید، تایتل عدددار بنویسید (سال/قیمت/شهر)
// و در چرخهٔ ۲۸روزهٔ تب A/B تست تایتل بسنجید. این جدول فهرست پیگیری
// همان صفحات است — با شمارندهٔ روز چرخه و وضعیت هر صفحه.
// ذخیره: PUT /api/platform/growth-tools {tool:"gsc"} با debounce.
// ============================================================

/** دستورِ فیلترِ آماده برای کپی — سه نسخهٔ عملیاتی */
const GSC_FILTER_RECIPES: { label: string; text: string }[] = [
  {
    label: "۱) صفحات ضعیف CTR (فیلتر اصلی هفتگی)",
    text: "در Search Console وارد بخش Performance شوید؛ در تب Pages دو فیلتر بگذارید: CTR کمتر از ۲٪ و Position بین ۸ تا ۲۵؛ بازهٔ زمانی را «۳ ماه اخیر» بگذارید. صفحات با نمایشِ بالا و CTR کم، اولویت بازنویسی تایتل‌اند.",
  },
  {
    label: "۲) صفحات رتبهٔ ۸ تا ۱۵ (نزدیک صفحهٔ اول)",
    text: "در Performance → Pages فیلتر Position بین ۸ و ۱۵ بگذارید و بر اساس Impression (نمایش) نزولی مرتب کنید؛ این صفحات با یک تایتل عدددار بهتر می‌توانند به صفحهٔ اول نتایج برسند.",
  },
  {
    label: "۳) کلمات برندنشان‌دار (هوش / hoosh)",
    text: "در تب Queries فیلتر Query شامل «هوش» یا «hoosh» بگذارید؛ CTR کلمات برند باید بالای ۳۰٪ باشد. اگر کمتر است، عنوان و توضیح متای صفحهٔ اصلی را با نام برند تقویت کنید.",
  },
];

function faDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return toJalali(new Date(iso));
  } catch {
    return "—";
  }
}

/** روزهای سپری‌شده از شروع چرخه */
function daysInCycle(cycleStart: string): number {
  const t = Date.parse(cycleStart);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function GscMonitorTab({ token }: { token: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [rows, setRows] = React.useState<GscWatchRow[]>([]);
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [savedFlash, setSavedFlash] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  // فرم افزودن ردیف
  const [form, setForm] = React.useState({
    path: "",
    currentTitle: "",
    ctr: "",
    position: "",
    newTitleIdea: "",
    cycleStart: toLocalISODate(new Date()),
  });

  const authHeaders = React.useMemo<Record<string, string>>(
    () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }),
    [token]
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/growth-tools?tool=gsc", { cache: "no-store", headers: authHeaders });
      const j = (await res.json().catch(() => null)) as {
        success?: boolean; error?: string;
        data?: { gsc?: GscWatchlistConfig };
      } | null;
      if (j?.success && j.data?.gsc) {
        setRows(j.data.gsc.rows ?? []);
        setUpdatedAt(j.data.gsc.updatedAt ?? null);
      } else {
        toast({ title: "خطا", description: j?.error || "دریافت فهرست پایش ناموفق بود", variant: "destructive" });
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
  const rowsRef = React.useRef<GscWatchRow[]>(rows);
  rowsRef.current = rows;

  const persist = React.useCallback(
    async (rowsToSave: GscWatchRow[]) => {
      setSaving(true);
      try {
        const res = await fetch("/api/platform/growth-tools", {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({
            tool: "gsc",
            data: { updatedAt: new Date().toISOString(), rows: rowsToSave },
          }),
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

  /** تغییرات محلی + زمان‌بندی ذخیرهٔ خودکار (۹۰۰ms) */
  const mutate = React.useCallback(
    (next: GscWatchRow[]) => {
      setRows(next);
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

  /* ============ عملیات ردیف‌ها ============ */

  const addRow = () => {
    const path = form.path.trim();
    if (!path.startsWith("/")) {
      toast({ title: "مسیر نامعتبر", description: "مسیر صفحه باید با / شروع شود — مثلاً /pricing", variant: "destructive" });
      return;
    }
    const row: GscWatchRow = {
      id: newId("gsc"),
      path,
      currentTitle: form.currentTitle.trim(),
      ctr: Math.max(0, Math.min(100, Number(form.ctr) || 0)),
      position: Math.max(0, Number(form.position) || 0),
      newTitleIdea: form.newTitleIdea.trim(),
      cycleStart: form.cycleStart,
      status: "pending",
    };
    mutate([...rows, row]);
    setForm({
      path: "",
      currentTitle: "",
      ctr: "",
      position: "",
      newTitleIdea: "",
      cycleStart: toLocalISODate(new Date()),
    });
    toast({ title: "صفحه به پایش اضافه شد", description: "بعد از بازنویسی تایتل، وضعیت را روی «در چرخهٔ A/B» بگذارید" });
  };

  const setStatus = (id: string, status: GscWatchStatus) => {
    mutate(rows.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  const removeRow = (id: string) => {
    mutate(rows.filter((r) => r.id !== id));
    toast({ title: "ردیف حذف شد" });
  };

  const copyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast({ title: "کپی ناموفق", description: "مرورگر اجازهٔ دسترسی به کلیپ‌بورد نداد", variant: "destructive" });
    }
  };

  const filtered = rows.filter((r) => {
    const q = search.trim();
    if (!q) return true;
    return (
      r.path.includes(q) ||
      r.currentTitle.includes(q) ||
      r.newTitleIdea.includes(q)
    );
  });

  /** برچسب آخرین ذخیره — updatedAt پیش‌فرض (epoch) یعنی «هنوز ذخیره نشده» */
  const lastSaved = React.useMemo(() => {
    if (!updatedAt) return null;
    const t = Date.parse(updatedAt);
    if (!Number.isFinite(t) || t < 946684800_000) return null;
    return faDate(updatedAt);
  }, [updatedAt]);

  return (
    <div className="space-y-6">
      {/* هدر */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <LineChart className="h-5 w-5 text-primary" />
            پایش GSC و CTR
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            فهرست پیگیری هفتگی صفحات ضعیف Search Console — چرخهٔ ۲۸روزهٔ تایتل‌ها
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading || saving} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            بازخوانی
          </Button>
          <Button
            variant="outline"
            onClick={() => void persist(rowsRef.current)}
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
        ) : null}
        <Badge variant="outline" className="text-[10px]">
          {toPersianDigits(rows.length)} صفحه در پایش
        </Badge>
      </div>

      {/* توضیح روش */}
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardContent className="p-4 text-xs leading-6 space-y-1">
          <p className="flex items-center gap-1.5 font-bold text-foreground">
            <Info className="h-4 w-4 text-primary" />
            روش هفتگی بهبود CTR (ترفند #۵)
          </p>
          <p>
            در Search Console → Performance، صفحات با <strong>CTR کمتر از ۲٪</strong> و{" "}
            <strong>موقعیت ۸ تا ۲۵</strong> را پیدا کنید؛ برای هر صفحه یک{" "}
            <strong>تایتل عدددار</strong> بنویسید (سال، قیمت یا شهر — مثلاً «تعرفهٔ حسابداری ۱۴۰۵») و نتیجه را در{" "}
            <strong>چرخهٔ ۲۸روزه</strong> بسنجید. هر ردیف این جدول یکی از همان صفحات ضعیف است؛ بعد از ۲۸ روز،
            CTR جدید را در یادداشت ثبت و وضعیت را «جمع‌آوری شد» کنید.
          </p>
          <p className="text-muted-foreground">
            چرخهٔ ارزیابی و اعلام تایتل برنده در تب «A/B تست تایتل» (گروه محتوا) انجام می‌شود — ایدهٔ تایتل
            همین‌جا کپی کنید و آنجا وارد کنید.
          </p>
        </CardContent>
      </Card>

      {/* فیلترهای آمادهٔ کپی */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Search className="h-4 w-4 text-primary" />
            فیلترهای آمادهٔ کپی
          </CardTitle>
          <CardDescription className="text-xs">
            دستورِ فیلتر را کپی کنید و در Search Console به‌صورت دستی اعمال کنید
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {GSC_FILTER_RECIPES.map((r) => (
            <div key={r.label} className="flex items-start gap-2 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold">{r.label}</p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{r.text}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 gap-1.5 text-[11px]"
                onClick={() => void copyText(r.text, r.label)}
                aria-label={`کپی ${r.label}`}
              >
                {copiedId === r.label ? (
                  <ClipboardCheck className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copiedId === r.label ? "کپی شد" : "کپی"}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* افزودن صفحهٔ ضعیف */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Plus className="h-4 w-4 text-primary" />
            افزودن صفحه به پایش
          </CardTitle>
          <CardDescription className="text-xs">
            از GSC صفحهٔ ضعیف را پیدا کردید؟ اینجا ثبتش کنید تا چرخهٔ ۲۸روزه شمارش شود
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">مسیر صفحه</Label>
              <Input
                dir="ltr"
                value={form.path}
                onChange={(e) => setForm((f) => ({ ...f, path: e.target.value }))}
                placeholder="/pricing"
                className="font-mono text-xs"
                aria-label="مسیر صفحه"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">تایتل فعلی</Label>
              <Input
                value={form.currentTitle}
                onChange={(e) => setForm((f) => ({ ...f, currentTitle: e.target.value }))}
                placeholder="نرم‌افزار حسابداری ابری"
                maxLength={200}
                aria-label="تایتل فعلی"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">CTR فعلی (٪)</Label>
              <Input
                inputMode="decimal"
                value={form.ctr}
                onChange={(e) => setForm((f) => ({ ...f, ctr: e.target.value.replace(/[^0-9.]/g, "").slice(0, 5) }))}
                placeholder="1.4"
                className="tnum"
                aria-label="CTR فعلی به درصد"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">موقعیت فعلی</Label>
              <Input
                inputMode="decimal"
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value.replace(/[^0-9.]/g, "").slice(0, 5) }))}
                placeholder="12.5"
                className="tnum"
                aria-label="موقعیت فعلی"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">ایدهٔ تایتل جدید (عدددار)</Label>
              <Input
                value={form.newTitleIdea}
                onChange={(e) => setForm((f) => ({ ...f, newTitleIdea: e.target.value }))}
                placeholder="تعرفهٔ نرم‌افزار حسابداری ۱۴۰۵ — قیمت ماهانه"
                maxLength={200}
                aria-label="ایدهٔ تایتل جدید"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">تاریخ شروع چرخه</Label>
              <JalaliDatePicker
                id="gsc-cycle-start"
                value={form.cycleStart}
                onChange={(v) => setForm((f) => ({ ...f, cycleStart: v }))}
              />
            </div>
          </div>
          <Button onClick={addRow} disabled={loading || saving} className="gap-2">
            <Plus className="h-4 w-4" />
            افزودن به پایش
          </Button>
        </CardContent>
      </Card>

      {/* جدول پایش */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-primary" />
                صفحات تحت پایش
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                چرخهٔ ارزیابی: {toPersianDigits(GSC_CYCLE_DAYS)} روز از تاریخ شروع — بعد از آن نتیجه را ثبت کنید
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="جستجو در مسیر/تایتل…"
                className="h-8 text-xs pr-8"
                aria-label="جستجوی صفحات پایش"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <LineChart className="h-10 w-10 mx-auto text-muted-foreground/30" />
              <p className="text-sm font-semibold">
                {rows.length === 0 ? "هنوز صفحه‌ای در پایش نیست" : "نتیجه‌ای برای جستجو پیدا نشد"}
              </p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                فیلترهای آمادهٔ بالا را در Search Console اعمال کنید و صفحات ضعیف را از فرم «افزودن صفحه به پایش»
                ثبت کنید تا چرخهٔ ۲۸روزه‌شان شمارش شود.
              </p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] h-9">مسیر صفحه</TableHead>
                    <TableHead className="text-[11px] h-9">تایتل فعلی</TableHead>
                    <TableHead className="text-[11px] h-9">CTR</TableHead>
                    <TableHead className="text-[11px] h-9">موقعیت</TableHead>
                    <TableHead className="text-[11px] h-9">ایدهٔ تایتل جدید</TableHead>
                    <TableHead className="text-[11px] h-9">چرخه</TableHead>
                    <TableHead className="text-[11px] h-9">وضعیت</TableHead>
                    <TableHead className="text-[11px] h-9 w-12">حذف</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const days = daysInCycle(r.cycleStart);
                    const cycleDone = days >= GSC_CYCLE_DAYS && r.status !== "done";
                    return (
                      <TableRow key={r.id} className={cycleDone ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}>
                        <TableCell className="font-mono text-[11px] max-w-40 truncate" dir="ltr" title={r.path}>
                          {r.path}
                        </TableCell>
                        <TableCell className="max-w-44">
                          <p className="truncate" title={r.currentTitle}>
                            {r.currentTitle || "—"}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px] h-5 tnum">
                            {toPersianDigits(r.ctr)}٪
                          </Badge>
                        </TableCell>
                        <TableCell className="tnum">{toPersianDigits(r.position)}</TableCell>
                        <TableCell className="max-w-52">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate" title={r.newTitleIdea} dir="auto">
                              {r.newTitleIdea || "—"}
                            </p>
                            {r.newTitleIdea && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                onClick={() => void copyText(r.newTitleIdea, `idea-${r.id}`)}
                                aria-label="کپی ایدهٔ تایتل جدید"
                                title="کپی ایدهٔ تایتل برای تب A/B تست تایتل"
                              >
                                {copiedId === `idea-${r.id}` ? (
                                  <ClipboardCheck className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <p className="text-[10px] text-muted-foreground tnum">{faDate(r.cycleStart)}</p>
                            {cycleDone ? (
                              <Badge className="text-[9px] h-5 gap-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                <FlaskConical className="h-3 w-3" />
                                چرخه تمام شد — نتیجه را ثبت کنید
                              </Badge>
                            ) : (
                              <p className="text-[10px] tnum" title={`شروع: ${faDate(r.cycleStart)}`}>
                                روز {toPersianDigits(days)} از {toPersianDigits(GSC_CYCLE_DAYS)}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select value={r.status} onValueChange={(v) => setStatus(r.id, v as GscWatchStatus)}>
                            <SelectTrigger className="h-7 w-32 text-[11px]" aria-label="وضعیت صفحه">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">در انتظار</SelectItem>
                              <SelectItem value="running">در چرخهٔ A/B</SelectItem>
                              <SelectItem value="done">جمع‌آوری شد</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => removeRow(r.id)}
                            aria-label="حذف ردیف پایش"
                            title="حذف از فهرست پایش"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default GscMonitorTab;
