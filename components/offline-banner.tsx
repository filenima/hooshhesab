"use client";

/**
 * OfflineBanner → v35 «نشانگر مینیمال وضعیت اتصال»
 * ============================================================
 * درخواست مالک:
 *  - هیچ «ارور آفلاین هستید» نشان نده — همه‌چیز باید آفلاین هم کار کند
 *  - برگشت اینترنت: پیام مینیمالِ جذاب «به اینترنت متصل شدید، در حال همگام‌سازی»
 *    → پایان همگام‌سازی → محو خودکار
 *
 * طراحی: pill شیشه‌ای کوچک گوشهٔ پایین — non-blocking، ظریف، framer-motion.
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, RefreshCw, CheckCircle2, CloudUpload, ServerCrash, Wifi } from "lucide-react";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { toPersianDigits } from "@/lib/persian";

type Mode = "offline" | "syncing" | "synced" | "pending" | "server-down" | "hidden";

export function OfflineBanner({ token }: { token: string | null }) {
  const { isOnline, serverOffline, pendingCount, syncing, syncNow } = useOfflineSync(token);

  const [mode, setMode] = React.useState<Mode>("hidden");
  const [justCameOnline, setJustCameOnline] = React.useState(false);
  const prevOnlineRef = React.useRef<boolean | null>(null);
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // تشخیص لحظهٔ اتصال مجدد
  React.useEffect(() => {
    const prev = prevOnlineRef.current;
    prevOnlineRef.current = isOnline;
    if (prev === false && isOnline) {
      setJustCameOnline(true);
      const t = setTimeout(() => setJustCameOnline(false), 8000);
      return () => clearTimeout(t);
    }
  }, [isOnline]);

  // ماشین حالت مینیمال
  React.useEffect(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }

    if (!isOnline) {
      setMode("offline");
      return;
    }
    if (serverOffline) {
      setMode("server-down");
      return;
    }
    if (justCameOnline) {
      setMode(syncing ? "syncing" : "synced");
      if (!syncing) {
        // همگام‌سازی سریع تمام شد → محو بعد از ۲ ثانیه
        hideTimer.current = setTimeout(() => setMode("hidden"), 2000);
      }
      return;
    }
    if (pendingCount > 0) {
      setMode("pending");
      return;
    }
    setMode("hidden");
  }, [isOnline, serverOffline, justCameOnline, syncing, pendingCount]);

  // وقتی syncing از true به false رفت (پایان همگام‌سازی پس از اتصال) → synced → محو
  const prevSyncing = React.useRef(false);
  React.useEffect(() => {
    if (prevSyncing.current && !syncing && isOnline) {
      setJustCameOnline(true); // ادامهٔ نمایش چرخهٔ همگام‌سازی
      setMode("synced");
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        setMode("hidden");
        setJustCameOnline(false);
      }, 2200);
    }
    prevSyncing.current = syncing;
  }, [syncing, isOnline]);

  const visible = mode !== "hidden";

  const cfg: Record<
    Exclude<Mode, "hidden">,
    { icon: React.ReactNode; box: string; text: string; sub?: string; onClick?: () => void }
  > = {
    offline: {
      icon: <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />,
      box: "bg-amber-50/95 dark:bg-amber-950/85 border-amber-200/80 dark:border-amber-800/60 text-amber-800 dark:text-amber-200",
      text: "حالت آفلاین",
      sub: "همه‌چیز در دسترس — تغییرات ذخیره محلی می‌شوند",
    },
    syncing: {
      icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />,
      box: "bg-emerald-50/95 dark:bg-emerald-950/85 border-emerald-200/80 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200",
      text: "به اینترنت متصل شدید — در حال همگام‌سازی",
      sub: "چند لحظه صبر کنید…",
    },
    synced: {
      icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />,
      box: "bg-emerald-50/95 dark:bg-emerald-950/85 border-emerald-200/80 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200",
      text: "همگام‌سازی کامل شد",
    },
    pending: {
      icon: <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />,
      box: "bg-sky-50/95 dark:bg-sky-950/85 border-sky-200/80 dark:border-sky-800/60 text-sky-800 dark:text-sky-200",
      text: `${toPersianDigits(pendingCount)} تغییر در صف همگام‌سازی`,
      sub: "خودکار ارسال می‌شوند",
      onClick: () => void syncNow(),
    },
    "server-down": {
      icon: <ServerCrash className="h-3.5 w-3.5" aria-hidden="true" />,
      box: "bg-orange-50/95 dark:bg-orange-950/85 border-orange-200/80 dark:border-orange-800/60 text-orange-800 dark:text-orange-200",
      text: "سرور پاسخ نمی‌دهد — داده‌های ذخیره‌شده در دسترس است",
      sub: "بازگشت سرور را هر ۲۰ ثانیه دنبال می‌کنیم",
    },
  };

  const styles = cfg[mode as Exclude<Mode, "hidden">];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 24, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 24, opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          className="fixed bottom-4 left-4 z-[60] pointer-events-none print:hidden"
          role="status"
          aria-live="polite"
        >
          <div
            onClick={styles.onClick}
            className={`pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border px-3.5 py-2 shadow-lg shadow-black/5 backdrop-blur-md transition-shadow ${
              styles.box
            } ${styles.onClick ? "cursor-pointer hover:shadow-md" : ""}`}
          >
            {styles.icon}
            <div className="min-w-0 text-right" dir="rtl">
              <p className="whitespace-nowrap text-[11px] font-bold leading-tight">{styles.text}</p>
              {styles.sub && (
                <p className="hidden whitespace-nowrap text-[9px] leading-tight opacity-75 sm:block">
                  {styles.sub}
                </p>
              )}
            </div>
            {pendingCount > 0 && mode !== "pending" && (
              <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-black/10 px-1 text-[9px] font-bold tabular-nums dark:bg-white/10">
                {toPersianDigits(pendingCount)}
              </span>
            )}
            {mode === "offline" && (
              <Wifi className="hidden h-3 w-3 opacity-40 sm:block" aria-hidden="true" />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default OfflineBanner;
