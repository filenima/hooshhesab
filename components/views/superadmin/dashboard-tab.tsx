"use client";

// ============ داشبورد جدید سوپرادمین — نمای ۳۶۰ درجهٔ پلتفرم (FIX 1-3) ============
// جایگزین داشبورد قدیمیِ فقط-StatCard:
// ردیف ۱: ۶ KPI با sparkline هفتگی واقعی (از createdAt رکوردها)
// ردیف ۲: روند ثبت‌نام دورهٔ انتخابی + قیف تبدیل (داده‌های واقعی analytics)
// ردیف ۳: MRR/ARR/Churn (saas-metrics) + دونات سهم پلن‌ها
// ردیف ۴: جریان رخدادهای زنده + چک‌لیست سلامت سرویس‌ها + ۵ سازمان برتر
// همهٔ fetchها موازی با Promise.allSettled + skeleton per-card + refresh دستی.

import * as React from "react";
import {
 AreaChart,
 Area,
 PieChart as RPieChart,
 Pie,
 Cell,
 ResponsiveContainer,
 Tooltip,
 XAxis,
} from "recharts";
import {
 Building2,
 Users as UsersIcon,
 KeyRound,
 Clock,
 TrendingDown,
 Activity,
 AlertTriangle,
 RefreshCw,
 Loader2,
 Zap,
 HeartPulse,
 Server,
 Database,
 ShieldCheck,
 Radio,
 DollarSign,
 ArrowDown,
 FileText,
 Eye,
 Rocket,
 Sparkles,
 UsersRound,
 UserPlus,
 Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { toPersianDigits, formatCompactToman, toJalali, formatNumber } from "@/lib/persian";
import { useToast } from "@/hooks/use-toast";
import { SeoGrowthWidget } from "@/components/views/superadmin/seo-growth-widget";
// R13-3 — مرکز اقدام‌ها: کارت‌های «نیاز به توجه» + اقدامات پرکاربرد (یک fetch واحد)
import { ActionCenter } from "@/components/views/superadmin/action-center";

// ─── انواع ───
interface KpiSparkDatum { day: string; value: number }

interface TrendDatum { day: string; count: number }

interface StatsShape {
 counts?: {
 tenants?: number;
 activeTenants?: number;
 users?: number;
 activeLicenses?: number;
 activeTrials?: number;
 invoices?: number;
 products?: number;
 // FIX(11-D): این دو فیلد در پاسخ واقعی /api/platform/stats وجود دارند
 purchasedLicenses?: number;
 activePurchases?: number;
 auditLogs?: number;
 };
 billing?: { subscriptionRevenueToman?: number; activeSubscriptions?: number; noSalesYet?: boolean };
 planDistribution?: { plan: string; count: number }[];
 recentTenants?: { id: string; name: string; plan: string; status: string; createdAt: string; users: number; invoices: number }[];
 recentLogins?: { id: string; name: string; email: string; lastLogin: string | null; tenant?: string }[];
}

interface UserShape {
 id: string;
 name: string;
 email: string;
 isTrial: boolean;
 createdAt: string;
}

interface TenantShape {
 id: string;
 name: string;
 plan: string;
 status: string;
 createdAt: string;
 counts: { users: number; invoices: number; products: number; parties: number };
 license: { status: string; startDate: string | null; amountToman: number | null } | null;
}

interface AnalyticsShape {
 revenue?: { mrr?: number; arr?: number; growth?: number };
 funnel?: { visitors?: number; signups?: number; trials?: number; conversions?: number };
 users?: { total?: number; active?: number; trial?: number; newThisMonth?: number; churn?: number };
 errors?: { today?: number };
}

interface SaasShape {
 mrrToman?: number;
 arrToman?: number;
 churn?: { ratePct?: number; churnedLast30?: number };
 planDistribution?: { plan: string; planName: string; count: number; pct: number }[];
}

/** FIX(11-D): آمار زمان‌بند بلاگ — مقالات منتشرشده/صف برای KPI جدید */
interface BlogSchedShape {
 stats?: { published?: number; scheduled?: number; drafts?: number; intervalDays?: number; paused?: boolean; nextSlot?: string | null };
}

interface AuditShape {
 id: string;
 action: string;
 entity?: string | null;
 createdAt: string;
 superAdmin?: { username: string } | null;
}

interface HealthShape {
 status?: string;
 memory?: { usedPercent?: number; usedMB?: number; totalMB?: number };
 services?: {
 database?: { status?: string; latencyMs?: number };
 ai?: { status?: string };
 realtime?: { status?: string; port?: number };
 };
 uptimeSeconds?: number;
}

// ─── ثابت‌ها ───
const DAY = 24 * 60 * 60 * 1000;

const PLAN_COLORS: Record<string, string> = {
 free: "hsl(var(--muted-foreground))",
 basic: "hsl(var(--success))",
 pro: "hsl(var(--primary))",
 enterprise: "hsl(var(--warning))",
 mini: "hsl(var(--chart-5))",
};
const PLAN_LABELS: Record<string, string> = {
 free: "رایگان",
 basic: "پایه",
 pro: "حرفه‌ای",
 enterprise: "سازمانی",
 mini: "مینی",
 starter: "استارتر",
 business: "کسب‌وکار",
 accountant: "حسابدار",
};

/** شمار روزهای هفتهٔ اخیر به‌صورت کلیدهای محلی YYYY-MM-DD */
function lastNDays(n: number): string[] {
 const out: string[] = [];
 const now = new Date();
 for (let i = n - 1; i >= 0; i--) {
 const d = new Date(now.getTime() - i * DAY);
 out.push(d.toISOString().slice(0, 10));
 }
 return out;
}

/** bucket کردن رکوردها بر اساس تاریخ (ISO یا timestamp) در n روز اخیر */
function bucketByDay(dates: (string | number | null | undefined)[], n: number): TrendDatum[] {
 const keys = lastNDays(n);
 const map = new Map<string, number>(keys.map((k) => [k, 0]));
 for (const raw of dates) {
 if (!raw) continue;
 const t = typeof raw === "number" ? raw : Date.parse(raw);
 if (!Number.isFinite(t)) continue;
 const key = new Date(t).toISOString().slice(0, 10);
 if (map.has(key)) map.set(key, (map.get(key) || 0) + 1);
 }
 return keys.map((k) => ({ day: k, count: map.get(k) || 0 }));
}

/** جمع مقادیر n روز اخیر برای sparkline */
function sumRecent(dates: (string | number | null | undefined)[], n: number): number {
 const cutoff = Date.now() - n * DAY;
 return dates.filter((raw) => {
 if (!raw) return false;
 const t = typeof raw === "number" ? raw : Date.parse(raw);
 return Number.isFinite(t) && t >= cutoff;
 }).length;
}

// ─── کارت KPI با sparkline ───
function KpiCard({
 icon: Icon,
 label,
 value,
 sub,
 accent,
 spark,
 loading,
}: {
 icon: React.ElementType;
 label: string;
 value: string;
 sub?: string;
 accent: "primary" | "success" | "warning" | "destructive" | "chart5";
 spark?: KpiSparkDatum[];
 loading?: boolean;
}) {
 const accentMap: Record<string, string> = {
 primary: "hsl(var(--primary))",
 success: "hsl(var(--success))",
 warning: "hsl(var(--warning))",
 destructive: "hsl(var(--destructive))",
 chart5: "hsl(var(--chart-5))",
 };
 const color = accentMap[accent];
 const lastVal = spark && spark.length > 0? spark[spark.length - 1].value: 0;
 const firstVal = spark && spark.length >= 7? spark[spark.length - 7].value: spark && spark.length > 0? spark[0].value: 0;
 const rising = lastVal >= firstVal;
 return (
 <Card className="card-hover group relative overflow-hidden border-t-2" style={{ borderTopColor: color }}>
 <CardContent className="p-4 pb-2">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="text-[11px] font-medium text-muted-foreground mb-1.5 truncate">{label}</p>
 {loading? (
 <Skeleton className="h-7 w-20" />
 ): (
 <p className="text-2xl font-extrabold leading-none tracking-tight tnum">{value}</p>
 )}
 {sub && <p className="text-[10px] text-muted-foreground mt-1.5 truncate">{sub}</p>}
 </div>
 <div
 className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110"
 style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
 >
 <Icon className="h-4 w-4" />
 </div>
 </div>
 {/* sparkline هفتگی */}
 <div className="h-12 mt-2 -mx-1">
 {loading? (
 <Skeleton className="h-full w-full" />
 ): (
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart data={spark || []} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
 <defs>
 <linearGradient id={`spark-${accent}`} x1="0" y1="0" x2="0" y2="1">
 <stop offset="0%" stopColor={color} stopOpacity={0.35} />
 <stop offset="100%" stopColor={color} stopOpacity={0.02} />
 </linearGradient>
 </defs>
 <Area
 type="monotone"
 dataKey="value"
 stroke={color}
 strokeWidth={1.6}
 fill={`url(#spark-${accent})`}
 isAnimationActive={false}
 />
 <XAxis dataKey="day" hide />
 <Tooltip
 content={({ active, payload }) => {
 if (active && payload && payload.length) {
 return (
 <div className="rounded-md border border-border bg-popover px-2 py-1 text-[10px] shadow-sm">
 <span className="tnum font-bold">{toPersianDigits(String(payload[0].value))}</span>
 <span className="text-muted-foreground"> در ۲۴ ساعت اخیر</span>
 </div>
 );
 }
 return null;
 }}
 />
 </AreaChart>
 </ResponsiveContainer>
 )}
 </div>
 {!loading && spark && spark.length > 1 && (
 <p className="text-[9px] text-muted-foreground mb-1 flex items-center gap-1">
 {rising? <Activity className="h-2.5 w-2.5 text-success" />: <TrendingDown className="h-2.5 w-2.5 text-muted-foreground" />}
 روند ۷ روز اخیر {rising? "صعودی": "نزولی/ثابت"}
 </p>
 )}
 </CardContent>
 </Card>
 );
}

// ─── چک‌لیست سلامت ───
function HealthRow({ label, ok, detail }: { label: string; ok: boolean | null; detail?: string }) {
 return (
 <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/40 last:border-0">
 <div className="flex items-center gap-2 min-w-0">
 <span
 className={cn(
 "h-2 w-2 rounded-full shrink-0",
 ok === null? "bg-muted-foreground/40": ok? "bg-success animate-pulse": "bg-destructive"
 )}
 />
 <span className="text-xs truncate">{label}</span>
 </div>
 <span className={cn("text-[10px] tnum shrink-0", ok === false? "text-destructive": "text-muted-foreground")}>
 {ok === null? "نامشخص": ok? detail || "سالم": detail || "قطع"}
 </span>
 </div>
 );
}

// ─── حالت خالی دوستانه (R13-3) — برای بخش‌هایی که با دادهٔ صفر خالی می‌مانند ───
function EmptyState({
 icon: Icon,
 title,
 hint,
 ctaLabel,
 onCta,
}: {
 icon: React.ElementType;
 title: string;
 hint: string;
 ctaLabel?: string;
 onCta?: () => void;
}) {
 return (
 <div className="flex h-full flex-col items-center justify-center py-10 text-center gap-2">
 <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
 <Icon className="h-6 w-6" aria-hidden="true" />
 </div>
 <p className="text-xs font-bold text-foreground/80">{title}</p>
 <p className="text-[10px] text-muted-foreground max-w-[300px] leading-relaxed">{hint}</p>
 {ctaLabel && onCta && (
 <Button
 variant="outline"
 size="sm"
 className="h-7 text-[11px] mt-1 border-primary/40 hover:bg-primary/5 hover:text-primary"
 onClick={onCta}
 >
 {ctaLabel}
 </Button>
 )}
 </div>
 );
}

// ─── کامپوننت اصلی ───
export function DashboardTab({
 token,
 onNavigate,
}: {
 token: string;
 onNavigate?: (tab: string) => void;
}) {
 const { toast } = useToast();
 const [range, setRange] = React.useState<"7" | "30" | "90">("30");
 const [loading, setLoading] = React.useState(true);
 const [refreshing, setRefreshing] = React.useState(false);
 const [fetchedAt, setFetchedAt] = React.useState<Date | null>(null);
 const [seoBusy, setSeoBusy] = React.useState<"" | "rebuild" | "reindex">("");

 const [stats, setStats] = React.useState<StatsShape | null>(null);
 const [users, setUsers] = React.useState<UserShape[]>([]);
 const [tenants, setTenants] = React.useState<TenantShape[]>([]);
 const [errors, setErrors] = React.useState<{ createdAt: string }[]>([]);
 const [analytics, setAnalytics] = React.useState<AnalyticsShape | null>(null);
 const [saas, setSaas] = React.useState<SaasShape | null>(null);
 const [audit, setAudit] = React.useState<AuditShape[]>([]);
 const [health, setHealth] = React.useState<HealthShape | null>(null);
 const [blogSched, setBlogSched] = React.useState<BlogSchedShape | null>(null);
 const [miniServices, setMiniServices] = React.useState<Record<string, boolean | null>>({
 modian: null,
 chat: null,
 audit: null,
 seo: null,
 });

 const load = React.useCallback(async () => {
 setRefreshing(true);
 try {
 const auth = { headers: { Authorization: `Bearer ${token}` } };
 const [rStats, rUsers, rTenants, rErrors, rAnalytics, rSaas, rAudit, rHealth, rBlog] = await Promise.allSettled([
 fetch("/api/platform/stats", auth),
 fetch("/api/platform/users?take=500", auth),
 fetch("/api/platform/tenants", auth),
 fetch("/api/platform/errors?limit=200", auth),
 fetch("/api/platform/analytics", auth),
 fetch("/api/platform/saas-metrics", auth),
 fetch("/api/platform/audit?limit=5", auth),
 fetch("/api/health/detailed", auth),
 fetch("/api/platform/blog/scheduler", auth),
 ]);

 if (rBlog.status === "fulfilled" && rBlog.value.ok) {
 const j = await rBlog.value.json().catch(() => null);
 if (j?.success) setBlogSched(j.data);
 }

 if (rStats.status === "fulfilled" && rStats.value.ok) {
 const j = await rStats.value.json().catch(() => null);
 if (j?.success) setStats(j.data);
 }
 if (rUsers.status === "fulfilled" && rUsers.value.ok) {
 const j = await rUsers.value.json().catch(() => null);
 if (j?.success && Array.isArray(j.data)) setUsers(j.data);
 }
 if (rTenants.status === "fulfilled" && rTenants.value.ok) {
 const j = await rTenants.value.json().catch(() => null);
 if (j?.success && Array.isArray(j.data)) setTenants(j.data);
 }
 if (rErrors.status === "fulfilled" && rErrors.value.ok) {
 const j = await rErrors.value.json().catch(() => null);
 if (j?.success && Array.isArray(j.data)) setErrors(j.data);
 }
 if (rAnalytics.status === "fulfilled" && rAnalytics.value.ok) {
 const j = await rAnalytics.value.json().catch(() => null);
 if (j?.success) setAnalytics(j.data);
 }
 if (rSaas.status === "fulfilled" && rSaas.value.ok) {
 const j = await rSaas.value.json().catch(() => null);
 if (j?.success) setSaas(j.data);
 }
 if (rAudit.status === "fulfilled" && rAudit.value.ok) {
 const j = await rAudit.value.json().catch(() => null);
 if (j?.success && Array.isArray(j.data)) setAudit(j.data);
 }
 if (rHealth.status === "fulfilled" && rHealth.value.ok) {
 const j = await rHealth.value.json().catch(() => null);
 if (j && typeof j === "object") setHealth(j);
 }

 // چک زندهٔ mini-serviceها از طریق گیت‌وی (XTransformPort) — هر پاسخی یعنی زنده
 const probe = async (port: number) => {
 try {
 const res = await fetch(`/?XTransformPort=${port}`, { signal: AbortSignal.timeout(4000) });
 return res.ok || res.status < 500;
 } catch {
 return false;
 }
 };
 const [m, c, a, s] = await Promise.all([
 probe(3031), probe(3032), probe(3034), probe(3035),
 ]);
 setMiniServices({ modian: m, chat: c, audit: a, seo: s });

 setFetchedAt(new Date());
 } finally {
 setLoading(false);
 setRefreshing(false);
 }
 }, [token]);

 React.useEffect(() => {
 void load();
 }, [load]);

 // ─── اقدامات سریع (11-D): بازسازی فایل‌های سئو + ایندکس فوری ───
 const runSeoAction = React.useCallback(
 async (action: "rebuild" | "reindex") => {
 setSeoBusy(action);
 try {
 const res = await fetch("/api/platform/seo-files", {
 method: "POST",
 headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
 body: JSON.stringify({ action }),
 });
 const j = (await res.json().catch(() => null)) as { success?: boolean; message?: string; error?: string } | null;
 if (j?.success) {
 toast({ title: action === "rebuild" ? "بازسازی سئو انجام شد" : "اعلان ایندکس ارسال شد", description: j.message || "" });
 void load();
 } else {
 toast({ title: "خطا", description: j?.error || "عملیات ناموفق بود", variant: "destructive" });
 }
 } catch {
 toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
 } finally {
 setSeoBusy("");
 }
 },
 [token, toast, load]
 );

 // ─── محاسبات sparkline (۷ روز) و روند ───
 const userDates = React.useMemo(() => users.map((u) => u.createdAt), [users]);
 const trialDates = React.useMemo(() => users.filter((u) => u.isTrial).map((u) => u.createdAt), [users]);
 const tenantDates = React.useMemo(() => tenants.map((t) => t.createdAt), [tenants]);
 const licenseDates = React.useMemo(
 () => tenants.filter((t) => t.license?.status === "ACTIVE").map((t) => t.license?.startDate || t.createdAt),
 [tenants]
 );
 const revenueDates = React.useMemo(
 () =>
 tenants
 .filter((t) => t.license?.status === "ACTIVE" && t.license?.amountToman)
 .map((t) => ({ d: t.license?.startDate || t.createdAt, v: t.license?.amountToman || 0 })),
 [tenants]
 );
 const errorDates = React.useMemo(() => errors.map((e) => e.createdAt), [errors]);

 const sparkUsers = React.useMemo(() => bucketByDay(userDates, 7).map((d) => ({ day: d.day, value: d.count })), [userDates]);
 const sparkTenants = React.useMemo(() => bucketByDay(tenantDates, 7).map((d) => ({ day: d.day, value: d.count })), [tenantDates]);
 const sparkTrials = React.useMemo(() => bucketByDay(trialDates, 7).map((d) => ({ day: d.day, value: d.count })), [trialDates]);
 const sparkLicenses = React.useMemo(() => bucketByDay(licenseDates, 7).map((d) => ({ day: d.day, value: d.count })), [licenseDates]);
 const sparkRevenue = React.useMemo(() => {
 const buckets = bucketByDay(revenueDates.map((r) => r.d), 7);
 return buckets.map((b, i) => ({ day: b.day, value: revenueDates.filter((r) => r.d && new Date(r.d).toISOString().slice(0, 10) === b.day).reduce((s, r) => s + r.v, 0) || buckets[i].count * 0 }));
 }, [revenueDates]);
 const sparkErrors = React.useMemo(() => bucketByDay(errorDates, 7).map((d) => ({ day: d.day, value: d.count })), [errorDates]);

 // روند ثبت‌نام در بازهٔ انتخابی
 const trendData = React.useMemo(() => bucketByDay(userDates, Number(range)), [userDates, range]);
 // R13-3: مجموع ثبت‌نام‌های بازه — برای حالت خالی دوستانه
 const trendTotal = React.useMemo(() => trendData.reduce((s, d) => s + d.count, 0), [trendData]);

 // KPI ها
 const c = stats?.counts || {};
 const activeLicenses = tenants.filter((t) => t.license?.status === "ACTIVE").length;
 const activeTenants = tenants.filter((t) => t.status === "active").length;
 const trialCount = users.filter((u) => u.isTrial).length;
 const monthRevenue = stats?.billing?.subscriptionRevenueToman || analytics?.revenue?.mrr || saas?.mrrToman || 0;
 const todayErrors = analytics?.errors?.today?? sumRecent(errorDates, 1);

 // FIX(11-D): قیف با مقادیر پیش‌فرض ادغام می‌شود تا فیلدهای optional باعث
 // خطای «possibly undefined» نشوند (TS18048).
 const funnel = { visitors: 0, signups: 0, trials: 0, conversions: 0, ...(analytics?.funnel || {}) };
 const visitors = funnel.visitors;
 const activeUsers = analytics?.users?.active ?? users.length;
 const publishedArticles = blogSched?.stats?.published ?? 0;
 const scheduledArticles = blogSched?.stats?.scheduled ?? 0;
 const funnelSteps = [
 { label: "بازدید احراز‌شده", value: funnel.visitors || 0, color: "hsl(var(--primary))" },
 { label: "ثبت‌نام", value: funnel.signups || 0, color: "hsl(var(--chart-5))" },
 { label: "تریال", value: funnel.trials || 0, color: "hsl(var(--warning))" },
 { label: "خرید لایسنس", value: funnel.conversions || 0, color: "hsl(var(--success))" },
 ];
 const maxFunnel = Math.max(1, ...funnelSteps.map((s) => s.value));
 // R13-3: جمع قیف — برای حالت خالی دوستانه
 const funnelTotal = funnelSteps.reduce((s, f) => s + f.value, 0);

 // دونات پلن‌ها
 const planData = React.useMemo(() => {
 const dist = saas?.planDistribution || (stats?.planDistribution || []).map((p) => ({
 plan: p.plan,
 planName: PLAN_LABELS[p.plan] || p.plan,
 count: p.count,
 pct: 0,
 }));
 return dist.filter((p) => p.count > 0);
 }, [saas, stats]);

 // ۵ سازمان برتر بر اساس فاکتور
 const topTenants = React.useMemo(
 () => [...tenants].sort((a, b) => (b.counts?.invoices || 0) - (a.counts?.invoices || 0)).slice(0, 5),
 [tenants]
 );

 const rangeDays = Number(range);

 return (
 <div className="space-y-5">
 {/* ─── مرکز اقدام‌ها (R13-3) — کارت‌های نیاز به توجه + اقدامات پرکاربرد ─── */}
 <ActionCenter token={token} onNavigate={onNavigate} />

 {/* نوار بالا: بازه + رفرش */}
 <div className="flex flex-wrap items-center justify-between gap-2">
 <div className="flex items-center gap-2">
 <ToggleGroup
 type="single"
 value={range}
 onValueChange={(v) => v && setRange(v as "7" | "30" | "90")}
 variant="outline"
 size="sm"
 className="gap-1"
 >
 <ToggleGroupItem value="7" className="text-xs h-8 px-3">۷ روز</ToggleGroupItem>
 <ToggleGroupItem value="30" className="text-xs h-8 px-3">۳۰ روز</ToggleGroupItem>
 <ToggleGroupItem value="90" className="text-xs h-8 px-3">۹۰ روز</ToggleGroupItem>
 </ToggleGroup>
 <Badge variant="outline" className="text-[10px]">
 بازهٔ روند: {toPersianDigits(rangeDays)} روز
 </Badge>
 </div>
 <div className="flex items-center gap-2">
 {fetchedAt && (
 <span className="text-[10px] text-muted-foreground tnum hidden sm:inline">
 آخرین به‌روزرسانی: {fetchedAt.toLocaleTimeString("fa-IR")}
 </span>
 )}
 <Button variant="outline" size="sm" className="h-8" onClick={() => void load()} disabled={refreshing}>
 {refreshing? <Loader2 className="h-3.5 w-3.5 animate-spin" />: <RefreshCw className="h-3.5 w-3.5" />}
 به‌روزرسانی
 </Button>
 </div>
 </div>

 {/* ─── ردیف اقدامات سریع (11-D) ─── */}
 <Card className="border-primary/20 bg-gradient-to-l from-primary/[0.04] to-transparent">
 <CardContent className="flex flex-wrap items-center gap-2 p-4">
 <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground me-1">
 <Rocket className="h-3.5 w-3.5 text-primary" />
 اقدامات سریع:
 </span>
 <Button
 size="sm"
 variant="outline"
 className="gap-1.5 border-primary/40 hover:bg-primary/5 hover:text-primary"
 disabled={seoBusy !== ""}
 onClick={() => void runSeoAction("rebuild")}
 >
 {seoBusy === "rebuild" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
 بازسازی سئو
 </Button>
 <Button
 size="sm"
 variant="outline"
 className="gap-1.5 border-primary/40 hover:bg-primary/5 hover:text-primary"
 disabled={seoBusy !== ""}
 onClick={() => void runSeoAction("reindex")}
 >
 {seoBusy === "reindex" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
 ایندکس فوری
 </Button>
 {onNavigate && (
 <>
 <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onNavigate("blog-editor")}>
 <FileText className="h-3.5 w-3.5" />
 ساخت وبلاگ
 </Button>
 <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onNavigate("users")}>
 <UsersRound className="h-3.5 w-3.5" />
 مدیریت کاربران
 </Button>
 <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onNavigate("seo-growth")}>
 <Activity className="h-3.5 w-3.5" />
 سئو و رشد
 </Button>
 </>
 )}
 </CardContent>
 </Card>

 {/* ─── ردیف ۱: ۸ KPI با sparkline ─── */}
 <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
 <KpiCard icon={UsersIcon} label="کاربران فعال" value={toPersianDigits(activeUsers)} sub={`${toPersianDigits(sumRecent(userDates, 7))} نفر در ۷ روز`} accent="chart5" spark={sparkUsers} loading={loading} />
 <KpiCard icon={Building2} label="سازمان‌های فعال" value={toPersianDigits(activeTenants)} sub={`از ${toPersianDigits(c.tenants ?? tenants.length)} سازمان`} accent="primary" spark={sparkTenants} loading={loading} />
 <KpiCard icon={DollarSign} label="درآمد ماه (MRR)" value={formatCompactToman(monthRevenue)} sub={stats?.billing?.noSalesYet ? "هنوز فروشی ثبت نشده" : "فروش واقعی لایسنس"} accent="primary" spark={sparkRevenue} loading={loading} />
 <KpiCard icon={KeyRound} label="لایسنس‌های فعال" value={toPersianDigits(activeLicenses || c.activeLicenses || 0)} sub={`خرید: ${toPersianDigits(c.activePurchases ?? 0)}`} accent="success" spark={sparkLicenses} loading={loading} />
 <KpiCard icon={FileText} label="مقالات منتشرشده" value={toPersianDigits(publishedArticles)} sub={`${toPersianDigits(scheduledArticles)} مقاله در صف انتشار`} accent="chart5" loading={loading} />
 <KpiCard icon={Eye} label="بازدید احراز‌شده" value={toPersianDigits(visitors)} sub={visitors > 0 ? "مجموع دورهٔ اخیر" : "هنوز بازدیدی ثبت نشده"} accent="primary" loading={loading} />
 <KpiCard icon={Clock} label="تریال‌های جاری" value={toPersianDigits(trialCount)} sub="در انتظار ارتقا" accent="warning" spark={sparkTrials} loading={loading} />
 <KpiCard icon={AlertTriangle} label="خطاهای امروز" value={toPersianDigits(todayErrors)} sub={`${toPersianDigits(sumRecent(errorDates, 7))} در ۷ روز`} accent={todayErrors > 0? "destructive": "success"} spark={sparkErrors} loading={loading} />
 </div>

 {/* ─── ردیف ۲: روند ثبت‌نام + قیف ─── */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
 <Card className="lg:col-span-2">
 <CardHeader className="pb-2">
 <CardTitle className="text-sm flex items-center gap-2">
 <Activity className="h-4 w-4 text-primary" />
 روند ثبت‌نام کاربران — {toPersianDigits(rangeDays)} روز اخیر
 </CardTitle>
 <CardDescription className="text-xs">تعداد کاربران تازه‌ثبت‌نام‌شده در هر روز</CardDescription>
 </CardHeader>
 <CardContent className="h-56">
 {loading? (
 <Skeleton className="h-full w-full" />
 ): trendTotal === 0? (
 <EmptyState
 icon={UserPlus}
 title="هنوز ثبت‌نامی ندارید"
 hint="لینک دعوت یا کمپین پیامکی را از تب «پیام‌های گروهی» بفرستید؛ با اولین ثبت‌نام واقعی، روند اینجا رسم می‌شود."
 ctaLabel="ارسال پیام گروهی"
 onCta={onNavigate? () => onNavigate("messaging"): undefined}
 />
 ): (
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart data={trendData} margin={{ top: 5, right: 8, left: 8, bottom: 0 }}>
 <defs>
 <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
 <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
 <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
 </linearGradient>
 </defs>
 <XAxis
 dataKey="day"
 tick={{ fontSize: 10 }}
 tickFormatter={(v: string) => toJalali(new Date(v)).slice(5)}
 interval="preserveStartEnd"
 minTickGap={24}
 axisLine={false}
 tickLine={false}
 />
 <Tooltip
 content={({ active, payload, label }) => {
 if (active && payload?.length) {
 return (
 <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-sm">
 <p className="font-medium mb-0.5">{label? toJalali(new Date(label)): ""}</p>
 <p className="tnum">{toPersianDigits(String(payload[0].value))} ثبت‌نام</p>
 </div>
 );
 }
 return null;
 }}
 />
 <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#trendFill)" />
 </AreaChart>
 </ResponsiveContainer>
 )}
 </CardContent>
 </Card>

 {/* قیف تبدیل */}
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm flex items-center gap-2">
 <ArrowDown className="h-4 w-4 text-primary" />
 قیف تبدیل
 </CardTitle>
 <CardDescription className="text-xs">بازدید احراز‌شده تا خرید واقعی</CardDescription>
 </CardHeader>
 <CardContent className="space-y-3">
 {loading
? [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-full" />)
: funnelTotal === 0
? <EmptyState
 icon={Filter}
 title="قیف تبدیل هنوز خالی است"
 hint="پس از اولین بازدیدها و ثبت‌نام‌ها، نرخ تبدیل هر مرحله به‌صورت واقعی اینجا محاسبه می‌شود."
 ctaLabel="مشاهدهٔ تحلیل‌ها"
 onCta={onNavigate? () => onNavigate("analytics"): undefined}
 />
: funnelSteps.map((s) => (
 <div key={s.label} className="space-y-1">
 <div className="flex items-center justify-between text-xs">
 <span className="text-muted-foreground">{s.label}</span>
 <span className="font-bold tnum">{formatNumber(s.value)}</span>
 </div>
 <div className="h-6 rounded-md bg-muted overflow-hidden relative">
 <div
 className="h-full rounded-md transition-all duration-700"
 style={{
 width: `${Math.max((s.value / maxFunnel) * 100, s.value > 0? 4: 0)}%`,
 backgroundColor: s.color,
 opacity: 0.85,
 }}
 />
 </div>
 </div>
 ))}
 {!loading && (funnel.signups || 0) > 0 && (
 <p className="text-[10px] text-muted-foreground text-center pt-1">
 نرخ تبدیل تریال به خرید:{" "}
 <span className="font-bold tnum">
 {toPersianDigits(funnel.trials > 0? Math.round(((funnel.conversions || 0) / funnel.trials) * 100): 0)}٪
 </span>
 </p>
 )}
 </CardContent>
 </Card>
 </div>

 {/* ─── ردیف ۳: MRR/ARR/Churn + دونات پلن‌ها ─── */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 content-start">
 <Card className="card-hover">
 <CardContent className="p-4">
 <p className="text-[11px] text-muted-foreground mb-1">MRR (درآمد ماهانه)</p>
 {loading? (
 <Skeleton className="h-7 w-24" />
 ): (
 <p className="text-xl font-extrabold text-primary tnum">{formatCompactToman(saas?.mrrToman ?? analytics?.revenue?.mrr ?? 0)}</p>
 )}
 <p className="text-[10px] text-muted-foreground mt-1">
 رشد ماهانه: {toPersianDigits(Math.round(analytics?.revenue?.growth ?? 0))}٪
 </p>
 </CardContent>
 </Card>
 <Card className="card-hover">
 <CardContent className="p-4">
 <p className="text-[11px] text-muted-foreground mb-1">ARR (درآمد سالانه)</p>
 {loading? (
 <Skeleton className="h-7 w-24" />
 ): (
 <p className="text-xl font-extrabold text-success tnum">{formatCompactToman(saas?.arrToman ?? analytics?.revenue?.arr ?? 0)}</p>
 )}
 <p className="text-[10px] text-muted-foreground mt-1">رویش تکرارشونده</p>
 </CardContent>
 </Card>
 <Card className="card-hover">
 <CardContent className="p-4">
 <p className="text-[11px] text-muted-foreground mb-1">Churn (ریزش)</p>
 {loading? (
 <Skeleton className="h-7 w-24" />
 ): (
 <p className="text-xl font-extrabold text-warning tnum">
 {toPersianDigits(Number((saas?.churn?.ratePct ?? analytics?.users?.churn ?? 0).toFixed(1)))}٪
 </p>
 )}
 <p className="text-[10px] text-muted-foreground mt-1">
 {toPersianDigits(saas?.churn?.churnedLast30 ?? 0)} خروج در ۳۰ روز
 </p>
 </CardContent>
 </Card>
 </div>

 {/* دونات سهم پلن‌ها */}
 <Card className="lg:col-span-2">
 <CardHeader className="pb-2">
 <CardTitle className="text-sm flex items-center gap-2">
 <Building2 className="h-4 w-4 text-primary" />
 سهم پلن‌ها از سازمان‌ها
 </CardTitle>
 </CardHeader>
 <CardContent>
 {loading? (
 <Skeleton className="h-48 w-full" />
 ): planData.length === 0? (
 <EmptyState
 icon={Building2}
 title="هنوز سازمانی ثبت نشده"
 hint="با اولین ثبت‌نام کاربر، سازمان او خودکار ساخته می‌شود و سهم پلن‌ها اینجا رسم می‌شود."
 ctaLabel="مدیریت سازمان‌ها"
 onCta={onNavigate? () => onNavigate("tenants"): undefined}
 />
 ): (
 <div className="flex flex-col sm:flex-row items-center gap-4">
 <div className="h-48 w-48 shrink-0">
 <ResponsiveContainer width="100%" height="100%">
 <RPieChart>
 <Pie
 data={planData}
 dataKey="count"
 nameKey="planName"
 innerRadius="58%"
 outerRadius="88%"
 paddingAngle={3}
 strokeWidth={0}
 >
 {planData.map((p) => (
 <Cell key={p.plan} fill={PLAN_COLORS[p.plan] || "hsl(var(--chart-2))"} />
 ))}
 </Pie>
 <Tooltip
 content={({ active, payload }) => {
 if (active && payload?.length) {
 const p = payload[0];
 return (
 <div className="rounded-md border border-border bg-popover px-3 py-1.5 text-xs shadow-sm">
 {p.name}: <span className="font-bold tnum">{formatNumber(Number(p.value))}</span>
 </div>
 );
 }
 return null;
 }}
 />
 </RPieChart>
 </ResponsiveContainer>
 </div>
 <div className="flex-1 w-full space-y-1.5">
 {planData.map((p) => (
 <div key={p.plan} className="flex items-center justify-between text-xs">
 <div className="flex items-center gap-2 min-w-0">
 <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: PLAN_COLORS[p.plan] || "hsl(var(--chart-2))" }} />
 <span className="truncate">{p.planName || PLAN_LABELS[p.plan] || p.plan}</span>
 </div>
 <span className="text-muted-foreground tnum shrink-0">
 {formatNumber(p.count)} سازمان · {toPersianDigits(p.pct ?? 0)}٪
 </span>
 </div>
 ))}
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 </div>

 {/* ─── ردیف ۴: رخدادهای زنده + سلامت + برترین‌ها ─── */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
 {/* جریان رخدادها */}
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm flex items-center gap-2">
 <Radio className="h-4 w-4 text-primary" />
 جریان رخدادهای مدیریتی
 </CardTitle>
 <CardDescription className="text-xs">۵ رخداد آخر لاگ ممیزی پلتفرم</CardDescription>
 </CardHeader>
 <CardContent className="space-y-2">
 {loading
? [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-full" />)
: audit.length === 0
? <p className="text-xs text-muted-foreground text-center py-8">رخدادی ثبت نشده است</p>
: audit.map((a) => (
 <div key={a.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/50 transition-colors">
 <Avatar className="h-7 w-7">
 <AvatarFallback className="bg-primary/10 text-primary text-[9px]">
 {(a.superAdmin?.username || "سیستم").slice(0, 2)}
 </AvatarFallback>
 </Avatar>
 <div className="min-w-0 flex-1">
 <p className="text-[11px] font-medium truncate" dir="ltr">{a.action}</p>
 <p className="text-[9px] text-muted-foreground">
 {a.superAdmin?.username || "سیستم"}
 {a.entity? ` · ${a.entity}`: ""}
 </p>
 </div>
 <span className="text-[9px] text-muted-foreground tnum shrink-0">{toJalali(new Date(a.createdAt))}</span>
 </div>
 ))}
 {onNavigate && (
 <Button
 variant="ghost"
 size="sm"
 className="w-full text-primary text-xs h-7"
 onClick={() => onNavigate("audit")}
 >
 مشاهدهٔ کامل لاگ ممیزی
 </Button>
 )}
 </CardContent>
 </Card>

 {/* چک‌لیست سلامت */}
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm flex items-center gap-2">
 <HeartPulse className="h-4 w-4 text-primary" />
 چک‌لیست سلامت سرویس‌ها
 </CardTitle>
 <CardDescription className="text-xs">وضعیت لحظه‌ای زیرساخت پلتفرم</CardDescription>
 </CardHeader>
 <CardContent>
 {loading? (
 <div className="space-y-2">{[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
 ): (
 <>
 <HealthRow
 label="دیتابیس SQLite"
 ok={health?.services?.database?.status === "up"}
 detail={`تأخیر ${toPersianDigits(health?.services?.database?.latencyMs ?? 0)}ms`}
 />
 <HealthRow
 label="سرویس هوش مصنوعی (۳۰۳۲)"
 ok={health?.services?.ai?.status === "up"}
 detail={health?.services?.ai?.status === "up"? "فعال": "قطع"}
 />
 <HealthRow
 label="Realtime چت (۳۰۳۲)"
 ok={health?.services?.realtime?.status === "up"}
 detail={health?.services?.realtime?.port? `پورت ${toPersianDigits(health.services.realtime.port)}`: "فعال"}
 />
 <HealthRow label="مودیان مک (۳۰۳۱)" ok={miniServices.modian} />
 <HealthRow label="پخش رخداد (۳۰۳۴)" ok={miniServices.audit} />
 <HealthRow label="موتور سئو (۳۰۳۵)" ok={miniServices.seo} />
 <HealthRow
 label="حافظهٔ سرور"
 ok={(health?.memory?.usedPercent ?? 0) < 85}
 detail={`${toPersianDigits(Math.round(health?.memory?.usedPercent ?? 0))}٪ استفاده`}
 />
 </>
 )}
 </CardContent>
 </Card>

 {/* ۵ سازمان برتر */}
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm flex items-center gap-2">
 <Building2 className="h-4 w-4 text-primary" />
 پرکاربردترین سازمان‌ها
 </CardTitle>
 <CardDescription className="text-xs">بر اساس تعداد فاکتور صادرشده</CardDescription>
 </CardHeader>
 <CardContent className="space-y-2">
 {loading
? [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-full" />)
: topTenants.length === 0
? <EmptyState
 icon={Building2}
 title="سازمانی برای نمایش نیست"
 hint="پرکاربردترین سازمان‌ها بر اساس تعداد فاکتور، پس از اولین فعالیت کاربران اینجا ظاهر می‌شوند."
 ctaLabel="مدیریت کاربران"
 onCta={onNavigate? () => onNavigate("users"): undefined}
 />
: topTenants.map((t, i) => (
 <div key={t.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted/50 transition-colors">
 <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold tnum shrink-0">
 {toPersianDigits(i + 1)}
 </span>
 <div className="min-w-0 flex-1">
 <p className="text-[11px] font-medium truncate">{t.name}</p>
 <p className="text-[9px] text-muted-foreground tnum">
 {toPersianDigits(t.counts?.users ?? 0)} کاربر · {toPersianDigits(t.counts?.products ?? 0)} کالا
 </p>
 </div>
 <Badge variant="outline" className="text-[9px] tnum shrink-0">
 <Zap className="h-2.5 w-2.5 me-0.5" />
 {toPersianDigits(t.counts?.invoices ?? 0)}
 </Badge>
 </div>
 ))}
 </CardContent>
 </Card>
 </div>

 {/* ورودهای اخیر */}
 <Card>
 <CardHeader className="pb-2">
 <CardTitle className="text-sm flex items-center gap-2">
 <UsersIcon className="h-4 w-4 text-primary" />
 آخرین ورودهای کاربران
 </CardTitle>
 </CardHeader>
 <CardContent>
 {loading? (
 <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
 {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
 </div>
 ): (stats?.recentLogins || []).length === 0? (
 <p className="text-xs text-muted-foreground text-center py-6">ورودی ثبت نشده است</p>
 ): (
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
 {stats?.recentLogins?.slice(0, 6).map((u) => (
 <div key={u.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/50 transition-colors">
 <Avatar className="h-8 w-8">
 <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-bold">
 {u.name?.slice(0, 2) || "؟"}
 </AvatarFallback>
 </Avatar>
 <div className="min-w-0 flex-1">
 <p className="text-xs font-medium truncate">{u.name || "—"}</p>
 <p className="text-[10px] text-muted-foreground truncate" dir="ltr">{u.email}</p>
 </div>
 <div className="text-end shrink-0">
 {u.tenant && <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">{u.tenant}</p>}
 {u.lastLogin && (
 <p className="text-[10px] text-muted-foreground tnum">{toJalali(new Date(u.lastLogin))}</p>
 )}
 </div>
 </div>
 ))}
 </div>
 )}
 </CardContent>
 </Card>

 {/* ─── ردیف ۵ (v37): ویجت رشد سئو ─── */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
 <SeoGrowthWidget />
 </div>

 {/* فوتر: نسخه/برچسب */}
 <div className="flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
 <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> داده‌های این داشبورد صددرصد واقعی هستند</span>
 <span className="flex items-center gap-1"><Server className="h-3 w-3" /> بدون هیچ دادهٔ نمایشی</span>
 <span className="flex items-center gap-1"><Database className="h-3 w-3" /> به‌روزرسانی دستی با دکمهٔ بالا</span>
 </div>
 </div>
 );
}
