"use client";

// ============================================================================
// هوش — تب «مدیریت اقساط» (پنل سوپرادمین) — v36 (Task 4)
// ----------------------------------------------------------------------------
// مدیریت پلن‌های اقساطی لایسنس:
//  • آمار کارت‌ها: پلن فعال، اقساط معوق، سررسید نزدیک، وصولی این ماه
//  • جدول با فیلتر وضعیت + جستجو + صفحه‌بندی
//  • عملیات: مشاهدهٔ اقساط (بازکردن ردیف)، ثبت دستی پرداخت (واریز بانکی)،
//    ویرایش سررسید (تقویم شمسی)، توقف/فعال‌سازی مجدد پلن
//  • نمودار وصولی اقساط ماهانه (recharts)
// داده از /api/platform/installments (سوپرادمین — Bearer token مثل بقیهٔ تب‌ها).
// ============================================================================

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  AlertOctagon,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  HandCoins,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { authFetch } from "@/lib/auth-fetch";
import { formatCompactToman, formatNumber, toPersianDigits } from "@/lib/persian";

// ─────────────────────────── انواع داده (آینهٔ API) ───────────────────────────

interface AdminInstallmentRow {
  id: string;
  seq: number;
  amountToman: number;
  dueDate: string;
  dueDateJalali: string;
  status: string;
  paidAt: string | null;
  paidAtJalali: string | null;
  refId: string | null;
  authority: string | null;
}

interface AdminInstallmentPlan {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantEmail: string | null;
  tenantStatus: string | null;
  planId: string;
  planName: string;
  period: string;
  status: string;
  totalAmountToman: number;
  installmentCount: number;
  paidCount: number;
  couponCode: string | null;
  priceLockedToman: number | null;
  startsAt: string;
  startsAtJalali: string;
  createdAt: string;
  licenseId: string | null;
  installments: AdminInstallmentRow[];
  nextInstallment: AdminInstallmentRow | null;
  remainingToman: number;
  hasOverdue: boolean;
}

interface AdminStats {
  activePlans: number;
  completedPlans: number;
  defaultedPlans: number;
  overdueInstallments: number;
  dueThisWeek: number;
  paidThisMonthToman: number;
  outstandingToman: number;
  suspendAfterDays: number;
}

interface AdminListResponse {
  success: boolean;
  items: AdminInstallmentPlan[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  stats: AdminStats;
  chart: { month: string; toman: number; count: number }[];
  error?: string;
}

// ─────────────────────────── کمک‌تابع‌های نمایش ───────────────────────────

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "ALL", label: "همهٔ وضعیت‌ها" },
  { value: "ACTIVE", label: "در جریان (فعال)" },
  { value: "DEFAULTED", label: "دارای معوقی" },
  { value: "COMPLETED", label: "تکمیل‌شده" },
  { value: "CANCELED", label: "متوقف‌شده" },
];

function planStatusBadge(status: string) {
  if (status === "COMPLETED") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px] gap-1">
        <CheckCircle2 className="h-2.5 w-2.5" />
        تکمیل‌شده
      </Badge>
    );
  }
  if (status === "DEFAULTED") {
    return (
      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-[10px] gap-1">
        <AlertTriangle className="h-2.5 w-2.5" />
        دارای معوقی
      </Badge>
    );
  }
  if (status === "CANCELED") {
    return (
      <Badge className="bg-muted text-muted-foreground text-[10px] gap-1">
        <PauseCircle className="h-2.5 w-2.5" />
        متوقف‌شده
      </Badge>
    );
  }
  return (
    <Badge className="bg-primary/10 text-primary text-[10px] gap-1">
      <PlayCircle className="h-2.5 w-2.5" />
      در جریان
    </Badge>
  );
}

function installmentStatusBadge(status: string) {
  if (status === "PAID") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px]">
        پرداخت‌شده
      </Badge>
    );
  }
  if (status === "OVERDUE") {
    return (
      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-[10px]">
        معوق
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-[10px]">
      در انتظار
    </Badge>
  );
}

// ─────────────────────────── کامپوننت اصلی ───────────────────────────

