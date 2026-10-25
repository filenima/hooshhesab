"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { SentryProvider } from "@/components/sentry-provider";
import { SentryErrorBoundary } from "@/components/sentry-error-boundary";
import { ThemeApplier } from "@/components/theme-applier";
// v35 — interceptor آفلاین: صف‌کردن خودکار موتاسیون‌ها هنگام قطع اینترنت
import { installOfflineFetch } from "@/lib/offline-fetch";
// v36 — تخلیهٔ صف آفلاین سراسری: از هر صفحه‌ای (بلاگ، پادکست، مستندات و…)
import { useOfflineSync } from "@/hooks/use-offline-sync";

// ============ Dynamic import برای کاهش مصرف حافظه کامپایل ============
// مهم (سئو): فقط ServiceWorkerRegister به‌صورت ssr:false بارگذاری می‌شود.
// SentryProvider و SentryErrorBoundary import استاتیک دارند — هر دو کامپوننت
// سبک کلاینت هستند (init داخل useEffect انجام می‌شود) و برای SSR ایمن‌اند.
// با این تغییر، {children} سرور-رندر می‌ماند و HTML اولیه برای کرالرها کامل است.
const ServiceWorkerRegister = dynamic(
 () => import("@/components/sw-register").then((m) => ({ default: m.ServiceWorkerRegister })),
 { ssr: false, loading: () => <span className="sr-only">در حال بارگذاری...</span> }
);

/**
 * GlobalOfflineSync — v36: تخلیهٔ صف آفلاین در «همهٔ» صفحات
 * ============================================================================
 * قبلاً syncNow فقط داخل اپ لاگین‌شده (app-shell/داشبورد) مونت بود و اگر کاربر
 * مثلاً روی /blog یا /api-docs اینترنتش برمی‌گشت، صف تخلیه نمی‌شد. این
 * کامپوننت در سطح layout سراسری است و:
 *  - با رویداد online (خودکار داخل useOfflineSync) صف را تخلیه می‌کند
 *  - هر ۵ دقیقه یک‌بار (وقتی آنلاین است) دوباره می‌کوشد
 *  - به پیام FORCE_SYNC سرویس‌ورکر (Background Sync tag hoosh-bg-sync) پاسخ می‌دهد
 *  - گارد singleton داخل flushQueueOnce تضمین می‌کند چند mount همزمان
 *    فقط «یک» تخلیهٔ واقعی انجام دهند
 * توکن از localStorage خوانده می‌شود (مثل هر درخواست احراز‌شدهٔ دیگر) تا
 * بازپخش صف در صفحات عمومی هم Authorization داشته باشد.
 */
function GlobalOfflineSync() {
 const { syncNow } = useOfflineSync(null);

 React.useEffect(() => {
  const iv = setInterval(() => {
   if (navigator.onLine) void syncNow();
  }, 5 * 60 * 1000);
  return () => clearInterval(iv);
 }, [syncNow]);

 return null;
}

/**
 * SyncFlushRefresher — v36: listener سراسری رویداد hoosh:sync-flush
 * ============================================================================
 * بعد از تخلیهٔ موفق صف (بازگشت اینترنت):
 *  ۱) کش API سرویس‌ورکر باطل می‌شود (پیام hoosh-clear-api-cache)
 *  ۲) router.refresh() — دادهٔ سرور-رندرِ صفحهٔ فعلی دوباره fetch می‌شود
 *     (کش‌های client مثل TanStack Query هم خودشان روی همین رویداد تازه می‌شوند)
 * نتیجه: UI خودش تازه می‌شود — بدون رفرش دستی. صفحات فقط «fetch خودشان» را
 * دوباره اجرا می‌کنند و هیچ navigate سخت‌گیرانه‌ای اتفاق نمی‌افتد.
 */
function SyncFlushRefresher() {
 const router = useRouter();

 React.useEffect(() => {
  const onFlush = () => {
   try {
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
     navigator.serviceWorker.controller.postMessage("hoosh-clear-api-cache");
    }
   } catch {}
   // تازه‌سازی نرمِ دادهٔ صفحهٔ فعلی (بدون reload کامل مرورگر)
   try {
    router.refresh();
   } catch {}
  };
  window.addEventListener("hoosh:sync-flush", onFlush);
  return () => window.removeEventListener("hoosh:sync-flush", onFlush);
 }, [router]);

 return null;
}

/**
 * AppProviders — wrapper اصلی برای تمام providerهای application
 * شامل: Sentry ErrorBoundary، ThemeProvider، Sentry، ServiceWorker،
 * همگام‌سازی آفلاین سراسری (v36)
 *
 * ساختار: children بیرون از هر dynamic ssr:false قرار دارد تا
 * محتوای SSR صفحات (H1، متن، لینک‌ها) در HTML اولیه حفظ شود.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
 // نصب interceptor آفلاین — یک‌بار در عمر اپ (ساید-افکت ماژول-لِوُل ایمن نیست، پس در رندر اول)
 React.useEffect(() => {
  installOfflineFetch();
 }, []);
 return (
 <SentryErrorBoundary>
 <NextThemesProvider attribute="class" defaultTheme="light" enableSystem>
 {/* اعمال تم ظاهری ذخیره‌شده (hoosh_theme) روی <html data-theme> */}
 <ThemeApplier />
 {children}
 <GlobalOfflineSync />
 <SyncFlushRefresher />
 <ServiceWorkerRegister />
 <SentryProvider>
 <Toaster />
 <SonnerToaster richColors position="top-center" dir="rtl" />
 </SentryProvider>
 </NextThemesProvider>
 </SentryErrorBoundary>
 );
}
