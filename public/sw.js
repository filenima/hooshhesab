/* ============================================================================
 * هوش — Service Worker (نسخهٔ ۳) — کار کامل آفلاین PWA + کش API
 * ============================================================================
 * اهداف v3 (درخواست مالک — «۱۰۰٪ آفلاین، حتی بدون اینترنت»):
 *  ▸ ناوبری (صفحات): network-first (با navigation preload) → کش با
 *    {ignoreSearch:true} (تا شورتکات PWA مثل /?module=invoices هم بیاید)
 *    → نسخهٔ بدون query → روت کش‌شده (داشبورد) → offline.html هوشمند
 *  ▸ استاتیک‌ها (/_next/static، آیکون‌ها، فونت‌ها): cache-first
 *  ▸ API GET: network-first + کش پاسخ‌های موفق (stale-serve در آفلاین)
 *  ▸ API تغییردهنده (POST/...): SW دخالت نمی‌کند — صف سمت کلاینت.
 *    به‌ویژه POST /api/ai/* هرگز کش/رداری نمی‌شود (موتور آفلاین خودش پاسخ می‌دهد)
 *  ▸ سلامت سرور: /api/health و /api/ping در آفلاین ۵۰۳ صریح با serverDown:true
 *    می‌دهند تا بنر «سرور پایین است» واقعاً فعال شود (جواب جعلی ۲۰۰ حذف شد)
 *  ▸ پروتکل پیام با کلاینت (sw-register + use-offline-sync):
 *      — activate → postMessage {type:'SW_ACTIVATED', version} به همه کلاینت‌ها
 *      — پیام GET_VERSION → پاسخ روی port (و broadcast) {type:'GET_VERSION', version}
 *      — sync tag «hoosh-bg-sync» یا پیام FORCE_SYNC → broadcast {type:'FORCE_SYNC'}
 *        به همه کلاینت‌ها؛ تخلیهٔ صف را خود کلاینت انجام می‌دهد
 *      — پیام SYNC_FLUSH_RESULT {sent,failed} از کلاینت پس از تخلیه →
 *        broadcast {type:'BG_SYNC_DONE', processed, remaining} (توست موفقیت)
 *      — "hoosh-clear-api-cache" → پاک‌سازی کش API
 *      — "hoosh-skip-waiting" / SKIP_WAITING → فعال‌سازی فوری SW جدید
 *  ▸ precache استراتژیک: پوستهٔ آفلاین + آیکون‌ها + مستندات API محلی
 *    + روت «/» (داشبورد) در اولین فعال‌سازی
 * ============================================================================
 */

const VERSION = "hoosh-v3";
const STATIC_CACHE = `${VERSION}-static`;
const PAGES_CACHE = `${VERSION}-pages`;
const API_CACHE = `${VERSION}-api`;

const PRECACHE = [
  "/offline.html",
  "/logo.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
  // مستندات API — کاملاً محلی (بدون CDN) تا آفلاین هم کامل باز شود
  "/api-docs/openapi.json",
  "/api-docs/vendor/swagger-ui.css",
  "/api-docs/vendor/swagger-ui-bundle.js",
];

/** APIهایی که هرگز کش نمی‌شوند (پینگ/وضعیت/نشست) */
function isApiNeverCache(pathname) {
  return (
    pathname.startsWith("/api/auth/") ||
    pathname.includes("/session") ||
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/api/platform/login") ||
    pathname.startsWith("/api/platform/logout")
  );
}

/** آیا اندپوینت «سلامت سرور» است؟ (آفلاین → ۵۰۳ صریح، نه ۲۰۰ جعلی) */
function isHealthEndpoint(pathname) {
  return pathname === "/api/health" || pathname === "/api/ping";
}

/** آیا این درخواست یک ناوبری صفحه است؟ */
function isNavigation(request) {
  return (
    request.mode === "navigate" ||
    (request.method === "GET" &&
      request.headers.get("accept")?.includes("text/html"))
  );
}

/** آیا منبع استاتیکِ تغییرناپذیر است؟ */
function isImmutableStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/pos-bridge/") ||
    /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf|css|js|map|webmanifest|json)$/i.test(
      url.pathname
    )
  );
}

/** fetch با مهلت زمانی */
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, ms);
    fetch(request, { signal: controller.signal })
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/** پاسخ آفلاین JSON — بدون متن «خطا»، فقط وضعیت آرام */
function offlineJson(body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Hoosh-Offline": "1",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

/** پاسخ «سرور پایین است» — کد ۵۰۳ صریح تا UI حالت server-down را بفهمد */
function serverDownJson() {
  return new Response(
    JSON.stringify({ success: false, offline: true, serverDown: true, data: null }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Hoosh-Offline": "1",
        "X-Hoosh-Server-Down": "1",
        "Cache-Control": "no-store",
      },
    }
  );
}

