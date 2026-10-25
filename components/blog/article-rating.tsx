"use client";

// ============ ArticleRating — «این مقاله چقدر مفید بود؟» ============
// v35.6 (بخش ۴ سند پیشنهادهای ارتقا): امتیاز ستاره‌ای تعاملی در انتهای
// هر مقالهٔ بلاگ — سیگنال کیفیت برای خواننده + دادهٔ aggregateRating
// برای سئو (Article schema وقتی ≥۳ رأی دارد).
//
// طراحی:
// - ۵ ستارهٔ بزرگ لمس‌پذیر (حداقل ۴۴px ناحیهٔ لمس) + لیبل فارسی هر امتیاز
// - پس از رأی: پیغام تشکر + میانگین/تعداد به‌روزشده
// - محافظت کلاینت: یک رأی در هر مقاله (localStorage) — سمت سرور هم
//   rate-limit داریم
// - انیمیشن bounce ملایم روی ستارهٔ انتخابی + احترام به reduced-motion
// - بدون آبی/ایندیگو؛ amber برای ستاره‌ها (قرارداد رایج امتیاز)

import * as React from "react";
import { Star, ThumbsUp, ThumbsDown, Loader2, PartyPopper } from "lucide-react";
import { toPersianDigits } from "@/lib/persian";

const RATING_LABELS: Record<number, string> = {
  1: "بی‌فایده بود",
  2: "کم‌فایده بود",
  3: "متوسط بود",
  4: "مفید بود",
  5: "خیلی مفید بود!",
};

const STORAGE_PREFIX = "hoosh_article_rated_";

interface ArticleRatingProps {
  slug: string;
  /** میانگین اولیه از SSR (اگر داده‌ای هست) */
  initialAverage?: number;
  initialCount?: number;
}