export default function InstallmentsAdminTab({ token }: { token?: string | null }) {
  // داده‌ها
  const [items, setItems] = React.useState<AdminInstallmentPlan[]>([]);
  const [stats, setStats] = React.useState<AdminStats | null>(null);
  const [chart, setChart] = React.useState<{ month: string; toman: number; count: number }[]>([]);
  const [pagination, setPagination] = React.useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // فیلترها
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [searchInput, setSearchInput] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [page, setPage] = React.useState(1);

  // ردیف‌های بازشده (مشاهدهٔ اقساط)
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  // دیالوگ ثبت دستی پرداخت
  const [markPaidInst, setMarkPaidInst] = React.useState<AdminInstallmentRow | null>(null);
  const [markPaidPlan, setMarkPaidPlan] = React.useState<AdminInstallmentPlan | null>(null);
  const [manualRef, setManualRef] = React.useState("");
  const [manualNote, setManualNote] = React.useState("");
  const [actionLoading, setActionLoading] = React.useState(false);

  // دیالوگ ویرایش سررسید
  const [editDueInst, setEditDueInst] = React.useState<AdminInstallmentRow | null>(null);
  const [editDueValue, setEditDueValue] = React.useState("");

  // دیالوگ تأیید توقف پلن
  const [stopPlan, setStopPlan] = React.useState<AdminInstallmentPlan | null>(null);

  const authHeaders = React.useMemo<Record<string, string>>(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  // جستجو با debounce
  React.useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ============ بارگذاری لیست + آمار ============
  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter!== "ALL") params.set("status", statusFilter);
      if (searchQuery) params.set("q", searchQuery);
      params.set("page", String(page));
      const res = await authFetch(`/api/platform/installments?${params.toString()}`, {
        headers: authHeaders,
      });
      const json = (await res.json()) as AdminListResponse;
      if (!res.ok ||!json.success) {
        throw new Error(json.error || "خطا در دریافت پلن‌های اقساطی");
      }
      setItems(json.items);
      setStats(json.stats);
      setChart(json.chart ?? []);
      setPagination({
        page: json.pagination.page,
        totalPages: json.pagination.totalPages,
        total: json.pagination.total,
      });
    } catch (e) {
      setError(e instanceof Error? e.message: "خطای ناشناخته در ارتباط با سرور");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery, page, authHeaders]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // ============ عملیات POST ============
  const runAction = async (payload: Record<string, unknown>): Promise<boolean> => {
    setActionLoading(true);
    try {
      const res = await authFetch("/api/platform/installments", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok ||!json.success) {
        throw new Error(json.error || "خطا در انجام عملیات");
      }
      setError(null);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error? e.message: "خطای ناشناخته");
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!markPaidInst) return;
    const ok = await runAction({
      action: "mark-paid",
      installmentId: markPaidInst.id,
      refId: manualRef.trim() || undefined,
      note: manualNote.trim() || undefined,
    });
    if (ok) {
      setMarkPaidInst(null);
      setMarkPaidPlan(null);
      setManualRef("");
      setManualNote("");
    }
  };

  const handleEditDue = async () => {
    if (!editDueInst ||!editDueValue) return;
    const ok = await runAction({
      action: "edit-due",
      installmentId: editDueInst.id,
      dueDate: editDueValue,
    });
    if (ok) {
      setEditDueInst(null);
      setEditDueValue("");
    }
  };

  const handleStopPlan = async () => {
    if (!stopPlan) return;
    const ok = await runAction({ action: "stop-plan", installmentPlanId: stopPlan.id });
    if (ok) setStopPlan(null);
  };

  const handleReactivate = async (planRow: AdminInstallmentPlan) => {
    await runAction({ action: "reactivate-plan", installmentPlanId: planRow.id });
  };

  // ── حالت بارگذاری اولیه (اسکلتون) ──
  if (loading &&!stats) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="در حال بارگذاری مدیریت اقساط">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="mt-2 h-7 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── هدر ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            <CalendarClock className="h-5 w-5 text-primary" />
            مدیریت اقساط لایسنس
          </h2>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            پلن‌های پرداخت اقساطی، اقساط معوق، ثبت دستی واریز بانکی و تعلیق خودکار لایسنس
            {stats? ` — لایسنسِ قسط معوق بیش از ${toPersianDigits(stats.suspendAfterDays)} روز، تعلیق می‌شود`: ""}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading} className="gap-1.5">
          {loading? <RefreshCw className="h-3.5 w-3.5 animate-spin" />: <RefreshCw className="h-3.5 w-3.5" />}
          به‌روزرسانی
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-2">
          <AlertOctagon className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive leading-relaxed">{error}</p>
        </div>
      )}

      {/* ── کارت‌های آمار ── */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Card className="border-primary/20">
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">پلن‌های فعال</p>
                <CreditCard className="h-4 w-4 text-primary/70" aria-hidden="true" />
              </div>
              <p className="mt-1.5 text-xl font-bold text-foreground tnum">
                {toPersianDigits(stats.activePlans)}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground tnum">
                {toPersianDigits(stats.completedPlans)} تکمیل‌شده •{" "}
                {toPersianDigits(stats.defaultedPlans)} دارای معوقی
              </p>
            </CardContent>
          </Card>
          <Card className={stats.overdueInstallments > 0? "border-red-300 dark:border-red-900": ""}>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">اقساط معوق</p>
                <AlertTriangle
                  className={`h-4 w-4 ${stats.overdueInstallments > 0? "text-red-500": "text-muted-foreground"}`}
                  aria-hidden="true"
                />
              </div>
              <p className={`mt-1.5 text-xl font-bold tnum ${stats.overdueInstallments > 0? "text-red-600 dark:text-red-400": "text-foreground"}`}>
                {toPersianDigits(stats.overdueInstallments)}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground tnum">
                {toPersianDigits(stats.dueThisWeek)} سررسید در ۷ روز آینده
              </p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 dark:border-emerald-900">
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">وصولی این ماه</p>
                <HandCoins className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              </div>
              <p className="mt-1.5 text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {formatCompactToman(stats.paidThisMonthToman)}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">اقساط پرداخت‌شدهٔ ۳۰ روز اخیر</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">جمع مطالبات باز</p>
                <Wallet className="h-4 w-4 text-amber-600" aria-hidden="true" />
              </div>
              <p className="mt-1.5 text-lg font-bold text-amber-600 dark:text-amber-400">
                {formatCompactToman(stats.outstandingToman)}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">مجموع اقساط پرداخت‌نشده</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── نمودار وصولی اقساط ماهانه ── */}
      {chart.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">وصولی اقساط ماهانه</CardTitle>
            <CardDescription className="text-xs">
              مبلغ اقساط پرداخت‌شده در ۶ ماه اخیر (بر اساس تاریخ پرداخت)
            </CardDescription>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,120,120,0.15)" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fontFamily: "inherit" }}
                  reversed
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) => formatCompactToman(v)}
                  tick={{ fontSize: 9, fontFamily: "inherit" }}
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  width={96}
                />
                <ChartTooltip
                  cursor={{ fill: "rgba(120,120,120,0.06)" }}
                  formatter={(value: number | string, name: string) => {
                    if (name=== "toman") {
                      return [formatNumber(Number(value)), "مبلغ وصولی"];
                    }
                    return [toPersianDigits(Number(value)), "تعداد قسط"];
                  }}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid rgba(120,120,120,0.2)",
                    fontSize: 11,
                    direction: "rtl",
                  }}
                />
                <Bar dataKey="toman" fill="#059669" radius={[6, 6, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── فیلترها ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="جستجوی نام سازمان یا ایمیل…"
            className="pr-8 h-9 text-sm"
            aria-label="جستجوی پلن‌های اقساطی"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-full sm:w-44 text-sm" aria-label="فیلتر وضعیت">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-sm">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── جدول پلن‌ها ── */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-right text-xs font-semibold">سازمان</TableHead>
                <TableHead className="text-right text-xs font-semibold">پلن</TableHead>
                <TableHead className="text-right text-xs font-semibold">پیشرفت</TableHead>
                <TableHead className="text-right text-xs font-semibold">قسط بعدی</TableHead>
                <TableHead className="text-right text-xs font-semibold">وضعیت</TableHead>
                <TableHead className="text-right text-xs font-semibold">اقدامات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center">
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      در حال بارگذاری…
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {!loading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    پلن اقساطی با این فیلترها یافت نشد.
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                items.map((planRow) => {
                  const isExpanded = expandedId=== planRow.id;
                  const pct = Math.round((planRow.paidCount / Math.max(1, planRow.installmentCount)) * 100);
                  return (
                    <React.Fragment key={planRow.id}>
                      <TableRow className={isExpanded? "bg-muted/30": ""}>
                        <TableCell className="max-w-[180px]">
                          <p className="truncate text-xs font-semibold text-foreground">
                            {planRow.tenantName}
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground" dir="ltr">
                            {planRow.tenantEmail?? "—"}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="text-xs font-medium text-foreground">
                            {planRow.planName} — {planRow.period === "monthly"? "ماهانه": "سالانه"}
                          </p>
                          <p className="text-[10px] text-muted-foreground tnum">
                            جمع {formatCompactToman(planRow.totalAmountToman)}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="text-xs text-foreground tnum">
                            {toPersianDigits(planRow.paidCount)} از {toPersianDigits(planRow.installmentCount)}
                            <span className="text-[10px] text-muted-foreground"> ({toPersianDigits(pct)}٪)</span>
                          </p>
                          <div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-emerald-500 transition-all"
                              style={{ width: `${pct}%` }}
                              aria-hidden="true"
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          {planRow.nextInstallment ? (
                            <>
                              <p className="text-xs font-medium text-foreground tnum">
                                {formatCompactToman(planRow.nextInstallment.amountToman)}
                              </p>
                              <p
                                className={`text-[10px] tnum ${
                                  planRow.nextInstallment.status === "OVERDUE"
                                    ? "text-red-600 dark:text-red-400 font-medium"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {planRow.nextInstallment.status === "OVERDUE"? "معوق: ": "سررسید: "}
                                {planRow.nextInstallment.dueDateJalali}
                              </p>
                            </>
                          ): (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{planStatusBadge(planRow.status)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px] gap-1"
                              onClick={() => setExpandedId(isExpanded? null: planRow.id)}
                              aria-expanded={isExpanded}
                            >
                              {isExpanded? <ChevronDown className="h-3 w-3" />: <ChevronLeft className="h-3 w-3" />}
                              اقساط
                            </Button>
                            {planRow.nextInstallment && planRow.status!== "COMPLETED" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px] gap-1 text-emerald-700 dark:text-emerald-400"
                                onClick={() => {
                                  setMarkPaidInst(planRow.nextInstallment);
                                  setMarkPaidPlan(planRow);
                                  setManualRef("");
                                  setManualNote("");
                                }}
                                title="ثبت دستی پرداخت (واریز بانکی)"
                              >
                                <Banknote className="h-3 w-3" />
                                ثبت پرداخت
                              </Button>
                            )}
                            {planRow.status!== "COMPLETED" && planRow.status!== "CANCELED" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px] gap-1 text-red-600 dark:text-red-400 hover:text-red-700"
                                onClick={() => setStopPlan(planRow)}
                              >
                                <PauseCircle className="h-3 w-3" />
                                توقف
                              </Button>
                            ): planRow.status=== "CANCELED" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px] gap-1 text-emerald-600 dark:text-emerald-400"
                                onClick={() => void handleReactivate(planRow)}
                                disabled={actionLoading}
                              >
                                <PlayCircle className="h-3 w-3" />
                                فعال‌سازی
                              </Button>
                            ): null}
                          </div>
                        </TableCell>
                      </TableRow>
                      {/* ── ردیف بازشده: جدول اقساط ── */}
                      {isExpanded && (
                        <TableRow className="bg-muted/20">
                          <TableCell colSpan={6} className="p-3">
                            <div className="overflow-hidden rounded-lg border border-border bg-background">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-muted/40">
                                    <TableHead className="text-right text-[11px]">قسط</TableHead>
                                    <TableHead className="text-right text-[11px]">مبلغ</TableHead>
                                    <TableHead className="text-right text-[11px]">سررسید</TableHead>
                                    <TableHead className="text-right text-[11px]">تاریخ پرداخت</TableHead>
                                    <TableHead className="text-right text-[11px]">کد پیگیری</TableHead>
                                    <TableHead className="text-right text-[11px]">وضعیت</TableHead>
                                    <TableHead className="text-right text-[11px]">اقدام</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {planRow.installments.map((inst) => (
                                    <TableRow key={inst.id}>
                                      <TableCell className="text-xs font-semibold tnum">
                                        {toPersianDigits(inst.seq)}
                                      </TableCell>
                                      <TableCell className="text-xs tnum">
                                        {formatNumber(inst.amountToman)}
                                      </TableCell>
                                      <TableCell className="text-[11px] text-muted-foreground tnum">
                                        {inst.dueDateJalali}
                                      </TableCell>
                                      <TableCell className="text-[11px] text-muted-foreground tnum">
                                        {inst.paidAtJalali?? "—"}
                                      </TableCell>
                                      <TableCell className="text-[10px] text-muted-foreground" dir="ltr">
                                        {inst.refId?? "—"}
                                      </TableCell>
                                      <TableCell>{installmentStatusBadge(inst.status)}</TableCell>
                                      <TableCell>
                                        {inst.status!== "PAID" && (
                                          <div className="flex items-center gap-1">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="h-6 px-2 text-[10px] gap-1 text-emerald-700 dark:text-emerald-400"
                                              onClick={() => {
                                                setMarkPaidInst(inst);
                                                setMarkPaidPlan(planRow);
                                                setManualRef("");
                                                setManualNote("");
                                              }}
                                            >
                                              <Banknote className="h-2.5 w-2.5" />
                                              ثبت پرداخت
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-6 px-2 text-[10px] gap-1"
                                              onClick={() => {
                                                setEditDueInst(inst);
                                                setEditDueValue(inst.dueDate.slice(0, 10));
                                              }}
                                            >
                                              <CalendarClock className="h-2.5 w-2.5" />
                                              سررسید
                                            </Button>
                                          </div>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                            {planRow.priceLockedToman && (
                              <p className="mt-2 text-[10px] text-muted-foreground tnum">
                                قیمت قفل‌شدهٔ تمدید: {formatNumber(planRow.priceLockedToman)} تومان
                                {planRow.couponCode? ` • کد تخفیف: ${planRow.couponCode}`: ""}
                              </p>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── صفحه‌بندی ── */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground tnum">
          {toPersianDigits(pagination.total)} پلن • صفحهٔ {toPersianDigits(pagination.page)} از{" "}
          {toPersianDigits(pagination.totalPages)}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="صفحهٔ قبل"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={page >= pagination.totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            aria-label="صفحهٔ بعد"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── دیالوگ: ثبت دستی پرداخت (واریز بانکی) ── */}
      <Dialog
        open={!!markPaidInst}
        onOpenChange={(open) => {
          if (!open) {
            setMarkPaidInst(null);
            setMarkPaidPlan(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Banknote className="h-4 w-4 text-emerald-600" />
              ثبت دستی پرداخت قسط
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              قسط {toPersianDigits(markPaidInst?.seq ?? 0)} از{" "}
              {toPersianDigits(markPaidPlan?.installmentCount ?? 0)} —{" "}
              {markPaidPlan?.tenantName} — مبلغ{" "}
              <span className="font-semibold tnum">
                {formatNumber(markPaidInst?.amountToman ?? 0)} تومان
              </span>{" "}
              «پرداخت‌شده» ثبت می‌شود (واریز بانکی). اگر قسط اول باشد لایسنس صادر و اگر
              لایسنس معلق باشد دوباره فعال می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="manual-ref" className="text-xs">
                کد پیگیری واریز (اختیاری)
              </Label>
              <Input
                id="manual-ref"
                value={manualRef}
                onChange={(e) => setManualRef(e.target.value)}
                placeholder="مثلاً REF-12345 — خالی بگذارید تا خودکار ساخته شود"
                dir="ltr"
                className="text-sm font-mono h-9"
                disabled={actionLoading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-note" className="text-xs">
                یادداشت (اختیاری)
              </Label>
              <Input
                id="manual-note"
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                placeholder="مثلاً واریز به حساب بانکی، شماره پیامک و…"
                className="text-sm h-9"
                disabled={actionLoading}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setMarkPaidInst(null);
                setMarkPaidPlan(null);
              }}
              disabled={actionLoading}
            >
              انصراف
            </Button>
            <Button onClick={() => void handleMarkPaid()} disabled={actionLoading} className="gap-1.5">
              {actionLoading? <RefreshCw className="h-4 w-4 animate-spin" />: <CheckCircle2 className="h-4 w-4" />}
              تأیید پرداخت دستی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── دیالوگ: ویرایش سررسید (تقویم شمسی) ── */}
      <Dialog open={!!editDueInst} onOpenChange={(open) =>!open && setEditDueInst(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <CalendarClock className="h-4 w-4 text-primary" />
              ویرایش سررسید قسط {toPersianDigits(editDueInst?.seq ?? 0)}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              سررسید فعلی: {editDueInst?.dueDateJalali} — تاریخ جدید را از تقویم شمسی انتخاب کنید.
              تغییر سررسید فقط روی اقساط پرداخت‌نشده ممکن است.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">سررسید جدید</Label>
            <JalaliDatePicker
              value={editDueValue}
              onChange={(v) => setEditDueValue(v)}
              placeholder="انتخاب تاریخ سررسید"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditDueInst(null)} disabled={actionLoading}>
              انصراف
            </Button>
            <Button onClick={() => void handleEditDue()} disabled={actionLoading ||!editDueValue} className="gap-1.5">
              {actionLoading? <RefreshCw className="h-4 w-4 animate-spin" />: <CheckCircle2 className="h-4 w-4" />}
              ثبت سررسید جدید
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── تأیید توقف پلن ── */}
      <AlertDialog open={!!stopPlan} onOpenChange={(open) =>!open && setStopPlan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">توقف پلن اقساطی</AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              پلن اقساطی «{stopPlan?.tenantName}» ({stopPlan?.planName}) متوقف شود؟ اقساط باقیمانده
              دیگر یادآوری نمی‌شوند و لایسنس فعلی همان‌طور که هست باقی می‌ماند. این عمل در
              پنل قابل بازگشت است (فعال‌سازی مجدد).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleStopPlan()} disabled={actionLoading}>
              {actionLoading? "در حال توقف…": "بله، توقف کن"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