/** ارسال پیام به همهٔ کلاینت‌های تحت کنترل — Promise برمی‌گرداند (برای waitUntil) */
function broadcast(message) {
  try {
    return self.clients
      .matchAll({ includeUncontrolled: true })
      .then((clients) => {
        for (const c of clients) {
          try {
            c.postMessage(message);
          } catch {}
        }
      })
      .catch(() => undefined);
  } catch {
    return Promise.resolve();
  }
}

/** تولید offline.html با مسیر بازگشت تزریق‌شده (تا صفحه مقصد را گم نکند) */
async function offlineShellWithReturn(returnPath) {
  const shell = await caches.match("/offline.html", { ignoreSearch: true });
  if (!shell) {
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>آفلاین</title>` +
        `<p style="font-family:Tahoma;padding:24px">در حالت آفلاین هستید.</p>` +
        `<a href="/">بازگشت به برنامه</a>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
  try {
    const html = await shell.text();
    const inject =
      `<script>window.HOOSH_RETURN_PATH = ${JSON.stringify(returnPath)};</script>`;
    return new Response(html.replace("</head>", `${inject}</head>`), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch {
    return shell;
  }
}

/* ─── نصب: precache پوستهٔ آفلاین ─── */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

/* ─── فعال‌سازی: پاک‌سازی کش قدیمی + navigation preload + روت ─── */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // navigation preload — ناوبری آفلاین بدون مکث از کش/فالبک بیاید
      try {
        if (self.registration.navigationPreload) {
          await self.registration.navigationPreload.enable();
        }
      } catch {}

      // حذف کش‌های نسخه‌های قبل
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k))
      );

      // تسخیر همهٔ صفحه‌های باز
      await self.clients.claim();

      // اطلاع به کلاینت‌ها: SW فعال شد (پروتکل sw-register)
      broadcast({ type: "SW_ACTIVATED", version: VERSION });

      // روت «/» (داشبورد) را در اولین فعال‌سازی بگیر و کش کن —
      // تا شورتکات PWA و start_url آفلاین هم داشبورد را نشان دهند
      try {
        const rootCached =
          (await caches.match(new Request(self.location.origin + "/"), {
            ignoreSearch: true,
          })) !== undefined;
        if (!rootCached) {
          const res = await fetch(self.location.origin + "/", {
            cache: "no-store",
          });
          if (res && res.ok) {
            const cache = await caches.open(PAGES_CACHE);
            await cache.put(self.location.origin + "/", res);
          }
        }
      } catch {}
    })()
  );
});

