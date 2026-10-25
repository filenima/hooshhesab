"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart,
  Package,
  Users,
  Banknote,
  Receipt,
  FileCheck,
  AlertTriangle,
  Settings,
  TrendingUp,
  BookOpen,
  Clock,
  ChevronDown,
  ChevronUp,
  Activity,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toPersianDigits, toJalali } from "@/lib/persian";

/* ============================================================
 تایپ‌ها
 ============================================================ */

type ActivityType =
  | "invoice_created"
  | "invoice_paid"
  | "product_added"
  | "product_updated"
  | "customer_added"
  | "payment_received"
  | "payment_sent"
  | "report_generated"
  | "tax_filed"
  | "alert_triggered"
  | "settings_changed"
  | "system_update"
  | "journal_created";

interface ActivityEntry {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string;
  amount?: number;
}

/* ============================================================
 ثابت‌ها
 ============================================================ */

const ACTIVITY_META: Record<ActivityType, { icon: LucideIcon; color: string; label: string }> = {
  invoice_created: { icon: ShoppingCart, color: "text-violet-500", label: "فاکتور" },
  invoice_paid: { icon: FileCheck, color: "text-emerald-500", label: "فاکتور" },
  product_added: { icon: Package, color: "text-teal-500", label: "محصول" },
  product_updated: { icon: Package, color: "text-teal-400", label: "محصول" },
  customer_added: { icon: Users, color: "text-amber-500", label: "مشتری" },
  payment_received: { icon: Banknote, color: "text-emerald-500", label: "دریافت" },
  payment_sent: { icon: Banknote, color: "text-rose-500", label: "پرداخت" },
  report_generated: { icon: Receipt, color: "text-fuchsia-500", label: "گزارش" },
  tax_filed: { icon: FileCheck, color: "text-teal-500", label: "مالیات" },
  alert_triggered: { icon: AlertTriangle, color: "text-amber-500", label: "هشدار" },
  settings_changed: { icon: Settings, color: "text-muted-foreground", label: "تنظیمات" },
  system_update: { icon: TrendingUp, color: "text-primary", label: "سیستم" },
  journal_created: { icon: BookOpen, color: "text-orange-500", label: "سند" },
};

/* ============================================================
 ابزار: زمان نسبی فارسی
 ============================================================ */

