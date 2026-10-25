"use client";

/**
 * PwaInstallPrompt — بنر «نصب اپ هوش» (v35.6 — نقشهٔ راه ۶-۲)
 * =====================================================================
 * تجربهٔ نصب PWA برای کاربران موبایل/دسکتاپ:
 *
 * - رویداد beforeinstallprompt را می‌گیرد (Chrome/Edge/اندروید) و بنر
 *   پایین صفحه با دکمهٔ «نصب» نشان می‌دهد؛ کلیک → prompt() بومی مرورگر.
 * - iOS Safari رویداد بالا را ندارد → بنر آموزشی «اشتراک‌گذاری → افزودن
 *   به صفحهٔ اصلی» (فقط در iOS و فقط اگر قبلاً رد نشده باشد).
 * - اگر اپ از قبل نصب باشد (display-mode: standalone) هرگز نشان نمی‌دهد.
 * - رد کردن: localStorage + ۷ روز مهلت — مزاحم کاربر نمی‌شود.
 * - تأخیر نمایش ۱۲ ثانیه پس از ورود (اول تجربه، بعد پیشنهاد).
 * - فقط در ویوپورت ≤ lg نشان می‌دهد؟ خیر — دسکتاپ هم نصب PWA دارد؛
 *   اما متن دسکتاپی مجزا («نصب روی همین کامپیوتر») می‌دهد.
 * - انیمیشن ورود slide+fade با framer-motion (هم‌سبک OfflineBanner).
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Share, PlusSquare, X, Smartphone, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "hoosh_pwa_install_dismissed_at";
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // ۷ روز
const SHOW_DELAY_MS = 12 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof window === "undefined" || !window.navigator) return false;
  const ua = window.navigator.userAgent;
  // iPadOS خودش را به‌شکل مک معرفی می‌کند — باز هم Mac Touch دار
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document);
}

export function PwaInstallPrompt() {
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(true); // تا بررسی localStorage پیش‌فرض مخفی
  const [installed, setInstalled] = React.useState(false);
  const [ios, setIos] = React.useState(false);
  const [installing, setInstalling] = React.useState(false);

  // راه‌اندازی: listen + حالت‌ها
  React.useEffect(() => {
    // از قبل نصب شده — هیچ‌وقت نشان نده
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    // قبلاً رد شده — هنوز داخل مهلت ۷روزه است؟
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
      setDismissed(Date.now() - at < DISMISS_COOLDOWN_MS);
    } catch {
      setDismissed(false);
    }
    setIos(isIOS());

    const onBip = (e: Event) => {
      e.preventDefault(); // جلوگیری از mini-infobar خود مرورگر — تجربهٔ خودمان را نشان می‌دهیم
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setVisible(false);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // نمایش با تأخیر — فقط اگر: نصب‌شدنی (یا iOS) + ردنشده + نصب‌نشده
  React.useEffect(() => {
    if (installed || dismissed) return;
    const eligible = !!deferred || ios;
    if (!eligible) return;
    const t = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [deferred, ios, installed, dismissed]);

  const dismiss = React.useCallback((forever?: boolean) => {
    setVisible(false);
    if (forever) {
      setDismissed(true);
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch {
        /* private mode */
      }
    }
  }, []);

  const installNow = React.useCallback(async () => {
    if (!deferred) return;
    setInstalling(true);
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setVisible(false);
      }
      // رد کردن از خود پرومپت بومی — بنر ما بعد از آن بسته می‌شود (این بارِ برای همیشه نه)
    } catch {
      /* پرومپت بومی در دسترس نیست */
    } finally {
      setDeferred(null); // یک‌بارمصرف
      setInstalling(false);
    }
  }, [deferred]);

  if (installed || !visible) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.aside
          initial={{ y: 90, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 90, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          role="dialog"
          aria-label="نصب اپلیکیشن هوش"
          className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-lg sm:inset-x-6 sm:bottom-6"
        >
          <div className="relative overflow-hidden rounded-2xl border border-emerald-300/70 bg-gradient-to-l from-emerald-50 via-teal-50 to-emerald-50 p-4 shadow-xl shadow-emerald-900/10 backdrop-blur dark:border-emerald-800/70 dark:from-emerald-950/90 dark:via-teal-950/80 dark:to-emerald-950/90">
            {/* بافت نقطه‌ای */}
            <div
              className="pointer-events-none absolute inset-0 opacity-30 dark:opacity-15"
              style={{
                backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
                backgroundSize: "16px 16px",
                color: "rgb(16 185 129 / 0.10)",
              }}
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={() => dismiss(true)}
              aria-label="بستن پیشنهاد نصب (۷ روز دیگر نمایش داده نمی‌شود)"
              className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="relative flex items-center gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-400 text-white shadow-md shadow-emerald-500/25"
                aria-hidden="true"
              >
                {ios ? <Smartphone className="h-5 w-5" /> : <MonitorSmartphone className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground">هوش را روی دستگاه خود نصب کنید</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {ios ? (
                    <>
                      دکمهٔ <Share className="mx-0.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
                      اشتراک‌گذاری و سپس
                      <PlusSquare className="mx-0.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
                      «افزودن به صفحهٔ اصلی» را بزنید
                    </>
                  ) : (
                    <>دسترسی یک‌ضربه‌ای، آفلاین هم باز می‌شود — بدون مرورگر</>
                  )}
                </p>
              </div>
              {!ios && deferred && (
                <Button
                  size="sm"
                  onClick={installNow}
                  disabled={installing}
                  className="h-9 shrink-0 rounded-lg bg-gradient-to-l from-emerald-600 to-teal-500 px-4 text-xs font-bold text-white shadow-md shadow-emerald-500/25 hover:shadow-lg hover:shadow-emerald-500/30"
                >
                  <Download className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                  {installing ? "در حال نصب…" : "نصب"}
                </Button>
              )}
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
