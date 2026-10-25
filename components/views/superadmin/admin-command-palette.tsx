"use client";

// ============ پالت فرمان سوپرادمین (FIX 1-4) — Cmd/Ctrl+K ============
// جستجوی هر ۷۳ تب + اکشن‌های سریع (ورود فوری به سازمان، پاک‌سازی کش سئو،
// انتشار مقالهٔ بعدی، رفتن به ساخت لایسنس). فارسی، RTL، گروه‌بندی‌شده.

import * as React from "react";
import {
 CommandDialog,
 CommandInput,
 CommandList,
 CommandEmpty,
 CommandGroup,
 CommandItem,
 CommandSeparator,
} from "@/components/ui/command";
import {
 Search,
 Zap,
 KeyRound,
 RefreshCcw,
 Newspaper,
 ArrowLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { toPersianDigits } from "@/lib/persian";

export interface PaletteNavItem {
 value: string;
 label: string;
 group: string;
}

export function AdminCommandPalette({
 open,
 onOpenChange,
 token,
 navItems,
 tenants,
 onNavigate,
 onQuickLogin,
}: {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 token: string;
 navItems: PaletteNavItem[];
 tenants: { id: string; name: string }[];
 onNavigate: (tab: string) => void;
 onQuickLogin: (token: string, tenantName?: string) => void;
}) {
 const { toast } = useToast();
 const [busy, setBusy] = React.useState<string | null>(null);

 const run = async (id: string, fn: () => Promise<void>) => {
 setBusy(id);
 try {
 await fn();
 } finally {
 setBusy(null);
 }
 };

 // اکشن: پاک‌سازی کامل کش سئو (همان revalidate که دکمه‌های GOD می‌زنند)
 const clearSeoCache = () =>
 run("seo-cache", async () => {
 const res = await fetch("/api/seo/revalidate", {
 method: "POST",
 headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
 body: JSON.stringify({ tag: "all" }),
 });
 const json = await res.json().catch(() => ({}));
 if (!res.ok ||!json.success) throw new Error(json.error || `کد ${res.status}`);
 toast({
 title: "کش سئو پاک شد",
 description: `${toPersianDigits(String((json.data?.revalidatedPaths?.length?? 0) + (json.data?.revalidatedTags?.length?? 0)))} مسیر/تگ تازه‌سازی شد`,
 });
 });

 // اکشن: انتشار فوری مقالهٔ بعدیِ سررسیده (کرانتِ صف بلاگ)
 const publishNext = () =>
 run("publish-next", async () => {
 const res = await fetch("/api/cron/publish-scheduled?autoschedule=1", { method: "POST" });
 const json = await res.json().catch(() => ({}));
 if (!res.ok) throw new Error(json.error || `کد ${res.status}`);
 toast({
 title: "صف انتشار اجرا شد",
 description: json.message || "اگر مقالهٔ سررسیده‌ای در صف باشد منتشر شد (حداکثر ۱ مورد)",
 });
 });

 // اکشن: ورود فوری به سازمان
 const quickLogin = (tenantId: string, name: string) =>
 run(`login-${tenantId}`, async () => {
 const res = await fetch("/api/platform/quick-login", {
 method: "POST",
 headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
 body: JSON.stringify({ tenantId }),
 });
 const json = await res.json().catch(() => ({}));
 if (!res.ok ||!json.success ||!json.token) {
 throw new Error(json.error || "ورود فوری ناموفق بود");
 }
 toast({ title: "ورود فوری انجام شد", description: `به «${name}» وارد شدید` });
 onOpenChange(false);
 onQuickLogin(json.token, name);
 });

 const handleTab = (value: string) => {
 onNavigate(value);
 onOpenChange(false);
 };

 return (
 <CommandDialog open={open} onOpenChange={onOpenChange}>
 <CommandInput placeholder="جستجوی تب یا اکشن… (مثلاً: لایسنس، اقساط، کش)" />
 <CommandList className="max-h-[60vh]">
 <CommandEmpty>چیزی یافت نشد</CommandEmpty>

 {/* ─── اکشن‌های سریع ─── */}
 <CommandGroup heading="اکشن‌های سریع">
 <CommandItem onSelect={() => void clearSeoCache()} disabled={busy === "seo-cache"}>
 <RefreshCcw className="h-4 w-4 me-2 text-primary" />
 پاک‌سازی کش سئو و صفحات
 {busy === "seo-cache" && <span className="text-[10px] text-muted-foreground ms-1">در حال اجرا…</span>}
 </CommandItem>
 <CommandItem onSelect={() => void publishNext()} disabled={busy === "publish-next"}>
 <Newspaper className="h-4 w-4 me-2 text-primary" />
 انتشار مقالهٔ بعدی صف بلاگ
 {busy === "publish-next" && <span className="text-[10px] text-muted-foreground ms-1">در حال اجرا…</span>}
 </CommandItem>
 <CommandItem onSelect={() => handleTab("licenses")}>
 <KeyRound className="h-4 w-4 me-2 text-primary" />
 ساخت لایسنس جدید
 <span className="text-[10px] text-muted-foreground ms-auto me-2">رفتن به تب لایسنس‌ها</span>
 <ArrowLeft className="h-3 w-3 text-muted-foreground" />
 </CommandItem>
 </CommandGroup>

 <CommandSeparator />

 {/* ─── ورود فوری به سازمان ─── */}
 {tenants.length > 0 && (
 <CommandGroup heading="ورود فوری به سازمان">
 {tenants.slice(0, 12).map((t) => (
 <CommandItem
 key={t.id}
 value={`ورود فوری ${t.name}`}
 onSelect={() => void quickLogin(t.id, t.name)}
 disabled={busy === `login-${t.id}`}
 >
 <Zap className="h-4 w-4 me-2 text-warning" />
 ورود فوری به «{t.name}»
 </CommandItem>
 ))}
 </CommandGroup>
 )}

 <CommandSeparator />

 {/* ─── ناوبری تب‌ها (۷۳ تب) ─── */}
 <CommandGroup heading="رفتن به تب">
 {navItems.map((it) => (
 <CommandItem key={it.value} value={`${it.label} ${it.value}`} onSelect={() => handleTab(it.value)}>
 <Search className="h-3.5 w-3.5 me-2 text-muted-foreground" />
 {it.label}
 <span className="text-[9px] text-muted-foreground ms-auto me-2">{it.group}</span>
 <ArrowLeft className="h-3 w-3 text-muted-foreground" />
 </CommandItem>
 ))}
 </CommandGroup>
 </CommandList>
 </CommandDialog>
 );
}
