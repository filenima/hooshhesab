"use client";

import * as React from "react";
import {
  FlaskConical,
  Save,
  Plus,
  Trash2,
  Wand2,
  Clock,
  Info,
  Loader2,
  RefreshCw,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toPersianDigits } from "@/lib/persian";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ============================================================
// AbTitlesTab (11-D) — «A/B تست تایتل» صفحات کلیدی
// ------------------------------------------------------------
// درخواست مالک: جدول ۱۰ صفحهٔ مهم با دو واریانت تایتل + ستون یادداشت؛
// یادآور چرخهٔ ۲۸ روزه. ذخیره از /api/platform/ab-titles در SystemSettings.
// روش کار: هر ۲۸ روز تایتل فعال را عوض کنید و CTR را در Search Console
// مقایسه کنید؛ واریانت برنده را «فعال» بگذارید و یادداشت نتیجه بگذارید.
// ============================================================

interface AbTitleRow {
  path: string;
  titleA: string;
  titleB?: string;
  activeTitle: "A" | "B";
  notes?: string;
}

interface SuggestionRow {
  path: string;
  currentTitle: string;
}

const MAX_TITLE_LEN = 70;

function faDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "full" }).format(new Date(iso));
  } catch {
    return "—";
  }
}

/** روزهای گذشته از آخرین به‌روزرسانی — برای یادآور ۲۸ روز */
function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export function AbTitlesTab({ token }: { token: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [rows, setRows] = React.useState<AbTitleRow[]>([]);
  const [suggestions, setSuggestions] = React.useState<SuggestionRow[]>([]);
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null);

  const authHeaders = React.useMemo<Record<string, string>>(
    () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }),
    [token]
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/ab-titles", { cache: "no-store", headers: authHeaders });
      const j = (await res.json().catch(() => null)) as {
        success?: boolean; error?: string;
        data?: { rows?: AbTitleRow[]; updatedAt?: string | null; suggestions?: SuggestionRow[] };
      } | null;
      if (j?.success && j.data) {
        setRows(j.data.rows ?? []);
        setUpdatedAt(j.data.updatedAt ?? null);
        setSuggestions(j.data.suggestions ?? []);
      } else {
        toast({ title: "خطا", description: j?.error || "دریافت پیکربندی ناموفق بود", variant: "destructive" });
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

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/platform/ab-titles", {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ rows }),
      });
      const j = (await res.json().catch(() => null)) as { success?: boolean; message?: string; error?: string } | null;
      if (j?.success) {
        toast({ title: "ذخیره شد", description: j.message });
        await load();
      } else {
        toast({ title: "خطا در ذخیره", description: j?.error || "عملیات ناموفق بود", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateRow = (idx: number, patch: Partial<AbTitleRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    setRows((prev) => [...prev, { path: "", titleA: "", titleB: "", activeTitle: "A", notes: "" }]);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  /** پرکردن یک‌کلیکی با ۱۰ مقالهٔ منتشرشدهٔ مهم (فقط خانه‌های خالی) */
  const fillFromSuggestions = () => {
    if (suggestions.length === 0) {
      toast({ title: "پیشنهادی موجود نیست", description: "۱۰ صفحهٔ پیشنهادی فقط وقتی جدول خالی باشد ارائه می‌شود" });
      return;
    }
    setRows((prev) => {
      const existing = new Set(prev.map((r) => r.path).filter(Boolean));
      const fresh: AbTitleRow[] = suggestions
        .filter((s) => !existing.has(s.path))
        .slice(0, 10)
        .map((s) => ({
          path: s.path,
          titleA: s.currentTitle.slice(0, MAX_TITLE_LEN),
          titleB: "",
          activeTitle: "A" as const,
          notes: "",
        }));
      return [...prev, ...fresh];
    });
    toast({ title: "صفحات پیشنهادی اضافه شد", description: "تایتل B و یادداشت‌ها را تکمیل و ذخیره کنید" });
  };

  const days = daysSince(updatedAt);
  const cycleDue = days !== null && days >= 28;

  return (
    <div className="space-y-6">
      {/* هدر */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <FlaskConical className="h-5 w-5 text-primary" />
            A/B تست تایتل
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            دو واریانت تایتل برای صفحات کلیدی — چرخهٔ ارزیابی هر ۲۸ روز با مقایسهٔ CTR در سرچ‌کنسول
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load} disabled={loading || saving} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            بازخوانی
          </Button>
          <Button variant="outline" onClick={fillFromSuggestions} disabled={loading || saving} className="gap-2 border-primary/40 hover:border-primary hover:bg-primary/5">
            <Wand2 className="h-4 w-4 text-primary" />
            پرکردن با صفحات پیشنهادی
          </Button>
          <Button onClick={save} disabled={loading || saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "در حال ذخیره…" : "ذخیرهٔ جدول"}
          </Button>
        </div>
      </div>

      {/* یادآور ۲۸ روز + آخرین به‌روزرسانی */}
      <Card className={cn("border", cycleDue ? "border-amber-400/60 bg-amber-50/50 dark:bg-amber-950/20" : "border-primary/20 bg-primary/[0.03]")}>
        <CardContent className="flex flex-wrap items-center gap-3 p-4 text-xs">
          <Clock className={cn("h-4 w-4", cycleDue ? "text-amber-500" : "text-primary")} />
          {updatedAt ? (
            <>
              <span>
                آخرین به‌روزرسانی: <strong>{faDate(updatedAt)}</strong>
                {days !== null && (
                  <> — {toPersianDigits(days)} روز گذشته</>
                )}
              </span>
              {cycleDue ? (
                <Badge variant="destructive" className="text-[10px]">زمان چرخهٔ ۲۸ روزه فرا رسیده — واریانت فعال را عوض کنید</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  یادآور: هر {toPersianDigits(28)} روز تایتل فعال را بازبینی کنید
                </Badge>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">
              هنوز جدولی ذخیره نشده — ردیف اضافه کنید یا از «پرکردن با صفحات پیشنهادی» استفاده کنید.
            </span>
          )}
        </CardContent>
      </Card>

      {/* جدول */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              صفحات تحت آزمون
            </span>
            <Button variant="outline" size="sm" onClick={addRow} disabled={loading || saving} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              افزودن صفحه
            </Button>
          </CardTitle>
          <CardDescription className="text-xs">
            مسیر صفحه (مثل /pricing یا /blog/…) + دو تایتل حداکثر {toPersianDigits(MAX_TITLE_LEN)} کاراکتر + یادداشت نتیجه
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <FlaskConical className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">هنوز صفحه‌ای برای A/B تست ثبت نشده است</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={fillFromSuggestions} className="gap-1.5">
                  <Wand2 className="h-3.5 w-3.5" />
                  پرکردن با ۱۰ مقالهٔ منتشرشده
                </Button>
                <Button size="sm" variant="outline" onClick={addRow} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  افزودن دستی
                </Button>
              </div>
            </div>
          ) : (
            rows.map((row, idx) => (
              <div key={idx} className="rounded-xl border p-4 space-y-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-[220px] flex-1 space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">مسیر صفحه</Label>
                    <Input
                      dir="ltr"
                      placeholder="/pricing"
                      value={row.path}
                      onChange={(e) => updateRow(idx, { path: e.target.value })}
                      className="h-9 font-mono text-xs"
                    />
                  </div>
                  <div className="min-w-[160px] space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">تایتل فعال</Label>
                    <Select
                      value={row.activeTitle}
                      onValueChange={(v) => updateRow(idx, { activeTitle: v === "B" && !row.titleB ? "A" : (v as "A" | "B") })}
                      disabled={!row.titleB}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="انتخاب" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A" className="text-xs">واریانت A</SelectItem>
                        <SelectItem value="B" className="text-xs" disabled={!row.titleB}>واریانت B</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-6 h-9 w-9 text-destructive hover:text-destructive"
                    onClick={() => removeRow(idx)}
                    aria-label="حذف ردیف"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>واریانت A {row.activeTitle === "A" && <Badge className="ms-1 h-4 px-1 text-[9px]">فعال</Badge>}</span>
                      <span className="tnum">{toPersianDigits(row.titleA.length)}/{toPersianDigits(MAX_TITLE_LEN)}</span>
                    </Label>
                    <Input
                      value={row.titleA}
                      onChange={(e) => updateRow(idx, { titleA: e.target.value })}
                      className={cn("h-9 text-xs", row.activeTitle === "A" && "border-primary/50")}
                      maxLength={MAX_TITLE_LEN}
                      placeholder="تایتل فعلی صفحه"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>واریانت B {row.activeTitle === "B" && <Badge className="ms-1 h-4 px-1 text-[9px]">فعال</Badge>}</span>
                      <span className="tnum">{toPersianDigits((row.titleB || "").length)}/{toPersianDigits(MAX_TITLE_LEN)}</span>
                    </Label>
                    <Input
                      value={row.titleB || ""}
                      onChange={(e) => updateRow(idx, { titleB: e.target.value })}
                      className={cn("h-9 text-xs", row.activeTitle === "B" && "border-primary/50")}
                      maxLength={MAX_TITLE_LEN}
                      placeholder="تایتل جایگزین برای چرخهٔ بعد"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">یادداشت (نتیجهٔ CTR، مشاهده، تصمیم بعدی…)</Label>
                  <Textarea
                    value={row.notes || ""}
                    onChange={(e) => updateRow(idx, { notes: e.target.value })}
                    className="min-h-[52px] text-xs"
                    maxLength={300}
                    placeholder="مثلاً: واریانت A در ۲۸ روز CTR بهتری داشت؛ B برای دورهٔ بعد حفظ شود."
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* راهنما */}
      <Card>
        <CardContent className="p-4 text-xs leading-6 text-muted-foreground">
          <p className="mb-2 flex items-center gap-1.5 font-bold text-foreground">
            <Info className="h-4 w-4 text-primary" />
            روش درست A/B تایتل
          </p>
          <ul className="list-inside list-disc space-y-1.5">
            <li>هر <strong>۲۸ روز</strong> یک‌بار واریانت فعال صفحه را عوض کنید (این جدول یادآور شماست).</li>
            <li>پس از هر چرخه، CTR صفحه را در <strong>Google Search Console</strong> با دورهٔ قبل مقایسه و نتیجه را در ستون یادداشت ثبت کنید.</li>
            <li>تایتل‌ها حداکثر <strong>{toPersianDigits(MAX_TITLE_LEN)} کاراکتر</strong> — طولانی‌تر در نتایج جستجو بریده می‌شود.</li>
            <li>برای اعمال تایتل جدید روی خود صفحه، از تب «ویرایشگر بلاگ» یا «محتوا و سئو» فیلد عنوان متا را هم به‌روز کنید.</li>
            <li>پس از تغییر تایتل، از تب «سئو و رشد» دکمهٔ <strong>ایندکس فوری</strong> را بزنید تا گوگل زودتر نسخهٔ جدید را ببیند.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default AbTitlesTab;
