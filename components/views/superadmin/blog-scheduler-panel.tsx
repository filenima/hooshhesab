"use client";

/**
 * BlogSchedulerPanel — پنل حرفه‌ای زمان‌بند انتشار بلاگ (v19 → v36)
 * ----------------------------------------------------------------------------
 * درخواست مالک: «هر وبلاگ هر N روز یک‌بار منتشر شود» + مدیریت کامل صف.
 *
 * ارتقای 3-a:
 *  - آمار کامل: کل / منتشرشده / در صف / بدون نوبت / منتشرشدهٔ امروز
 *  - مدیریت صف انتشار: لیست کامل نوبت‌ها با جابه‌جایی drag-reorder
 *    (@dnd-kit/sortable — ترتیب scheduleOrder + بازچینی خودکار نوبت‌ها)
 *  - ویرایش تاریخ انتشار هر مقاله با تقویم شمسی (JalaliDatePicker)
 *  - توقف / ادامهٔ کل صف (pause) — نوبت‌ها سرجایشان می‌مانند
 *  - پیش‌نمایش «۷ انتشار بعدی» با تاریخ شمسی (date-fns-jalali)
 *  - انتشار فوری تک‌مقاله + حذف از صف + آخرین انتشارها
 */

import * as React from "react";
import {
  CalendarClock,
  Library,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Timer,
  Pause,
  GripVertical,
  Calendar as CalendarIcon,
  Trash2,
  Zap,
  ListOrdered,
  History,
  Plus,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format as formatJalaliDate } from "date-fns-jalali";
import { faIR } from "date-fns-jalali/locale";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, toJalali } from "@/lib/persian";

// ─────────────────────────── Types ───────────────────────────

interface SchedulerStats {
  intervalDays: number;
  paused: boolean;
  drafts: number;
  scheduled: number;
  published: number;
  today: number;
  nextSlot: string | null;
  lastPublishedAt: string | null;
}

interface QueueItem {
  id: string;
  title: string;
  slug: string;
  category: string;
  scheduledPublishAt: string;
  scheduleOrder: number;
}

interface RecentItem {
  id: string;
  title: string;
  slug: string;
  publishedAt: string;
}

interface SchedulerData {
  stats: SchedulerStats;
  queue: QueueItem[];
  recent: RecentItem[];
  newlyScheduled?: number;
  publishedNow?: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  ACCOUNTING: "حسابداری",
  TAX: "مالیات",
  PAYROLL: "حقوق و دستمزد",
  TUTORIAL: "آموزشی",
  EDUCATION: "آموزش",
  NEWS: "اخبار",
  MODIAN: "مودیان",
};

/** تاریخ شمسی خوانا: «شنبه ۲ آبان ۱۴۰۵» */
function prettyJalali(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return formatJalaliDate(new Date(iso), "EEEE d MMMM yyyy", { locale: faIR });
  } catch {
    return toJalali(new Date(iso));
  }
}

/** روز + ماه شمسی: «۲ آبان» */
function shortJalali(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return formatJalaliDate(new Date(iso), "d MMMM", { locale: faIR });
  } catch {
    return toJalali(new Date(iso));
  }
}

// ─────────────────────────── Main Panel ───────────────────────────

