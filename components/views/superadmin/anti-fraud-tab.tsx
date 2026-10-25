"use client";

// ============ راند ۱۲ (Task 4-a) — تب «ضدتقلب ثبت‌نام» (پنل سوپرادمین) ============
// مدیریت سد ضدتقلب ثبت‌نام از پنل:
// ۱) آمار کلیدها: کلیدهای ثبت‌شده / مسدودشده / معاف‌شده / به‌سقف‌رسیده
// ۲) ویرایش سقف‌های ۴لایه (دستگاه/موبایل/ایمیل/IP) + سویچ کل سیستم (PUT)
// ۳) جدول کلیدها: جستجو + فیلتر نوع + معافیت / مسدودسازی / صفرکردن
//    شمارنده / یادداشت / حذف کامل (PATCH & DELETE)
// API: /api/platform/anti-fraud  و  /api/platform/anti-fraud/[id]

import * as React from "react";
import {
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Ban,
  LockOpen,
  AlertTriangle,
  Fingerprint,
  Smartphone,
  Mail,
  Globe,
  MoreHorizontal,
  RotateCcw,
  StickyNote,
  Trash2,
  RefreshCw,
  Search,
  Check,
  Info,
  Loader2,
  Save,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  DropdownMenuSeparator,
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
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits, toJalali } from "@/lib/persian";

/* ============ تایپ‌ها (قرارداد API) ============ */

interface RegistrationGuardRow {
  id: string;
  guardKey: string;
  guardType: string;
  count: number;
  lastIp: string | null;
  lastUserAgent: string | null;
  blocked: boolean;
  exempt: boolean;
  note: string | null;
  firstSeen: string;
  lastSeen: string;
}

interface AntiFraudLimits {
  enabled: boolean;
  device: number;
  phone: number;
  email: number;
  ip: number;
}

interface AntiFraudStats {
  total: number;
  blocked: number;
  exempt: number;
  atLimit: number;
  byType: { type: string; keys: number; registrations: number }[];
}

type AntiFraudResponse = {
  success?: boolean;
  error?: string;
  data?: {
    guards?: RegistrationGuardRow[];
    stats?: AntiFraudStats;
    limits?: AntiFraudLimits;
  };
};

type GuardMutationResponse = {
  success?: boolean;
  error?: string;
  data?: RegistrationGuardRow;
};

/* ============ کمکی‌ها ============ */

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

function faDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return toJalali(new Date(iso));
  } catch {
    return "—";
  }
}

const TYPE_META: Record<string, { label: string; icon: LucideIcon; cls: string }> = {
  device: {
    label: "دستگاه",
    icon: Fingerprint,
    cls: "border-violet-300 text-violet-700 dark:border-violet-800 dark:text-violet-300",
  },
  phone: {
    label: "موبایل",
    icon: Smartphone,
    cls: "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300",
  },
  email: {
    label: "ایمیل",
    icon: Mail,
    cls: "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300",
  },
  ip: {
    label: "IP",
    icon: Globe,
    cls: "border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-300",
  },
};

function typeMeta(t: string): { label: string; icon: LucideIcon; cls: string } {
  return TYPE_META[t] || { label: t || "نامشخص", icon: ShieldAlert, cls: "" };
}

function limitForType(limits: AntiFraudLimits | null, t: string): number {
  if (!limits) return 0;
  if (t === "device") return limits.device;
  if (t === "phone") return limits.phone;
  if (t === "email") return limits.email;
  if (t === "ip") return limits.ip;
  return 0;
}

/** ورودی متنی عددی → عدد ۰ تا ۹۹۹ */
function clampLimit(v: string): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 999);
}

const LIMIT_FIELDS: {
  key: "device" | "phone" | "email" | "ip";
  label: string;
  desc: string;
  icon: LucideIcon;
}[] = [
  {
    key: "device",
    label: "سقف دستگاه",
    desc: "اثر انگشت مرورگر — ثبت‌نام‌های متوالی با یک دستگاه را می‌گیرد",
    icon: Fingerprint,
  },
  {
    key: "phone",
    label: "سقف شماره موبایل",
    desc: "شمارهٔ موبایل تکراری در چند ثبت‌نام را می‌گیرد",
    icon: Smartphone,
  },
  {
    key: "email",
    label: "سقف ایمیل",
    desc: "ایمیل تکراری در چند ثبت‌نام را می‌گیرد",
    icon: Mail,
  },
  {
    key: "ip",
    label: "سقف IP",
    desc: "آدرس شبکهٔ مشترک — برای NAT شرکت‌ها سقف بالاتر لازم است",
    icon: Globe,
  },
];