/* ─── مدیریت پیام از کلاینت (پروتکل v3) ─── */
self.addEventListener("message", (event) => {
  const data = event.data;
  const type = typeof data === "string" ? data : data?.type;

  if (type === "hoosh-skip-waiting" || type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  // بعد از موتاسیون موفق، کش API را پاک کن تا دادهٔ تازه بیاید
  if (type === "hoosh-clear-api-cache") {
    try {
      event.waitUntil(caches.delete(API_CACHE).catch(() => undefined));
    } catch {
      caches.delete(API_CACHE).catch(() => undefined);
    }
  }

  // پاسخ به GET_VERSION — روی port پیام‌رسان (sw-register با MessageChannel می‌پرسد)
  if (type === "GET_VERSION") {
    const ports = event.ports || [];
    if (ports.length > 0) {
      try {
        ports[0].postMessage({ type: "GET_VERSION", version: VERSION });
      } catch {}
    } else {
      broadcast({ type: "GET_VERSION", version: VERSION });
    }
  }

  // درخواست تخلیهٔ صف از خود کلاینت (مرورگر بدون Background Sync) →
  // اعلام به همهٔ کلاینت‌ها؛ خودشان صف را تخلیه می‌کنند
  if (type === "FORCE_SYNC") {
    broadcast({ type: "FORCE_SYNC" });
  }

  // نتیجهٔ تخلیهٔ صف از سمت کلاینت → broadcast توست موفقیت
  if (type === "SYNC_FLUSH_RESULT") {
    const sent = Number(data?.sent || 0);
    const failed = Number(data?.failed || 0);
    broadcast({
      type: "BG_SYNC_DONE",
      processed: sent,
      remaining: failed,
    });
  }
});

/* ─── Background Sync — فقط اعلان؛ تخلیه را کلاینت انجام می‌دهد ─── */
self.addEventListener("sync", (event) => {
  if (event.tag === "hoosh-bg-sync") {
    event.waitUntil(broadcast({ type: "FORCE_SYNC" }));
  }
});

/* ─── fetch ─── */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // فقط همان مبدا — درخواست‌های خارجی (پل کارتخوان، tgju و…) دست‌نخورده
  if (url.origin !== self.location.origin) return;

  /* ─── سلامت سرور: آفلاین → ۵۰۳ صریح (حالت server-down واقعی شود) ─── */
  if (isHealthEndpoint(url.pathname)) {
    event.respondWith(
      fetch(request).catch(() => serverDownJson())
    );
    return;
  }

  /* ─── API GET: network-first + کش پاسخ موفق ─── */
  if (url.pathname.startsWith("/api/") && request.method === "GET") {
    if (isApiNeverCache(url.pathname)) {
      // نشست: بدون کش — آفلاین: پاسخ آرام 200 با offline:true
      event.respondWith(
        fetch(request).catch(() =>
          offlineJson({ success: true, offline: true, data: null })
        )
      );
      return;
    }
    event.respondWith(
      fetchWithTimeout(request, 8000)
        .then(async (response) => {
          if (response.ok) {
            try {
              const copy = response.clone();
              const cache = await caches.open(API_CACHE);
              await cache.put(request, copy);
            } catch {}
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) {
            // سرو از کش با نشان آفلاین — UI بنر مینیمال را نشان می‌دهد
            const headers = new Headers(cached.headers);
            headers.set("X-Hoosh-Offline", "1");
            return new Response(cached.body, {
              status: cached.status,
              statusText: cached.statusText,
              headers,
            });
          }
          // کش هم نیست → دادهٔ خالی آرام (نه خطای قرمز)
          return offlineJson({ success: true, offline: true, data: null, empty: true });
        })
    );
    return;
  }

  /* ─── API تغییردهنده (POST/PUT/PATCH/DELETE — شامل همهٔ /api/ai/*):
       SW کاملاً رد می‌شود — نه کش می‌کند نه پاسخ فیک می‌سازد.
       صف‌سازی/موتور آفلاین سمت کلاینت است (offline-fetch.ts) ─── */
  if (url.pathname.startsWith("/api/")) return;

  /* ─── ناوبری: شبکه اول (با preload) → کش بی‌query → روت → پوستهٔ آفلاین ─── */
  if (isNavigation(request)) {
    event.respondWith(handleNavigation(event, request, url));
    return;
  }

  /* ─── استاتیک: کش اول → شبکه (برای دفعات بعد) ─── */
  if (isImmutableStatic(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request)
            .then((response) => {
              if (response.ok || response.type === "basic") {
                const copy = response.clone();
                caches
                  .open(STATIC_CACHE)
                  .then((c) => c.put(request, copy))
                  .catch(() => undefined);
              }
              return response;
            })
            .catch(() => cached)
      )
    );
  }
});

/** استراتژی ناوبری — بازگشت هوشمند از کش حتی با query string */
async function handleNavigation(event, request, url) {
  const returnPath = url.pathname + (url.search || "");

  // ۱) preload شبکه (اگر مرورگر از قبل دانلود را شروع کرده)
  try {
    if (event.preloadResponse) {
      const preload = await event.preloadResponse;
      if (preload && preload.ok) {
        try {
          const copy = preload.clone();
          caches
            .open(PAGES_CACHE)
            .then((c) => c.put(request, copy))
            .catch(() => undefined);
        } catch {}
        return preload;
      }
    }
  } catch {}

  // ۲) شبکه با مهلت ۵ ثانیه
  try {
    const response = await fetchWithTimeout(request, 5000);
    if (response && response.ok) {
      try {
        const copy = response.clone();
        const cache = await caches.open(PAGES_CACHE);
        // هم کلید کامل (با query) هم کلید بی‌query (برای fallback هوشمند)
        await cache.put(request, copy.clone());
        if (url.search) {
          await cache.put(
            new Request(url.origin + url.pathname),
            copy
          );
        }
      } catch {}
    }
    return response;
  } catch {}

  // ─── آفلاین: زنجیرهٔ کش هوشمند ───
  // ۳) تطبیق با نادیده‌گرفتن query — شورتکات PWA (/?module=…) رو دشت
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;

  // ۴) اگر query دارد، نسخهٔ بی‌query همان مسیر را امتحان کن
  if (url.search) {
    const bare = await caches.match(new Request(url.origin + url.pathname), {
      ignoreSearch: true,
    });
    if (bare) return bare;
  }

  // ۵) مقصد داشبورد است ( pathname «/» یا ?module=… ) و روت کش شده → روت
  if (url.pathname === "/" || url.searchParams.has("module")) {
    const root = await caches.match(new Request(url.origin + "/"), {
      ignoreSearch: true,
    });
    if (root) return root;
  }

  // ۶) پوستهٔ آفلاین + تزریق مسیر بازگشت (تا صفحه مقصد را گم نکند)
  return offlineShellWithReturn(returnPath);
}