export function BlogSchedulerPanel() {
  const { toast } = useToast();
  const [data, setData] = React.useState<SchedulerData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [interval, setIntervalDays] = React.useState("2");
  const [orderDirty, setOrderDirty] = React.useState(false);
  // کلاینت‌حالت ترتیب صف — تا ذخیرهٔ صریح، فقط محلی است
  const [queueOrder, setQueueOrder] = React.useState<QueueItem[]>([]);
  // دیالوگ تغییر تاریخ
  const [editTarget, setEditTarget] = React.useState<QueueItem | null>(null);
  const [editDate, setEditDate] = React.useState<string>("");
  // v37 — دیالوگ ساختاردهی کتابخانه (هدف مالک: ۶۷ منتشر + ۲۰۰ صف)
  const [structureOpen, setStructureOpen] = React.useState(false);
  const [structureKeep, setStructureKeep] = React.useState("67");
  const LIBRARY_GOAL = 267;

  const authHeaders = React.useMemo(() => {
    try {
      const token = localStorage.getItem("hoshhesab_admin_token") || "";
      return { Authorization: `Bearer ${token}` } as Record<string, string>;
    } catch {
      return {} as Record<string, string>;
    }
  }, []);

  const applyData = React.useCallback((json: SchedulerData) => {
    setData(json);
    if (json.stats) setIntervalDays(String(json.stats.intervalDays));
    setQueueOrder(json.queue || []);
    setOrderDirty(false);
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/blog/scheduler", {
        cache: "no-store",
        headers: authHeaders,
      });
      const json = await res.json();
      if (json?.success) applyData(json.data);
    } catch {
      /* offline */
    } finally {
      setLoading(false);
    }
  }, [authHeaders, applyData]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const doAction = React.useCallback(
    async (
      method: "PUT" | "POST",
      body: Record<string, unknown>,
      successTitle = "انجام شد"
    ) => {
      setSaving(true);
      try {
        const res = await fetch("/api/platform/blog/scheduler", {
          method,
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (json?.success) {
          applyData(json.data);
          toast({ title: successTitle, description: json.message || undefined });
          return true;
        }
        toast({
          title: "خطا",
          description: json?.error || "عملیات ناموفق بود",
          variant: "destructive",
        });
        return false;
      } catch {
        toast({ title: "خطای شبکه", variant: "destructive" });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [authHeaders, applyData, toast]
  );

  // ─── dnd-kit setup ───
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = queueOrder.findIndex((q) => q.id === active.id);
    const newIndex = queueOrder.findIndex((q) => q.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setQueueOrder((prev) => arrayMove(prev, oldIndex, newIndex));
    setOrderDirty(true);
  };

  const saveOrder = async () => {
    const ok = await doAction(
      "POST",
      { action: "reorder", orderedIds: queueOrder.map((q) => q.id) },
      "ترتیب صف ذخیره شد"
    );
    if (ok) setOrderDirty(false);
  };

  const stats = data?.stats;
  const upcoming7 = (data?.queue || []).slice(0, 7);

  return (
    <Card className="border-primary/20 bg-gradient-to-l from-primary/5 via-card to-card">
      <CardContent className="p-3.5 space-y-4">
        {/* ─── Header ─── */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarClock className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-bold flex items-center gap-2">
                زمان‌بند انتشار خودکار
                {stats?.paused && (
                  <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-0 text-[10px]">
                    <Pause className="h-3 w-3 ml-1" />
                    صف متوقف است
                  </Badge>
                )}
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                پیش‌نویس‌ها به‌صورت خودکار هر N روز یک‌بار، ساعت ۹:۰۰ صبح منتشر می‌شوند —
                انتشار منظم و پیوسته، سیگنال مثبت سئو.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={stats?.paused ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              disabled={loading || saving}
              onClick={() =>
                void doAction(
                  "PUT",
                  { paused: !stats?.paused },
                  stats?.paused ? "صف انتشار فعال شد" : "صف انتشار متوقف شد"
                )
              }
            >
              {stats?.paused ? (
                <>
                  <Play className="h-3.5 w-3.5" />
                  ادامهٔ انتشار
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5" />
                  توقف موقت صف
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => void load()}
              disabled={loading}
              aria-label="به‌روزرسانی"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        {/* ─── v37: هدف کتابخانهٔ ۲۶۷ تایی + ساختاردهی ۶۷/۲۰۰ ─── */}
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Library className="h-4 w-4 text-primary" />
              <div>
                <p className="text-xs font-bold">هدف کتابخانهٔ بلاگ: {toPersianDigits(LIBRARY_GOAL)} مقاله (۶۷ منتشر + ۲۰۰ صف)</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  با یک کلیک، ۶۷ مقالهٔ منتشر می‌مانند (ستون‌های سئو + قدیمی‌ترین‌ها) و بقیه به ابتدای صفٔ زمان‌بندی می‌روند.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] tabular-nums">
                {toPersianDigits((stats?.published ?? 0) + (stats?.scheduled ?? 0) + (stats?.drafts ?? 0))} / {toPersianDigits(LIBRARY_GOAL)}
              </Badge>
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={loading || saving}
                onClick={() => setStructureOpen(true)}
              >
                <ListOrdered className="h-3.5 w-3.5" />
                ساختاردهی ۶۷/۲۰۰
              </Button>
            </div>
          </div>
        </div>

        {/* ─── آمار ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <div className="rounded-lg border bg-card p-2 text-center">
            <p className="text-lg font-extrabold text-foreground tabular-nums">
              {toPersianDigits(stats?.published ?? 0)}
            </p>
            <p className="text-[10px] text-muted-foreground">منتشر شده</p>
          </div>
          <div className="rounded-lg border bg-card p-2 text-center">
            <p className="text-lg font-extrabold text-primary tabular-nums">
              {toPersianDigits(stats?.scheduled ?? 0)}
            </p>
            <p className="text-[10px] text-muted-foreground">در صف انتشار</p>
          </div>
          <div className="rounded-lg border bg-card p-2 text-center">
            <p className="text-lg font-extrabold text-muted-foreground tabular-nums">
              {toPersianDigits(stats?.drafts ?? 0)}
            </p>
            <p className="text-[10px] text-muted-foreground">بدون نوبت</p>
          </div>
          <div className="rounded-lg border bg-card p-2 text-center">
            <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {toPersianDigits(stats?.today ?? 0)}
            </p>
            <p className="text-[10px] text-muted-foreground">انتشار امروز</p>
          </div>
          <div className="rounded-lg border bg-card p-2 text-center col-span-2 sm:col-span-1">
            <p className="text-[11px] font-bold leading-tight pt-1.5">
              {stats?.nextSlot ? shortJalali(stats.nextSlot) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">انتشار بعدی</p>
          </div>
        </div>

        {/* ─── کنترل‌ها ─── */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-28">
            <label
              htmlFor="blog-interval"
              className="text-[10px] font-medium text-muted-foreground"
            >
              هر چند روز؟
            </label>
            <Input
              id="blog-interval"
              type="number"
              min={1}
              max={30}
              value={interval}
              onChange={(e) => setIntervalDays(e.target.value)}
              className="h-8 text-xs mt-0.5"
              disabled={saving}
            />
          </div>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              const days = Math.max(1, Math.min(30, Number(interval) || 2));
              void doAction("PUT", { intervalDays: days }, "بازهٔ انتشار ذخیره شد");
            }}
            disabled={saving || loading}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            ذخیرهٔ بازه
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() =>
              void doAction("PUT", { autoSchedule: true }, "نوبت‌دهی انجام شد")
            }
            disabled={saving || loading}
          >
            <Timer className="h-3.5 w-3.5" />
            نوبت‌دهی خودکار پیش‌نویس‌ها
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 text-xs"
            onClick={() => void doAction("PUT", { publishNow: true }, "انتشار فوری انجام شد")}
            disabled={saving || loading || (stats?.scheduled ?? 0) === 0}
          >
            <Play className="h-3.5 w-3.5" />
            انتشار فوری بعدی
          </Button>
          {stats?.lastPublishedAt && (
            <Badge variant="secondary" className="h-6 text-[10px]">
              <History className="h-3 w-3 ml-1" />
              آخرین انتشار: {shortJalali(stats.lastPublishedAt)}
            </Badge>
          )}
        </div>

        {/* ─── صف انتشار + پیش‌نمایش ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* صف — drag reorder */}
          <div className="lg:col-span-2 rounded-xl border border-border/70 bg-card overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-muted/30 px-3 py-2">
              <p className="text-xs font-bold flex items-center gap-1.5">
                <ListOrdered className="h-3.5 w-3.5 text-primary" />
                صف انتشار
                <Badge variant="secondary" className="text-[9px]">
                  {toPersianDigits(queueOrder.length)} مقاله
                </Badge>
              </p>
              {orderDirty && (
                <Button
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => void saveOrder()}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                  ذخیرهٔ ترتیب جدید
                </Button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : queueOrder.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <CalendarClock className="h-7 w-7 text-muted-foreground/50 mx-auto" />
                  <p className="text-xs text-muted-foreground">
                    صف خالی است — با «نوبت‌دهی خودکار» پیش‌نویس‌ها را به صف اضافه کنید.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() =>
                      void doAction("PUT", { autoSchedule: true }, "نوبت‌دهی انجام شد")
                    }
                    disabled={saving}
                  >
                    <Plus className="h-3 w-3" />
                    نوبت‌دهی خودکار
                  </Button>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={onDragEnd}
                >
                  <SortableContext
                    items={queueOrder.map((q) => q.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {queueOrder.map((item, idx) => (
                      <SortableQueueRow
                        key={item.id}
                        item={item}
                        index={idx}
                        isDirtyOrder={orderDirty}
                        onEditDate={() => {
                          setEditTarget(item);
                          setEditDate(item.scheduledPublishAt.slice(0, 10));
                        }}
                        onPublishNow={() =>
                          void doAction(
                            "POST",
                            { action: "publishNowOne", postId: item.id },
                            "مقاله منتشر شد"
                          )
                        }
                        onRemove={() =>
                          void doAction(
                            "POST",
                            { action: "unschedule", postId: item.id },
                            "از صف خارج شد"
                          )
                        }
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>

          {/* ۷ انتشار بعدی + اخیر */}
          <div className="space-y-3">
            <div className="rounded-xl border border-primary/25 bg-primary/5 overflow-hidden">
              <div className="border-b border-primary/20 bg-primary/10 px-3 py-2">
                <p className="text-xs font-bold flex items-center gap-1.5 text-primary">
                  <Zap className="h-3.5 w-3.5" />
                  ۷ انتشار بعدی
                </p>
              </div>
              <div className="divide-y divide-border/50">
                {upcoming7.length === 0 ? (
                  <p className="px-3 py-6 text-[11px] text-muted-foreground text-center">
                    نوبتی در صف نیست
                  </p>
                ) : (
                  upcoming7.map((item, i) => (
                    <div key={item.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                        {toPersianDigits(i + 1)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium" title={item.title}>
                          {item.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <CalendarIcon className="h-2.5 w-2.5" />
                          {prettyJalali(item.scheduledPublishAt)} — ساعت ۹:۰۰
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
              <div className="border-b border-border/70 bg-muted/30 px-3 py-2">
                <p className="text-xs font-bold flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5 text-muted-foreground" />
                  آخرین انتشارها
                </p>
              </div>
              <div className="divide-y divide-border/50">
                {(data?.recent || []).length === 0 ? (
                  <p className="px-3 py-5 text-[11px] text-muted-foreground text-center">
                    هنوز چیزی منتشر نشده
                  </p>
                ) : (
                  (data?.recent || []).map((r) => (
                    <a
                      key={r.id}
                      href={`/blog/${r.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block px-3 py-2 hover:bg-muted/40 transition-colors"
                    >
                      <p className="truncate text-[11px] font-medium">{r.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {prettyJalali(r.publishedAt)}
                      </p>
                    </a>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>

      {/* ─── دیالوگ تغییر تاریخ انتشار ─── */}
      <Dialog
        open={editTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setEditTarget(null);
            setEditDate("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-primary" />
              تغییر تاریخ انتشار
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              «{editTarget?.title}» — انتشار در تاریخ انتخابی، ساعت ۹:۰۰ صبح انجام می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">تاریخ انتشار (شمسی)</Label>
              <JalaliDatePicker value={editDate} onChange={(v) => setEditDate(v)} />
            </div>
            {editDate && (
              <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-[11px] text-primary">
                انتشار در: {prettyJalali(editDate)} — ساعت ۹:۰۰ صبح
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditTarget(null);
                setEditDate("");
              }}
            >
              انصراف
            </Button>
            <Button
              size="sm"
              disabled={!editDate || saving}
              onClick={() => {
                if (!editTarget || !editDate) return;
                void (async () => {
                  const ok = await doAction(
                    "POST",
                    { action: "reschedule", postId: editTarget.id, date: editDate },
                    "تاریخ انتشار به‌روزرسانی شد"
                  );
                  if (ok) {
                    setEditTarget(null);
                    setEditDate("");
                  }
                })();
              }}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              ذخیرهٔ تاریخ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── v37: دیالوگ ساختاردهی کتابخانهٔ بلاگ ─── */}
      <Dialog open={structureOpen} onOpenChange={setStructureOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ساختاردهی کتابخانهٔ بلاگ</DialogTitle>
            <DialogDescription>
              ۶۷ مقاله منتشر می‌مانند (اول مقاله‌های ستون خوشه‌ها، بعد قدیمی‌ترین‌های منتشرشده) و
              همهٔ بقیه (منتشرشده و پیش‌نویس) در صفٔ انتشار هر {toPersianDigits(Number(interval) || 2)} روزه قرار می‌گیرند.
              مقاله‌های قبلاً منتشرشده در ابتدای صف می‌آیند تا زودتر به نتایج جستجو برگردند.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>تعداد مقالهٔ منتشرشدهٔ نهایی</Label>
              <Input
                type="number"
                min={1}
                value={structureKeep}
                onChange={(e) => setStructureKeep(e.target.value)}
                dir="ltr"
              />
            </div>
            <Alert>
              <AlertDescription className="text-xs leading-6">
                مقاله‌هایی که از «منتشر» به «صف» می‌روند، به‌جای حذف/404، صفحهٔ «به‌زودی» با noindex می‌گیرند —
                لینک‌های داخلی سالم می‌مانند و با انتشار خودکار به‌سرعت ایندکس برمی‌گردند.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStructureOpen(false)} disabled={saving}>
              انصراف
            </Button>
            <Button
              disabled={saving}
              onClick={async () => {
                const ok = await doAction(
                  "PUT",
                  { structureLibraryTo: Number(structureKeep) || 67 },
                  "کتابخانه ساختاردهی شد"
                );
                if (ok) setStructureOpen(false);
              }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              اجرای ساختاردهی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─────────────────────────── Sortable Row ───────────────────────────

function SortableQueueRow({
  item,
  index,
  isDirtyOrder,
  onEditDate,
  onPublishNow,
  onRemove,
}: {
  item: QueueItem;
  index: number;
  isDirtyOrder: boolean;
  onEditDate: () => void;
  onPublishNow: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-3 py-2 border-b border-border/40 last:border-b-0 ${
        isDragging ? "bg-primary/5 shadow-md rounded-lg" : "bg-card hover:bg-muted/30"
      } transition-colors`}
    >
      {/* دستگیرهٔ drag */}
      <button
        type="button"
        className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
        aria-label="جابه‌جایی"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {/* شمارهٔ نوبت */}
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums ${
          isDirtyOrder
            ? "bg-amber-500/15 text-amber-600"
            : "bg-primary/10 text-primary"
        }`}
      >
        {toPersianDigits(index + 1)}
      </span>

      {/* عنوان + دسته */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium" title={item.title}>
          {item.title}
        </p>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[9px] px-1.5 py-0">
            {CATEGORY_LABELS[item.category] || item.category}
          </Badge>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <CalendarIcon className="h-2.5 w-2.5" />
            {prettyJalali(item.scheduledPublishAt)} — ۹:۰۰
          </span>
        </div>
      </div>

      {/* عملیات */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          title="تغییر تاریخ انتشار"
          onClick={onEditDate}
        >
          <CalendarIcon className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-600"
          title="انتشار فوری همین مقاله"
          onClick={onPublishNow}
        >
          <Zap className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          title="خروج از صف انتشار"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default BlogSchedulerPanel;