/* ============ نشان تعداد ثبت‌نام با رنگ وضعیتی ============ */
function CountBadge({
  count,
  limit,
  exempt,
}: {
  count: number;
  limit: number;
  exempt: boolean;
}) {
  if (exempt) {
    return (
      <Badge
        className="text-[10px] h-5 gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
        title="این کلید از سقف لایهٔ خود معاف است"
      >
        {toPersianDigits(count)} · معاف
      </Badge>
    );
  }
  if (limit > 0 && count >= limit) {
    return (
      <Badge
        className="text-[10px] h-5 bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
        title={`سقف این لایه: ${toPersianDigits(limit)}`}
      >
        {toPersianDigits(count)} · سقف
      </Badge>
    );
  }
  if (limit > 0 && count >= limit - 1) {
    return (
      <Badge
        className="text-[10px] h-5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
        title={`سقف این لایه: ${toPersianDigits(limit)}`}
      >
        {toPersianDigits(count)} · نزدیک سقف
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px] h-5">
      {toPersianDigits(count)}
    </Badge>
  );
}

/* ============ کارت آمار ============ */
function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  sub,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: "emerald" | "rose" | "violet" | "amber";
  sub?: string;
}) {
  const bgCls =
    tone === "emerald"
      ? "bg-emerald-100 dark:bg-emerald-900/30"
      : tone === "rose"
      ? "bg-rose-100 dark:bg-rose-900/30"
      : tone === "violet"
      ? "bg-violet-100 dark:bg-violet-900/30"
      : "bg-amber-100 dark:bg-amber-900/30";
  const textCls =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "rose"
      ? "text-rose-600 dark:text-rose-400"
      : tone === "violet"
      ? "text-violet-600 dark:text-violet-400"
      : "text-amber-600 dark:text-amber-400";
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 shrink-0 rounded-lg flex items-center justify-center ${bgCls}`}>
          <Icon className={`h-5 w-5 ${textCls}`} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
          <p className="text-lg font-bold leading-tight">{value}</p>
          {sub && (
            <p className="text-[10px] text-muted-foreground leading-tight truncate" title={sub}>
              {sub}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ============ تب اصلی ============ */
export function AntiFraudTab({ token }: { token: string }) {
  const { toast } = useToast();

  const [loading, setLoading] = React.useState(true);
  const [guards, setGuards] = React.useState<RegistrationGuardRow[]>([]);
  const [stats, setStats] = React.useState<AntiFraudStats | null>(null);
  const [limits, setLimits] = React.useState<AntiFraudLimits | null>(null);

  // فیلترها
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("all");

  // فرم سقف‌ها (مقادیر متنی برای ویرایش روان)
  const [formEnabled, setFormEnabled] = React.useState(true);
  const [formNums, setFormNums] = React.useState({ device: "0", phone: "0", email: "0", ip: "0" });
  const [savingLimits, setSavingLimits] = React.useState(false);

  // عملیات روی ردیف‌ها
  const [rowBusy, setRowBusy] = React.useState<string | null>(null);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
  const [resetTarget, setResetTarget] = React.useState<RegistrationGuardRow | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<RegistrationGuardRow | null>(null);
  const [noteTarget, setNoteTarget] = React.useState<{ id: string; note: string } | null>(null);

  // جستجو با تأخیر ۳۵۰ میلی‌ثانیه — نه به‌ازای هر کلید
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  const syncForm = (l: AntiFraudLimits) => {
    setFormEnabled(l.enabled);
    setFormNums({
      device: String(l.device),
      phone: String(l.phone),
      email: String(l.email),
      ip: String(l.ip),
    });
  };
  // نکته: syncForm فقط در saveLimits (توابع عادی) استفاده می‌شود؛ داخل useCallback غیر از load

  const load = React.useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const params = new URLSearchParams();
        if (debouncedSearch) params.set("q", debouncedSearch);
        if (typeFilter !== "all") params.set("type", typeFilter);
        params.set("limit", "100");
        const qs = params.toString();
        const res = await apiFetch(`/api/platform/anti-fraud${qs ? `?${qs}` : ""}`, token);
        const json = (await res.json()) as AntiFraudResponse;
        if (!res.ok || !json.success || !json.data) {
          throw new Error(json.error || "خطا در دریافت داده‌های ضدتقلب");
        }
        setGuards(Array.isArray(json.data.guards) ? json.data.guards : []);
        setStats(json.data.stats ?? null);
        if (json.data.limits) {
          const l = json.data.limits;
          setLimits(l);
          // همگام‌سازی فرم با وضعیت زندهٔ سرور (بدون وابستگی به syncForm تا deps کامل بماند)
          setFormEnabled(l.enabled);
          setFormNums({
            device: String(l.device),
            phone: String(l.phone),
            email: String(l.email),
            ip: String(l.ip),
          });
        }
      } catch (e) {
        toast({
          title: "خطا در دریافت داده‌ها",
          description: e instanceof Error ? e.message : "خطای شبکه",
          variant: "destructive",
        });
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [token, toast, debouncedSearch, typeFilter]
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  /* ---- ذخیرهٔ سقف‌ها (PUT) ---- */
  const saveLimits = async () => {
    setSavingLimits(true);
    try {
      const body = {
        enabled: formEnabled,
        device: clampLimit(formNums.device),
        phone: clampLimit(formNums.phone),
        email: clampLimit(formNums.email),
        ip: clampLimit(formNums.ip),
      };
      const res = await apiFetch("/api/platform/anti-fraud", token, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { success?: boolean; error?: string; data?: AntiFraudLimits };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || "خطا در ذخیرهٔ سقف‌ها");
      }
      setLimits(json.data);
      syncForm(json.data);
      toast({
        title: "سقف‌های ثبت‌نام به‌روزرسانی شد",
        description: "از ثبت‌نام بعدی بلافاصله اعمال می‌شود",
      });
    } catch (e) {
      toast({
        title: "خطا در ذخیره",
        description: e instanceof Error ? e.message : "خطای شبکه",
        variant: "destructive",
      });
    } finally {
      setSavingLimits(false);
    }
  };

  /* ---- عملیات روی یک کلید (PATCH) ---- */
  const patchGuard = async (
    id: string,
    body: Record<string, unknown>,
    successMsg: string
  ): Promise<boolean> => {
    setRowBusy(id);
    try {
      const res = await apiFetch(`/api/platform/anti-fraud/${id}`, token, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as GuardMutationResponse;
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در به‌روزرسانی رکورد");
      }
      toast({ title: successMsg });
      await load(true);
      return true;
    } catch (e) {
      toast({
        title: "خطا در عملیات",
        description: e instanceof Error ? e.message : "خطای شبکه",
        variant: "destructive",
      });
      return false;
    } finally {
      setRowBusy(null);
    }
  };

  /* ---- حذف کامل رکورد (DELETE) ---- */
  const deleteGuard = async (id: string): Promise<boolean> => {
    setRowBusy(id);
    try {
      const res = await apiFetch(`/api/platform/anti-fraud/${id}`, token, { method: "DELETE" });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "خطا در حذف رکورد");
      }
      toast({ title: "رکورد با موفقیت حذف شد" });
      await load(true);
      return true;
    } catch (e) {
      toast({
        title: "خطا در حذف",
        description: e instanceof Error ? e.message : "خطای شبکه",
        variant: "destructive",
      });
      return false;
    } finally {
      setRowBusy(null);
    }
  };

  /* ---- کپی کلید ---- */
  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(key);
      toast({ title: "کلید در حافظه کپی شد" });
      window.setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      toast({ title: "کپی ممکن نشد", variant: "destructive" });
    }
  };

  const isDirty =
    !!limits &&
    (limits.enabled !== formEnabled ||
      String(limits.device) !== formNums.device ||
      String(limits.phone) !== formNums.phone ||
      String(limits.email) !== formNums.email ||
      String(limits.ip) !== formNums.ip);

  const byTypeSub =
    stats && stats.byType && stats.byType.length > 0
      ? stats.byType
          .map((t) => `${typeMeta(t.type).label}: ${toPersianDigits(t.keys)}`)
          .join(" · ")
      : undefined;

  return (
    <div className="space-y-4">
      {/* هدر */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            ضدتقلب ثبت‌نام
          </h2>
          <p className="text-[11px] text-muted-foreground">
            مدیریت سقف‌های ثبت‌نام ۴لایه (دستگاه / موبایل / ایمیل / IP)، معافیت‌ها و مسدودسازی
            دستگاه‌های متقلب
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          بروزرسانی
        </Button>
      </div>

      {/* کارت‌های آمار */}
      {loading && !stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="کلیدهای ثبت‌شده"
            value={toPersianDigits(stats?.total ?? 0)}
            icon={ShieldAlert}
            tone="emerald"
            sub={byTypeSub}
          />
          <StatCard
            label="مسدودشده"
            value={toPersianDigits(stats?.blocked ?? 0)}
            icon={Ban}
            tone="rose"
          />
          <StatCard
            label="معاف‌شده"
            value={toPersianDigits(stats?.exempt ?? 0)}
            icon={ShieldCheck}
            tone="violet"
          />
          <StatCard
            label="به‌سقف‌رسیده"
            value={toPersianDigits(stats?.atLimit ?? 0)}
            icon={AlertTriangle}
            tone="amber"
          />
        </div>
      )}

      {/* ویرایشگر سقف‌ها */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            سقف‌های ثبت‌نام
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* توضیح سیستم */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>سد ضدتقلب چگونه کار می‌کند؟</AlertTitle>
            <AlertDescription>
              هر ثبت‌نام در ۴ لایهٔ مستقل شمرده می‌شود: اثر انگشت مرورگر (دستگاه)، شمارهٔ موبایل،
              ایمیل و IP. وقتی شمارندهٔ یک کلید به سقف لایهٔ خود برسد، ثبت‌نام بعدیِ همان کلید رد
              می‌شود. کلیدهای «معاف» هرگز سقفی ندارند (مناسب دستگاه‌های اشتراکی سازمانی) و
              کلیدهای «مسدود» حتی با سقف صفر هم اجازهٔ ثبت‌نام ندارند. مقدار ۰ در هر لایه یعنی
              همان لایه بدون محدودیت است و خاموش‌کردن سویچ زیر، کل سیستم را غیرفعال می‌کند.
            </AlertDescription>
          </Alert>

          {/* سویچ کل سیستم */}
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0">
              <Label htmlFor="af-enabled" className="text-xs">
                فعال‌بودن سد ضدتقلب
              </Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                با خاموش‌کردن، هیچ سقفی روی ثبت‌نام‌ها اعمال نمی‌شود
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge
                className={
                  formEnabled
                    ? "text-[10px] h-5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : "text-[10px] h-5 bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                }
              >
                {formEnabled ? "فعال" : "غیرفعال"}
              </Badge>
              <Switch
                id="af-enabled"
                checked={formEnabled}
                onCheckedChange={setFormEnabled}
                aria-label="فعال‌بودن سد ضدتقلب"
              />
            </div>
          </div>

          {/* ۴ ورودی سقف */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {LIMIT_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`af-${f.key}`} className="text-xs flex items-center gap-1.5">
                  <f.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {f.label}
                </Label>
                <Input
                  id={`af-${f.key}`}
                  type="number"
                  min={0}
                  max={999}
                  inputMode="numeric"
                  value={formNums[f.key]}
                  onChange={(e) =>
                    setFormNums((prev) => ({
                      ...prev,
                      [f.key]: e.target.value.replace(/[^0-9]/g, "").slice(0, 3),
                    }))
                  }
                  disabled={!formEnabled}
                  className="h-9 text-xs disabled:opacity-60"
                  aria-label={f.label}
                />
                <p className="text-[10px] text-muted-foreground">۰ = بدون محدودیت</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => void saveLimits()} disabled={savingLimits || loading}>
              {savingLimits ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              ذخیرهٔ سقف‌ها
            </Button>
            {isDirty && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400">
                تغییرات ذخیره نشده — برای اعمال، ذخیره کنید
              </p>
            )}
            {limits && !isDirty && (
              <p className="text-[10px] text-muted-foreground">
                وضعیت زندهٔ سیستم: {limits.enabled ? "فعال" : "غیرفعال"} — دستگاه{" "}
                {toPersianDigits(limits.device || "∞")} / موبایل {toPersianDigits(limits.phone || "∞")}{" "}
                / ایمیل {toPersianDigits(limits.email || "∞")} / IP {toPersianDigits(limits.ip || "∞")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* جدول کلیدها */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Fingerprint className="h-4 w-4 text-primary" />
            کلیدهای ثبت‌نام
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* فیلترها */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-48 sm:max-w-72">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="جستجوی کلید — مثلاً ۰۹۱۲ یا device:"
                className="h-8 text-xs pr-8"
                aria-label="جستجوی کلید"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 text-xs w-36">
                <SelectValue placeholder="نوع کلید" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه</SelectItem>
                <SelectItem value="device">دستگاه</SelectItem>
                <SelectItem value="phone">موبایل</SelectItem>
                <SelectItem value="email">ایمیل</SelectItem>
                <SelectItem value="ip">IP</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              بروزرسانی
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : guards.length === 0 ? (
            /* حالت خالی */
            <div className="py-10 text-center space-y-2">
              <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-semibold">هیچ کلیدی ثبت نشده است</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                پس از اولین ثبت‌نام‌ها، اثر انگشت دستگاه‌ها، شماره موبایل‌ها، ایمیل‌ها و IPها
                به‌صورت خودکار در این جدول فهرست می‌شوند تا بتوانید سقف‌ها، معافیت‌ها و
                مسدودی‌ها را مدیریت کنید.
              </p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] h-9">نوع</TableHead>
                    <TableHead className="text-[11px] h-9">کلید</TableHead>
                    <TableHead className="text-[11px] h-9">تعداد ثبت‌نام</TableHead>
                    <TableHead className="text-[11px] h-9">آخرین IP</TableHead>
                    <TableHead className="text-[11px] h-9">آخرین فعالیت</TableHead>
                    <TableHead className="text-[11px] h-9">وضعیت</TableHead>
                    <TableHead className="text-[11px] h-9">یادداشت</TableHead>
                    <TableHead className="text-[11px] h-9 w-10">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {guards.map((g) => {
                    const meta = typeMeta(g.guardType);
                    const limit = limitForType(limits, g.guardType);
                    return (
                      <TableRow key={g.id} className={rowBusy === g.id ? "opacity-60" : ""}>
                        {/* نوع */}
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] h-5 gap-1 ${meta.cls}`}
                          >
                            <meta.icon className="h-3 w-3" />
                            {meta.label}
                          </Badge>
                        </TableCell>
                        {/* کلید — کلیک = کپی */}
                        <TableCell className="max-w-44">
                          <button
                            type="button"
                            onClick={() => void copyKey(g.guardKey)}
                            className="flex items-center gap-1 max-w-full text-right group"
                            title={`${g.guardKey} — کلیک برای کپی`}
                            aria-label={`کپی کلید ${g.guardKey}`}
                          >
                            <span
                              dir="ltr"
                              className="font-mono text-[11px] text-muted-foreground group-hover:text-foreground truncate"
                            >
                              {g.guardKey}
                            </span>
                            {copiedKey === g.guardKey ? (
                              <Check className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            ) : null}
                          </button>
                        </TableCell>
                        {/* تعداد */}
                        <TableCell>
                          <CountBadge count={g.count} limit={limit} exempt={g.exempt} />
                        </TableCell>
                        {/* آخرین IP */}
                        <TableCell dir="ltr" className="font-mono text-[11px] max-w-32">
                          <span className="block truncate">{g.lastIp || "—"}</span>
                        </TableCell>
                        {/* آخرین فعالیت */}
                        <TableCell className="text-[11px] whitespace-nowrap">
                          {faDate(g.lastSeen)}
                        </TableCell>
                        {/* وضعیت */}
                        <TableCell>
                          <div className="flex flex-col items-start gap-0.5">
                            {g.blocked && (
                              <Badge className="text-[10px] h-4 bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                                مسدود
                              </Badge>
                            )}
                            {g.exempt && (
                              <Badge className="text-[10px] h-4 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                معاف
                              </Badge>
                            )}
                            {!g.blocked && !g.exempt && (
                              <span className="text-[10px] text-muted-foreground">عادی</span>
                            )}
                          </div>
                        </TableCell>
                        {/* یادداشت */}
                        <TableCell className="max-w-32">
                          <button
                            type="button"
                            onClick={() => setNoteTarget({ id: g.id, note: g.note || "" })}
                            className="max-w-full text-right group"
                            title={g.note ? `${g.note} — کلیک برای ویرایش` : "افزودن یادداشت"}
                            aria-label="ویرایش یادداشت"
                          >
                            {g.note ? (
                              <span className="block text-[11px] text-muted-foreground group-hover:text-foreground truncate">
                                {g.note}
                              </span>
                            ) : (
                              <StickyNote className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-foreground" />
                            )}
                          </button>
                        </TableCell>
                        {/* عملیات */}
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                disabled={rowBusy === g.id}
                                aria-label="عملیات این کلید"
                              >
                                {rowBusy === g.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="h-4 w-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="text-xs">
                              <DropdownMenuItem
                                onClick={() =>
                                  void patchGuard(
                                    g.id,
                                    { exempt: !g.exempt },
                                    g.exempt ? "معافیت لغو شد" : "کلید از سقف معاف شد"
                                  )
                                }
                              >
                                {g.exempt ? (
                                  <ShieldOff className="h-3.5 w-3.5" />
                                ) : (
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                )}
                                {g.exempt ? "لغو معافیت" : "معاف‌کردن از محدودیت"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  void patchGuard(
                                    g.id,
                                    { blocked: !g.blocked },
                                    g.blocked ? "مسدودیت رفع شد" : "کلید مسدود شد"
                                  )
                                }
                              >
                                {g.blocked ? (
                                  <LockOpen className="h-3.5 w-3.5" />
                                ) : (
                                  <Ban className="h-3.5 w-3.5" />
                                )}
                                {g.blocked ? "رفع مسدودیت" : "مسدودسازی دستی"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setResetTarget(g)}>
                                <RotateCcw className="h-3.5 w-3.5" />
                                صفرکردن شمارنده
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setNoteTarget({ id: g.id, note: g.note || "" })}
                              >
                                <StickyNote className="h-3.5 w-3.5" />
                                ویرایش یادداشت
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteTarget(g)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                حذف کامل رکورد
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* راهنمای جدول */}
          {guards.length > 0 && (
            <p className="text-[10px] text-muted-foreground">
              روی هر کلید کلیک کنید تا در حافظه کپی شود. رنگ نشانِ «تعداد ثبت‌نام» وضعیت نسبت به
              سقف را نشان می‌دهد: خاکستری = عادی، کهربایی = نزدیک سقف، سرخ = به سقف رسیده،
              سبز = معاف.
            </p>
          )}
        </CardContent>
      </Card>

      {/* دیالوگ صفرکردن شمارنده */}
      <AlertDialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>صفرکردن شمارندهٔ کلید</AlertDialogTitle>
            <AlertDialogDescription>
              شمارندهٔ ثبت‌نام کلید{" "}
              <span className="font-mono text-[10px] break-all" dir="ltr">
                {resetTarget?.guardKey}
              </span>{" "}
              به صفر برمی‌گردد — سابقهٔ تعداد پاک می‌شود اما وضعیت مسدودی/معافیت و یادداشت باقی
              می‌ماند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!resetTarget) return;
                void patchGuard(resetTarget.id, { resetCount: true }, "شمارنده صفر شد").then(
                  (ok) => {
                    if (ok) setResetTarget(null);
                  }
                );
              }}
            >
              صفرکردن شمارنده
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* دیالوگ حذف کامل */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف کامل رکورد</AlertDialogTitle>
            <AlertDialogDescription>
              رکورد کلید{" "}
              <span className="font-mono text-[10px] break-all" dir="ltr">
                {deleteTarget?.guardKey}
              </span>{" "}
              برای همیشه حذف می‌شود (شمارنده، یادداشت، وضعیت مسدودی و معافیت). اگر کاربر دوباره
              ثبت‌نام کند، کلید از صفر ساخته می‌شود. این عمل قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (!deleteTarget) return;
                void deleteGuard(deleteTarget.id).then((ok) => {
                  if (ok) setDeleteTarget(null);
                });
              }}
            >
              حذف برای همیشه
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* دیالوگ ویرایش یادداشت */}
      <Dialog open={!!noteTarget} onOpenChange={(o) => !o && setNoteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-1.5">
              <StickyNote className="h-4 w-4 text-primary" />
              ویرایش یادداشت کلید
            </DialogTitle>
            <DialogDescription className="text-xs">
              یادداشت فقط برای تیم مدیریت نمایش داده می‌شود — مثلاً «دستگاه اتاق حسابداری — معاف
              شد».
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={noteTarget?.note ?? ""}
            onChange={(e) =>
              setNoteTarget((prev) => (prev ? { ...prev, note: e.target.value } : prev))
            }
            className="text-xs min-h-24"
            placeholder="متن یادداشت…"
            aria-label="متن یادداشت"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setNoteTarget(null)}>
              انصراف
            </Button>
            <Button
              size="sm"
              disabled={rowBusy === noteTarget?.id}
              onClick={() => {
                if (!noteTarget) return;
                void patchGuard(noteTarget.id, { note: noteTarget.note.trim() }, "یادداشت ذخیره شد").then(
                  (ok) => {
                    if (ok) setNoteTarget(null);
                  }
                );
              }}
            >
              {rowBusy === noteTarget?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AntiFraudTab;
