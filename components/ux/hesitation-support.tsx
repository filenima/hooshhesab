"use client";

// ============ HesitationSupportCard ============
// v35.4 (پیشنهاد ۸ سند روانشناسی فروش — دکمهٔ «پشتیبان خرید» در لحظهٔ تردید):
// اگر کاربر ۲ بار در یک نشست به صفحهٔ پلن‌ها آمده و نخریده (نشانهٔ تردید)،
// بعد از ۶ ثانیه کارت «مشکلی در انتخاب دارید؟ ۲ دقیقه با ما صحبت کنید»
// ظاهر می‌شود — تماس مستقیم یا رفتن به صفحهٔ پشتیبانی.
//
// روانشناسی: تردید در لحظهٔ تصمیم، بیشترین ریزش را می‌سازد؛ حضور یک انسانِ
// قابل گفتگو در همان لحظه، عبور از تردید را ۳-۵ برابر می‌کند.

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, MessageCircle, X, Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";

const VISITS_KEY = "hoshhesab_pricing_visit_count";
const DISMISS_KEY = "hoshhesab_pricing_support_dismissed";
/** حداقل فاصلهٔ بین دو شمارش (دقیقه) — رفت‌وآمد واقعی، نه رفرش پیاپی */
const COUNT_DEBOUNCE_MS = 10 * 60 * 1000;
const VISITS_THRESHOLD = 2;
const SHOW_DELAY_MS = 6000;

interface HesitationSupportProps {
 onNavigateSupport: () => void;
 /** آیا کاربر لایسنس خریدِ فعال دارد؟ (true → کارت هرگز نشان داده نمی‌شود) */
 hasPurchasedLicense?: boolean;
}

export function HesitationSupportCard({
 onNavigateSupport,
 hasPurchasedLicense = false,
}: HesitationSupportProps) {
 const [show, setShow] = React.useState(false);
 const [dismissed, setDismissed] = React.useState(false);

 React.useEffect(() => {
  if (hasPurchasedLicense) return;
  // شمارش بازدیدهای صفحهٔ پلن در همین نشست (با فاصلهٔ حداقل ۱۰ دقیقه)
  let visits = 0;
  let eligible = false;
  try {
   const lastVisitAt = Number(sessionStorage.getItem(`${VISITS_KEY}_at`) || 0);
   const now = Date.now();
   if (now - lastVisitAt > COUNT_DEBOUNCE_MS) {
    visits = Number(sessionStorage.getItem(VISITS_KEY) || 0) + 1;
    sessionStorage.setItem(VISITS_KEY, String(visits));
    sessionStorage.setItem(`${VISITS_KEY}_at`, String(now));
   } else {
    visits = Number(sessionStorage.getItem(VISITS_KEY) || 0);
   }
   eligible = visits >= VISITS_THRESHOLD;
   if (sessionStorage.getItem(DISMISS_KEY) === "1") {
    setDismissed(true);
    return;
   }
  } catch {
   /* حالت خصوصی — شمارش در حافظهٔ کامپوننت */
   eligible = true;
  }

  if (!eligible) return;
  const id = setTimeout(() => setShow(true), SHOW_DELAY_MS);
  return () => clearTimeout(id);
 }, [hasPurchasedLicense]);

 const dismiss = React.useCallback(() => {
  setShow(false);
  setDismissed(true);
  try {
   sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
   /* ignore */
  }
 }, []);

 if (hasPurchasedLicense || dismissed) return null;

 return (
  <AnimatePresence>
   {show && (
    <motion.div
     key="hesitation-support"
     initial={{ opacity: 0, y: 24, scale: 0.96 }}
     animate={{ opacity: 1, y: 0, scale: 1 }}
     exit={{ opacity: 0, y: 24, scale: 0.96 }}
     transition={{ duration: 0.35, ease: "easeOut" }}
     className="fixed bottom-4 left-4 z-40 w-[calc(100vw-2rem)] max-w-xs sm:bottom-6 sm:left-6"
     role="dialog"
     aria-label="پشتیبان انتخاب پلن"
    >
     <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-card/95 p-4 shadow-xl backdrop-blur-md">
      <div
       className="pointer-events-none absolute -left-6 -top-8 h-24 w-24 rounded-full bg-primary/10 blur-2xl"
       aria-hidden="true"
      />
      <button
       type="button"
       onClick={dismiss}
       aria-label="بستن"
       className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
       <X className="h-3.5 w-3.5" />
      </button>

      <div className="relative flex items-start gap-3">
       <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Headphones className="h-5 w-5" />
       </div>
       <div className="min-w-0">
       <p className="text-sm font-bold text-foreground leading-snug">
        مشکلی در انتخاب دارید؟
       </p>
       <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        ۲ دقیقه با کارشناس ما صحبت کنید — متناسب با کسب‌وکارتان پلن درست را
        پیشنهاد می‌دهیم؛ بدون فشار فروش.
       </p>
       </div>
      </div>

      <div className="relative mt-3.5 grid grid-cols-2 gap-2">
       <a
        href="tel:07132622493"
        className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"
       >
        <Phone className="h-3.5 w-3.5" />
        تماس مستقیم
       </a>
       <Button
        type="button"
        variant="outline"
        className="h-10 gap-1.5 rounded-xl text-xs font-semibold"
        onClick={() => {
         dismiss();
         onNavigateSupport();
        }}
       >
        <MessageCircle className="h-3.5 w-3.5" />
        گفتگوی آنلاین
       </Button>
      </div>

      <p className="relative mt-2.5 text-center text-[10px] text-muted-foreground/70">
        شنبه تا چهارشنبه، ۹ تا ۱۸ — پاسخ‌گویی سریع
      </p>
     </div>
    </motion.div>
   )}
  </AnimatePresence>
 );
}
