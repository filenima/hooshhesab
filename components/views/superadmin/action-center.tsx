"use client";

// ════════════════════════════════════════════════════════════════
// مرکز اقدام‌ها (R13-3) — قلب داشبورد سوپرادمین
// ردیف کارت‌های «نیاز به توجه» با شمارندهٔ واقعی از یک فراخوانی
// واحد: GET /api/platform/action-center (جمع‌آوری سمت سرور با count).
// + نوار «اقدامات پرکاربرد» برای پرش یک‌کلیکی به تب‌های اصلی.
// همهٔ اعداد واقعی‌اند — صفر یعنی صفر؛ هیچ دادهٔ نمایشی نیست.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import {
        Ticket as TicketIcon,
        Bug as BugIcon,
        Hourglass,
        AlertTriangle,
        Newspaper,
        ShieldAlert,
        CheckCircle2,
        RefreshCw,
        Loader2,
        ChevronLeft,
        Zap,
        Mail,
        CircleDot,
        FileText,
        Brain,
        Database,
        Inbox,
        HardDrive,
        type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toPersianDigits, toJalali } from "@/lib/persian";

// ─── انواع ───
interface ActionCenterData {
        ticketsOpen: number;
        bugReportsPending: number;
        trialsExpiringSoon: number;
        trialsExpired: number;
        errorsToday: number;
        scheduledPosts: number;
        antiFraudAtLimit: number;
        dbSizeBytes: number | null;
        generatedAt: string;
}

/** لهجهٔ رنگی هر کارت — فقط متغیرهای تم (بدون آبی/ایندیگو) */
type Accent = "warning" | "destructive" | "chart5" | "primary";

const ACCENT_COLOR: Record<Accent, string> = {
        warning: "hsl(var(--warning))",
        destructive: "hsl(var(--destructive))",
        chart5: "hsl(var(--chart-5))",
        primary: "hsl(var(--primary))",
};

interface AttentionCard {
        key: keyof Pick<
                ActionCenterData,
                "ticketsOpen" | "bugReportsPending" | "trialsExpiringSoon" | "errorsToday" | "scheduledPosts" | "antiFraudAtLimit"
        >;
        label: string;
        sub: string;
        tab: string;
        icon: LucideIcon;
        accent: Accent;
}

/** ۶ کارتِ نیاز به توجه — مقدار tab با SIDEBAR_Nav پنل تطبیق داده شده:
 *  صف انتشار بلاگ داخل تب «ویرایشگر بلاگ» رندر می‌شود (BlogSchedulerPanel). */
const ATTENTION_CARDS: AttentionCard[] = [
        {
                key: "ticketsOpen",
                label: "تیکت‌های باز",
                sub: "در انتظار پاسخ شما",
                tab: "tickets",
                icon: TicketIcon,
                accent: "warning",
        },
        {
                key: "bugReportsPending",
                label: "گزارش‌های باگ بررسی‌نشده",
                sub: "گزارش کاربران در صف بررسی",
                tab: "bug-reports",
                icon: BugIcon,
                accent: "destructive",
        },
        {
                key: "trialsExpiringSoon",
                label: "تریال‌های در حال انقضا",
                sub: "۳ روز یا کمتر مانده",
                tab: "users",
                icon: Hourglass,
                accent: "chart5",
        },
        {
                key: "errorsToday",
                label: "خطاهای امروز",
                sub: "از نیمه‌شب تهران",
                tab: "errors",
                icon: AlertTriangle,
                accent: "destructive",
        },
        {
                key: "scheduledPosts",
                label: "مقالات در صف انتشار",
                sub: "زمان‌بند انتشار بلاگ",
                tab: "blog-editor",
                icon: Newspaper,
                accent: "primary",
        },
        {
                key: "antiFraudAtLimit",
                label: "کلیدهای ثبت‌نام به سقف رسیده",
                sub: "سقف ضدتقلب پر شده",
                tab: "anti-fraud",
                icon: ShieldAlert,
                accent: "warning",
        },
];