function timeAgoFa(dateISO: string): string {
  const diff = Date.now() - new Date(dateISO).getTime();
  if (diff < 0) return "اکنون";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "اکنون";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${toPersianDigits(min)} دقیقه پیش`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${toPersianDigits(hr)} ساعت پیش`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${toPersianDigits(day)} روز پیش`;
  return toJalali(new Date(dateISO));
}

/* ============================================================
 کامپوننت اصلی: ActivityFeed — فقط دادهٔ واقعی (بدون دادهٔ فیک)
 ============================================================ */

export function ActivityFeed({ className }: { className?: string }) {
  const [activities, setActivities] = React.useState<ActivityEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [visibleCount, setVisibleCount] = React.useState(5);
  const [filter, setFilter] = React.useState<ActivityType | "all">("all");
  const [collapsed, setCollapsed] = React.useState(false);

  const load = React.useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    try {
      const res = await fetch("/api/activities?limit=20", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json?.success && Array.isArray(json.data)) {
          setActivities(json.data as ActivityEntry[]);
          // کش آفلاین: آخرین دادهٔ موفق برای نمایش در حالت بدون اینترنت
          try {
            localStorage.setItem("hosh:activities-cache", JSON.stringify({ t: Date.now(), d: json.data }));
          } catch {}
        }
      }
    } catch {
      // آفلاین/خطا: از کش محلی استفاده کن (اگر بود) — بدون نمایش ارور
      try {
        const raw = localStorage.getItem("hosh:activities-cache");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.d && Array.isArray(parsed.d)) setActivities(parsed.d as ActivityEntry[]);
        }
      } catch {}
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    // به‌روزرسانی خودکار هر ۲ دقیقه
    const iv = setInterval(() => load(true), 120_000);
    return () => clearInterval(iv);
  }, [load]);

  const filteredActivities = React.useMemo(() => {
    if (filter === "all") return activities;
    return activities.filter((a) => a.type === filter);
  }, [activities, filter]);

  const visibleActivities = filteredActivities.slice(0, visibleCount);
  const hasMore = visibleCount < filteredActivities.length;

  /* انواع فعالیت‌های موجود برای فیلتر */
  const availableTypes = React.useMemo(() => {
    const types = new Set(activities.map((a) => a.type));
    return Array.from(types);
  }, [activities]);

  const typeLabel = React.useCallback((type: string) => ACTIVITY_META[type as ActivityType]?.label ?? "دیگر", []);

  return (
    <Card className={cn("w-full", className)} dir="rtl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            فعالیت‌های اخیر
            <span className="text-[10px] font-normal text-muted-foreground">(داده‌های واقعی شما)</span>
          </CardTitle>
          <div className="flex items-center gap-1">
            {/* به‌روزرسانی دستی */}
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7", refreshing && "animate-spin text-primary")}
              onClick={() => load(true)}
              disabled={refreshing}
              aria-label="به‌روزرسانی فعالیت‌ها"
              title="به‌روزرسانی"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "باز کردن" : "جمع کردن"}
            >
              {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
        {!collapsed && activities.length > 0 && (
          <div className="mt-2 flex items-center gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
            <Button
              variant={filter === "all" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 shrink-0 text-[10px] px-2"
              onClick={() => {
                setFilter("all");
                setVisibleCount(5);
              }}
            >
              همه
            </Button>
            {availableTypes.slice(0, 5).map((type) => (
              <Button
                key={type}
                variant={filter === type ? "secondary" : "ghost"}
                size="sm"
                className="h-6 shrink-0 text-[10px] px-2"
                onClick={() => {
                  setFilter(type);
                  setVisibleCount(5);
                }}
              >
                {typeLabel(type)}
              </Button>
            ))}
          </div>
        )}
      </CardHeader>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent className="pt-0">
              {/* حالت بارگذاری */}
              {loading ? (
                <div className="space-y-2" aria-busy="true" aria-label="در حال دریافت فعالیت‌ها">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg p-2">
                      <div className="mt-0.5 h-4 w-4 animate-pulse rounded-full bg-muted" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                        <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activities.length === 0 ? (
                /* حالت خالی — بدون دادهٔ فیک */
                <div className="py-8 text-center">
                  <div className="relative mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <Activity className="h-7 w-7 text-primary" />
                    <span className="absolute -bottom-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-background shadow-sm">
                      <SparkleIcon />
                    </span>
                  </div>
                  <p className="text-xs font-bold text-foreground">هنوز فعالیتی ثبت نشده است</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    با ثبت اولین فاکتور، مشتری یا محصول، فعالیت‌های واقعی شما اینجا نمایش داده می‌شوند
                  </p>
                </div>
              ) : (
                <>
                  <ScrollArea className="max-h-80">
                    <div className="space-y-2">
                      {visibleActivities.map((activity) => {
                        const meta = ACTIVITY_META[activity.type] ?? ACTIVITY_META.system_update;
                        const Icon = meta.icon;
                        return (
                          <motion.div
                            key={activity.id}
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50"
                          >
                            {/* آیکون */}
                            <div className={cn("mt-0.5 shrink-0", meta.color)}>
                              <Icon className="h-4 w-4" />
                            </div>

                            {/* محتوا */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-xs font-medium text-foreground">{activity.title}</p>
                                {activity.amount !== undefined && activity.amount > 0 && (
                                  <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[9px] tabular-nums">
                                    {toPersianDigits(Math.round(activity.amount / 10_000).toLocaleString("en-US"))} هزار تومان
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{activity.description}</p>
                              <div className="mt-1 flex items-center gap-2">
                                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Clock className="h-2.5 w-2.5" />
                                  {timeAgoFa(activity.timestamp)}
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </ScrollArea>

                  {hasMore && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 w-full text-xs text-muted-foreground"
                      onClick={() => setVisibleCount((c) => c + 5)}
                    >
                      نمایش بیشتر
                      <ChevronDown className="mr-1 h-3 w-3" />
                    </Button>
                  )}

                  {filteredActivities.length === 0 && (
                    <div className="py-8 text-center">
                      <Activity className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                      <p className="text-xs text-muted-foreground">فعالیتی در این دسته یافت نشد</p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

/* آیکون جرقهٔ کوچک برای حالت خالی */
function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3 fill-primary" aria-hidden="true">
      <path d="M12 2l1.8 5.6L19.5 9l-5.7 1.4L12 16l-1.8-5.6L4.5 9l5.7-1.4L12 2z" />
    </svg>
  );
}