export function ArticleRating({
  slug,
  initialAverage = 0,
  initialCount = 0,
}: ArticleRatingProps) {
  const [hovered, setHovered] = React.useState(0);
  const [selected, setSelected] = React.useState(0);
  const [phase, setPhase] = React.useState<"idle" | "submitting" | "done" | "helpful" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [avg, setAvg] = React.useState(initialAverage);
  const [count, setCount] = React.useState(initialCount);
  const alreadyRated = React.useRef(false);

  // رأی قبلی همین مرورگر؟
  React.useEffect(() => {
    try {
      alreadyRated.current = !!localStorage.getItem(STORAGE_PREFIX + slug);
      if (alreadyRated.current) setPhase("done");
    } catch {
      /* private mode */
    }
  }, [slug]);

  const submit = React.useCallback(
    async (rating: number) => {
      if (alreadyRated.current || phase === "submitting") return;
      setSelected(rating);
      setPhase("submitting");
      setErrorMsg(null);
      try {
        const res = await fetch("/api/blog/rate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, rating }),
        });
        const json = await res.json();
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "ثبت امتیاز ناموفق بود.");
        }
        setAvg(json.data.average);
        setCount(json.data.count);
        alreadyRated.current = true;
        try {
          localStorage.setItem(STORAGE_PREFIX + slug, String(rating));
        } catch {
          /* private mode */
        }
        setPhase("helpful"); // مرحلهٔ «مشکلتان حل شد؟»
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "خطای شبکه.");
        setPhase("error");
        window.setTimeout(() => setPhase("idle"), 3500);
      }
    },
    [slug, phase]
  );

  const sendHelpful = React.useCallback(
    async (helpful: boolean) => {
      // سرد و بدون صدا — فقط برای تحلیل محتوایی؛ UX با تشکر بسته می‌شود
      setPhase("done");
      try {
        await fetch("/api/blog/rate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, rating: selected || 5, helpful }),
        }).catch(() => null);
      } catch {
        /* بی‌اهمیت */
      }
    },
    [slug, selected]
  );

  // قبلاً رأی داده — فقط نمایش جمع‌بندی
  if (phase === "done" && alreadyRated.current) {
    return (
      <section
        aria-label="امتیاز شما به این مقاله ثبت شد"
        className="mt-12 flex flex-col items-center gap-2 rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-6 text-center dark:border-emerald-900/50 dark:bg-emerald-950/25"
      >
        <PartyPopper className="h-6 w-6 text-emerald-500" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">نظر شما ثبت شد — سپاسگزاریم!</p>
        {count > 0 && (
          <p className="text-xs text-muted-foreground">
            میانگین فعلی: {toPersianDigits(avg)} از ۵ از مجموع {toPersianDigits(count)} رأی
          </p>
        )}
      </section>
    );
  }

  return (
    <section
      aria-label="امتیازدهی به این مقاله"
      className="relative mt-12 overflow-hidden rounded-2xl border border-border/70 bg-card p-6 text-center shadow-sm sm:p-8"
    >
      {/* نوار لهجهٔ گرادیانی */}
      <div
        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-amber-400 via-amber-300 to-emerald-400"
        aria-hidden="true"
      />
      <h2 className="text-base font-bold text-foreground sm:text-lg">
        این مقاله چقدر برایتان مفید بود؟
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        بازخورد شما به بهتر شدن راهنماهای ما کمک می‌کند
      </p>

      {/* ستاره‌ها — لمس‌پذیر */}
      <div
        className="mt-4 flex items-center justify-center gap-1"
        role="radiogroup"
        aria-label="امتیاز از ۵"
        onMouseLeave={() => setHovered(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const active = (hovered || selected) >= n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected === n}
              aria-label={`${toPersianDigits(n)} ستاره — ${RATING_LABELS[n]}`}
              disabled={phase === "submitting" || phase === "helpful"}
              onMouseEnter={() => setHovered(n)}
              onFocus={() => setHovered(n)}
              onClick={() => void submit(n)}
              className={`flex h-11 w-11 items-center justify-center rounded-lg transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:cursor-not-allowed disabled:opacity-60 motion-safe:active:scale-90 ${
                active ? "motion-safe:animate-[hooshRatingPop_.25s_ease-out]" : ""
              }`}
            >
              <Star
                className={`h-7 w-7 transition-colors duration-150 ${
                  active
                    ? "fill-amber-400 text-amber-400 drop-shadow-[0_1px_2px_rgba(251,191,36,0.4)]"
                    : "text-muted-foreground/40 hover:text-amber-300"
                }`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      {/* لیبل انتخاب */}
      <p className="mt-2 h-5 text-xs font-medium text-muted-foreground" aria-live="polite">
        {phase === "submitting"
          ? "در حال ثبت…"
          : (hovered || selected) > 0
            ? RATING_LABELS[hovered || selected]
            : ""}
      </p>

      {/* مرحلهٔ «مشکلتان حل شد؟» — پس از ثبت موفق */}
      {phase === "helpful" && (
        <div className="mt-3 flex flex-col items-center gap-3">
          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            امتیاز شما ثبت شد — سپاسگزاریم!
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void sendHelpful(true)}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-emerald-300/70 bg-emerald-50/80 px-4 text-xs font-semibold text-emerald-700 transition-all hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300"
            >
              <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
              بله، مشکل‌ام حل شد
            </button>
            <button
              type="button"
              onClick={() => void sendHelpful(false)}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
              نه هنوز
            </button>
          </div>
        </div>
      )}

      {/* خطا */}
      {phase === "error" && errorMsg && (
        <p className="mt-3 text-xs font-medium text-rose-600 dark:text-rose-400" role="alert">
          {errorMsg}
        </p>
      )}

      {/* جمع‌بندی موجود */}
      {count > 0 && phase !== "helpful" && (
        <p className="mt-4 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
          میانگین {toPersianDigits(avg)} از ۵ از مجموع {toPersianDigits(count)} رأی خوانندگان
        </p>
      )}

      {/* انیمیشن pop — keyframes محلی (بدون وابستگی styled-jsx) */}
      <style
        dangerouslySetInnerHTML={{
          __html: `@keyframes hooshRatingPop{0%{transform:scale(.7)}60%{transform:scale(1.15)}100%{transform:scale(1)}}`,
        }}
      />
    </section>
  );
}