/** اقدامات پرکاربرد — پرش مستقیم به تب‌های اصلی */
const QUICK_ACTIONS: { label: string; tab: string; icon: LucideIcon }[] = [
        { label: "وبلاگ جدید", tab: "blog-editor", icon: Newspaper },
        { label: "پیام گروهی", tab: "messaging", icon: Mail },
        { label: "کاربران آنلاین", tab: "online-users", icon: CircleDot },
        { label: "بازسازی فایل‌های سئو", tab: "sitemap-files", icon: FileText },
        { label: "تنظیمات هوش مصنوعی", tab: "ai-settings", icon: Brain },
        { label: "پشتیبان‌گیری", tab: "backups", icon: Database },
];

// ─── ابزارها ───
/** حجم بایت → متن فارسی خوانا (کیلوبایت/مگابایت/گیگابایت) */
function formatBytesFa(bytes: number): string {
        if (bytes >= 1024 * 1024 * 1024) {
                return `${toPersianDigits((bytes / (1024 * 1024 * 1024)).toFixed(1))} گیگابایت`;
        }
        if (bytes >= 1024 * 1024) {
                return `${toPersianDigits(Math.round(bytes / (1024 * 1024)))} مگابایت`;
        }
        if (bytes >= 1024) {
                return `${toPersianDigits(Math.round(bytes / 1024))} کیلوبایت`;
        }
        return `${toPersianDigits(bytes)} بایت`;
}

/** ساعت و تاریخ شمسیِ آخرین به‌روزرسانی */
function formatRefreshedAt(d: Date): string {
        return `${toJalali(d)} — ${toPersianDigits(
                d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })
        )}`;
}

// ─── کارت نیاز به توجه ───
function AttentionItem({
        card,
        count,
        loading,
        onNavigate,
}: {
        card: AttentionCard;
        count: number;
        loading: boolean;
        onNavigate?: (tab: string) => void;
}) {
        const Icon = card.icon;
        const color = ACCENT_COLOR[card.accent];
        const hasItems = count > 0;

        if (loading) {
                return (
                        <div className="min-w-[200px] sm:min-w-[224px] shrink-0 rounded-xl border border-border bg-card p-4">
                                <div className="flex items-center gap-2 mb-3">
                                        <SkeletonBox className="h-8 w-8 rounded-lg" />
                                        <SkeletonBox className="h-3 w-24" />
                                </div>
                                <SkeletonBox className="h-8 w-14 mb-2" />
                                <SkeletonBox className="h-2.5 w-28" />
                        </div>
                );
        }

        return (
                <button
                        type="button"
                        disabled={!onNavigate}
                        onClick={() => onNavigate?.(card.tab)}
                        className={cn(
                                "group relative min-w-[200px] sm:min-w-[224px] shrink-0 text-right rounded-xl border p-4 transition-all duration-300",
                                "hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                hasItems
                                        ? "border-transparent shadow-sm hover:shadow-md cursor-pointer"
                                        : "border-dashed border-border/70 bg-muted/30 cursor-default opacity-80"
                        )}
                        style={
                                hasItems
                                        ? {
                                                        backgroundColor: `color-mix(in srgb, ${color} 7%, var(--card))`,
                                                        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
                                                }
                                        : undefined
                        }
                        aria-label={`${card.label}: ${toPersianDigits(count)}`}
                >
                        {/* ردیف آیکون + نقطهٔ ضربان‌دار */}
                        <div className="flex items-center justify-between mb-3">
                                <span
                                        className="flex h-8 w-8 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110"
                                        style={
                                                hasItems
                                                        ? { backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, color }
                                                        : undefined
                                        }
                                >
                                        <Icon className="h-4 w-4 text-muted-foreground" style={hasItems ? { color } : undefined} />
                                </span>
                                {hasItems ? (
                                        <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                                                <span
                                                        className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping"
                                                        style={{ backgroundColor: color }}
                                                />
                                                <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                                        </span>
                                ) : (
                                        <CheckCircle2 className="h-4 w-4 text-success/70" aria-hidden="true" />
                                )}
                        </div>

                        {/* شمارنده */}
                        <p className={cn("text-3xl font-extrabold leading-none tracking-tight tnum mb-1.5", !hasItems && "text-muted-foreground/70")}>
                                {toPersianDigits(count)}
                        </p>

                        {/* برچسب + توضیح */}
                        <p className={cn("text-xs font-bold truncate", hasItems ? "text-foreground" : "text-muted-foreground")}>
                                {card.label}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                {hasItems ? card.sub : "موردی نیاز به توجه ندارد"}
                        </p>

                        {/* CTA یک‌کلیکی */}
                        {hasItems && onNavigate && (
                                <span
                                        className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold transition-all group-hover:gap-1.5"
                                        style={{ color }}
                                >
                                        بررسی و اقدام
                                        <ChevronLeft className="h-3 w-3" aria-hidden="true" />
                                </span>
                        )}
                </button>
        );
}

