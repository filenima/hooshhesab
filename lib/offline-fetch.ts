"use client";

/**
 * ============ lib/offline-fetch.ts ============
 * نصب interceptor سراسری fetch برای کارکرد ۱۰۰٪ آفلاین (درخواست مالک).
 * ============================================================================
 * - درخواست‌های تغییردهنده (POST/PUT/PATCH/DELETE به /api/*) که به دلیل قطع
 *   اینترنت شکست می‌خورند: به صف آفلاین (IndexedDB از use-offline-sync) افزوده
 *   می‌شوند و یک پاسخ موفق آرام برمی‌گردند — بدون نمایش «خطای آفلاین».
 * - پس از هر موتاسیون موفق آنلاین، کش API سرویس‌ورکر پاک می‌شود تا دادهٔ تازه بیاید.
 * - بعد از همگام‌سازی صف (بازگشت آنلاین)، رویداد hoosh:sync-flush dispatch می‌شود
 *   تا UIها داده را تازه کنند.
 * - مستثنی از صف (هرگز صف نمی‌شوند و خطا شفاف به UI می‌رسد):
 *   ▸ احراز هویت/پرداخت/گیت‌وی
 *   ▸ همهٔ /api/ai/* — دستیار هوش مصنوعی «موتور پاسخ آفلاین» خودش را دارد؛
 *     اگر اینجا پاسخ فیک queued می‌دادیم چت خراب می‌شد (پیام باید به موتور
 *     آفلاین برود نه صف)
 *   ▸ نرخ ارز آنلاین (/api/currency/fetch-tgju، /api/exchange-rate/fetch*) —
 *     دادهٔ زندهٔ اشخاص ثالث است؛ صف‌کردنش بی‌معنا و گمراه‌کننده است
 *   ▸ آپلود فایل (/api/files/upload، /api/platform/ads/upload) — فایل باینری
 *     قابل بازپخش از صف نیست؛ UI پیام شفاف «نیاز به اتصال» می‌دهد
 *   ▸ بدنهٔ غیرمتنی (FormData/ArrayBuffer/…) — قابل ذخیره در صف نیست
 */

import { enqueueRequest } from "@/hooks/use-offline-sync";

declare global {
  interface Window {
    __hooshOfflineFetchInstalled?: boolean;
  }
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** این الگوها هرگز وارد صف آفلاین نمی‌شوند */
const NEVER_QUEUE_RE =
  /\/api\/(auth|payment|gateway|files\/upload|platform\/ads\/upload|ai\/|currency\/fetch-tgju|exchange-rate\/fetch)/;

export function installOfflineFetch() {
  if (typeof window === "undefined") return;
  if (window.__hooshOfflineFetchInstalled) return;
  window.__hooshOfflineFetchInstalled = true;

  const origFetch = window.fetch.bind(window);

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method || "GET").toUpperCase();
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : input.url;
    const isApi = typeof url === "string" && url.includes("/api/");

    try {
      const res = await origFetch(input as RequestInfo, init);
      // موتاسیون موفق → کش API را باطل کن (پیام به SW)
      if (res.ok && isApi && MUTATING.has(method) && "serviceWorker" in navigator && navigator.serviceWorker.controller) {
        try {
          navigator.serviceWorker.controller.postMessage("hoosh-clear-api-cache");
        } catch {}
      }
      return res;
    } catch (err) {
      // فقط خطای شبکه (آفلاین) را صف می‌کنیم — خطاهای HTTP از res بالا می‌آیند
      if (!isApi || !MUTATING.has(method)) throw err;

      const urlStr = String(url);

      // AI / ارز / آپلود / پرداخت → صف ممنوع (موتور آفلاین خودشان کار می‌کنند)
      if (NEVER_QUEUE_RE.test(urlStr)) throw err;

      // بدنهٔ قابل ذخیره فقط string (JSON) — FormData/باینری صف نمی‌شود
      let body: string | null = null;
      if (init?.body) {
        if (typeof init.body === "string") body = init.body;
        else if (init?.body instanceof Blob) {
          try { body = await init.body.text(); } catch {}
        } else {
          // FormData / ArrayBuffer / URLSearchParams و… — قابل بازپخش نیست
          throw err;
        }
      }

      // صف نکن: بدنهٔ خیلی بزرگ
      if (body && body.length > 2_000_000) throw err;

      // Content-Type
      let contentType: string | null = null;
      if (init?.headers) {
        const h = init.headers;
        if (typeof h === "object" && !Array.isArray(h)) {
          const rec = h as Record<string, string>;
          contentType = rec["Content-Type"] || rec["content-type"] || null;
        }
      }
      if (!contentType) contentType = "application/json";

      await enqueueRequest({ url: urlStr, method, body, contentType });

      // اطلاع به UI — OfflineBanner شمارندهٔ pending را همین لحظه تازه می‌کند
      try {
        window.dispatchEvent(new CustomEvent("hoosh:mutation-queued", { detail: { url: urlStr, method } }));
      } catch {}

      // پاسخ آرام — کامپوننت success می‌بیند و UI ادامه می‌یابد
      return new Response(
        JSON.stringify({
          success: true,
          offline: true,
          queued: true,
          data: {},
          message: "اتصال قطع است — عملیات ذخیره شد و پس از اتصال به اینترنت خودکار اجرا می‌شود.",
        }),
        { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
    }
  }) as typeof fetch;
}