/** اسکلتون سبک — محلی تا وابستگی جدیدی به UI اضافه نشود */
function SkeletonBox({ className }: { className?: string }) {
        return <div className={cn("animate-pulse rounded-md bg-muted", className)} aria-hidden="true" />;
}

// ═══════════════ کامپوننت اصلی ═══════════════
export function ActionCenter({
        token,
        onNavigate,
}: {
        token: string;
        onNavigate?: (tab: string) => void;
}) {
        const [data, setData] = React.useState<ActionCenterData | null>(null);
        const [loading, setLoading] = React.useState(true);
        const [refreshing, setRefreshing] = React.useState(false);
        const [error, setError] = React.useState(false);
        const [refreshedAt, setRefreshedAt] = React.useState<Date | null>(null);
        const fetchedAtRef = React.useRef<number>(0);
        const hasDataRef = React.useRef(false);

        // یک فراخوانی واحد — سمت سرور با count() جمع می‌شود؛ هرگز پرتاب نمی‌کند
        const load = React.useCallback(async () => {
                // اسکلتون فقط بار اول؛ رفرش دستی دادهٔ قبلی را نگه می‌دارد (بدون فلش)
                if (!hasDataRef.current) setLoading(true);
                setRefreshing(true);
                try {
                        const res = await fetch("/api/platform/action-center", {
                                headers: { Authorization: `Bearer ${token}` },
                        });
                        const json = (await res.json().catch(() => null)) as { success?: boolean; data?: ActionCenterData } | null;
                        if (json?.success && json.data) {
                                setData(json.data);
                                setError(false);
                                setRefreshedAt(new Date());
                                fetchedAtRef.current = Date.now();
                                hasDataRef.current = true;
                        } else {
                                setError(true);
                        }
                } catch {
                        setError(true);
                } finally {
                        setLoading(false);
                        setRefreshing(false);
                }
        }, [token]);

        React.useEffect(() => {
                void load();
        }, [load]);

        // رفرش خودکار هنگام بازگشت به تب مرورگر اگر داده قدیمی است (>۲ دقیقه)
        React.useEffect(() => {
                const onVisible = () => {
                        if (document.visibilityState === "visible" && Date.now() - fetchedAtRef.current > 120_000) {
                                void load();
                        }
                };
                document.addEventListener("visibilitychange", onVisible);
                return () => document.removeEventListener("visibilitychange", onVisible);
        }, [load]);

        // مجموع موارد نیازمند توجه + دسترسی سریع
        const attentionTotal = React.useMemo(
                () =>
                        data
                                ? ATTENTION_CARDS.reduce((sum, c) => sum + Math.max(0, Number(data[c.key]) || 0), 0)
                                : 0,
                [data]
        );

        const hasAnyAttention = attentionTotal > 0;

        return (
                <section aria-label="مرکز اقدام‌ها" className="space-y-3">
                        {/* ─── سربرگ: عنوان + جمع‌بندی + رفرش ─── */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                                                <Inbox className="h-4 w-4" aria-hidden="true" />
                                        </span>
                                        <div className="min-w-0">
                                                <h2 className="text-sm font-extrabold leading-tight">مرکز اقدام‌ها</h2>
                                                {loading ? (
                                                        <SkeletonBox className="h-2.5 w-36 mt-1" />
                                                ) : error ? (
                                                        <p className="text-[10px] text-destructive">دریافت شمارنده‌ها ناموفق بود</p>
                                                ) : hasAnyAttention ? (
                                                        <p className="text-[10px] text-warning font-bold mt-0.5">
                                                                {toPersianDigits(attentionTotal)} مورد نیاز به توجه دارد
                                                        </p>
                                                ) : (
                                                        <p className="text-[10px] text-success font-bold mt-0.5 flex items-center gap-1">
                                                                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                                                همه‌چیز مرتب است — موردی نیاز به توجه ندارد
                                                        </p>
                                                )}
                                        </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                        {/* حجم دیتابیس — واقعی از action-center */}
                                        {data?.dbSizeBytes != null && (
                                                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/60 border border-border rounded-full px-2.5 h-6 tnum">
                                                        <HardDrive className="h-3 w-3" aria-hidden="true" />
                                                        حجم دیتابیس: {formatBytesFa(data.dbSizeBytes)}
                                                </span>
                                        )}
                                        {refreshedAt && (
                                                <span className="hidden md:inline text-[10px] text-muted-foreground tnum">
                                                        آخرین به‌روزرسانی: {formatRefreshedAt(refreshedAt)}
                                                </span>
                                        )}
                                        <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-2.5 text-[11px] gap-1.5"
                                                onClick={() => void load()}
                                                disabled={refreshing}
                                                aria-label="به‌روزرسانی مرکز اقدام‌ها"
                                        >
                                                {refreshing ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3 w-3" aria-hidden="true" />}
                                                به‌روزرسانی
                                        </Button>
                                </div>
                        </div>

                        {/* ─── ردیف کارت‌ها — اسکرول افقی ─── */}
                        <div
                                className="flex gap-3 overflow-x-auto pb-1.5 -mx-1 px-1 snap-x"
                                style={{ scrollbarWidth: "thin" }}
                                role="list"
                                aria-label="کارتهای نیاز به توجه"
                        >
                                {error && !loading && !data ? (
                                        <div className="w-full rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-4 flex items-center justify-between gap-3">
                                                <p className="text-xs text-destructive">شمارنده‌ها دریافت نشد — اتصال سرور را بررسی کنید.</p>
                                                <Button variant="outline" size="sm" className="h-7 shrink-0" onClick={() => void load()}>
                                                        تلاش دوباره
                                                </Button>
                                        </div>
                                ) : (
                                        ATTENTION_CARDS.map((card) => (
                                                <div key={card.key} role="listitem" className="contents">
                                                        <AttentionItem
                                                                card={card}
                                                                count={data ? Math.max(0, Number(data[card.key]) || 0) : 0}
                                                                loading={loading || (!data && !error)}
                                                                onNavigate={onNavigate}
                                                        />
                                                </div>
                                        ))
                                )}
                        </div>

                        {/* ─── نوار اقدامات پرکاربرد ─── */}
                        {onNavigate && (
                                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2.5">
                                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground me-1 shrink-0">
                                                <Zap className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                                                اقدامات پرکاربرد:
                                        </span>
                                        {QUICK_ACTIONS.map((qa) => {
                                                const Icon = qa.icon;
                                                return (
                                                        <Button
                                                                key={qa.tab}
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 px-3 text-[11px] gap-1.5 transition-all hover:-translate-y-px hover:border-primary/40 hover:text-primary hover:bg-primary/5"
                                                                onClick={() => onNavigate(qa.tab)}
                                                        >
                                                                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                                                                {qa.label}
                                                        </Button>
                                                );
                                        })}
                                </div>
                        )}
                </section>
        );
}
