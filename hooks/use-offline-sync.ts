"use client";

/**
 * use-offline-sync — وضعیت آنلاین + صف همگام‌سازی آفلاین
 * ============================================================================
 * API (مصرف‌شده در OfflineBanner و app-providers):
 *   const { isOnline, serverOffline, pendingCount, syncing, lastSyncResult, syncNow } =
 *     useOfflineSync(token);
 *
 * - isOnline      — navigator.onLine + شنیدن online/offline
 * - serverOffline — مرورگر آنلاین است اما سرور جواب نمی‌دهد (پینگ /api/health
 *                   هر ۲۰ ثانیه؛ سرویس‌ورکر در آفلاین ۵۰۳ صریح می‌دهد)
 * - pendingCount  — تعداد درخواست‌های در صف آفلاین (IndexedDB از طریق idb)
 *                   + بلافاصله روی رویدادهای hoosh:mutation-queued / hoosh:sync-flush
 * - syncNow()     — ارسال مجدد صف + بازگشت نتیجهٔ { ok, sent, failed }
 *                   (با گارد singleton — چند mount همزمان فقط یک تخلیه انجام می‌دهند)
 * - lastSyncResult — آخرین نتیجهٔ همگام‌سازی
 *
 * پروتکل SW (sw.js v3):
 *   - پیام FORCE_SYNC از سرویس‌ورکر (sync tag hoosh-bg-sync) → همین‌جا تخلیه می‌شود
 *   - پس از تخلیه، SYNC_FLUSH_RESULT به SW برمی‌گردد → SW پیام BG_SYNC_DONE را
 *     broadcast می‌کند → sw-register توست «همگام‌سازی آفلاین انجام شد» می‌دهد
 *
 * صف: درخواست‌های fetch ناموفقِ در حالت آفلاین (متدهای تغییردهنده) در
 * IndexedDB ذخیره می‌شوند و با بازگشت آنلاین دوباره ارسال می‌شوند.
 * installOfflineFetch در app-providers فعال می‌شود.
 */

import * as React from "react";
import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "hoosh-offline";
const STORE = "outbox";
const DB_VERSION = 1;
const HEALTH_INTERVAL = 20 * 1000; // پینگ سلامت سرور هر ۲۰ ثانیه (فقط وقتی آنلاین)

export interface OutboxItem {
  id?: number;
  url: string;
  method: string;
  body: string | null;
  contentType: string | null;
  createdAt: number;
  attempts: number;
}

export interface SyncResult {
  ok: boolean;
  sent: number;
  failed: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        }
      },
    }).catch(() => null as unknown as IDBPDatabase);
  }
  return dbPromise;
}

export async function enqueueRequest(item: Omit<OutboxItem, "id" | "createdAt" | "attempts">) {
  try {
    const db = await getDB();
    if (!db) return;
    await db.add(STORE, { ...item, createdAt: Date.now(), attempts: 0 });
  } catch {
    /* ignore */
  }
}

async function countPending(): Promise<number> {
  try {
    const db = await getDB();
    if (!db) return 0;
    return await db.count(STORE);
  } catch {
    return 0;
  }
}

/** توکن احراز هویت فعلی از localStorage — در هر دو نقش (کاربر/ادمین) */
function readLocalToken(): string | null {
  try {
    return (
      localStorage.getItem("hoshhesab_user_token") ||
      localStorage.getItem("hoshhesab_admin_token") ||
      null
    );
  } catch {
    return null;
  }
}

/* ─── تخلیهٔ صف: singleton سراسری — چند mount همزمان فقط یک تخلیه می‌کنند ─── */
let flushInFlight: Promise<SyncResult> | null = null;

async function flushQueueOnce(token: string | null): Promise<SyncResult> {
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    const result: SyncResult = { ok: true, sent: 0, failed: 0 };
    // توکن را «در لحظهٔ تخلیه» بخوان — mount سراسری (صفحات عمومی) هم
    // بازپخش احراز‌شده انجام دهد و ۴۰۱/حذف اشتباهی از صف رخ ندهد
    const effectiveToken = token || readLocalToken();
    try {
      const db = await getDB();
      if (!db) return result;
      const items = (await db.getAll(STORE)) as OutboxItem[];
      for (const item of items) {
        try {
          const res = await fetch(item.url, {
            method: item.method,
            headers: {
              ...(item.contentType ? { "Content-Type": item.contentType } : {}),
              ...(effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : {}),
            },
            body: item.body,
          });
          if (res.ok || (res.status >= 400 && res.status < 500)) {
            // موفق یا خطای غیرقابل‌تلاش‌مجدد → حذف از صف
            if (item.id !== undefined) await db.delete(STORE, item.id);
            result.sent++;
          } else {
            result.failed++;
          }
        } catch {
          result.failed++;
          result.ok = false;
        }
      }
      return result;
    } catch {
      return result;
    }
  })();

  try {
    return await flushInFlight;
  } finally {
    flushInFlight = null;
  }
}

export function useOfflineSync(token: string | null) {
  const [isOnline, setIsOnline] = React.useState(true);
  const [serverOffline, setServerOffline] = React.useState(false);
  const [pendingCount, setPendingCount] = React.useState(0);
  const [syncing, setSyncing] = React.useState(false);
  const [lastSyncResult, setLastSyncResult] = React.useState<SyncResult | null>(null);
  const tokenRef = React.useRef(token);
  tokenRef.current = token;

  // وضعیت آنلاین مرورگر
  React.useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // پینگ دوره‌ای سلامت سرور (فقط وقتی مرورگر آنلاین است) — هر ۲۰ ثانیه.
  // سرویس‌ورکر در آفلاین ۵۰۳ با serverDown:true می‌دهد → حالت server-down واقعی.
  React.useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      if (!navigator.onLine) {
        if (!cancelled) setServerOffline(false);
        return;
      }
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!cancelled) setServerOffline(!res.ok);
      } catch {
        if (!cancelled) setServerOffline(true);
      }
    };
    void ping();
    const iv = setInterval(ping, HEALTH_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  // شمارش صف — ۳۰ ثانیه یک‌بار + آنلاین‌شدن + رویدادهای صف
  // (hoosh:mutation-queued → جدید صف شد؛ hoosh:sync-flush → تخلیه تمام شد)
  React.useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const n = await countPending();
      if (!cancelled) setPendingCount(n);
    };
    void refresh();
    const iv = setInterval(refresh, 30_000);
    window.addEventListener("online", refresh);
    window.addEventListener("hoosh:mutation-queued", refresh);
    window.addEventListener("hoosh:sync-flush", refresh);
    return () => {
      cancelled = true;
      clearInterval(iv);
      window.removeEventListener("online", refresh);
      window.removeEventListener("hoosh:mutation-queued", refresh);
      window.removeEventListener("hoosh:sync-flush", refresh);
    };
  }, []);

  const syncNow = React.useCallback(async (): Promise<SyncResult> => {
    setSyncing(true);
    try {
      const result = await flushQueueOnce(tokenRef.current);
      setLastSyncResult(result);
      setPendingCount(await countPending());
      // v35 — اطلاع‌رسانی به UIها: صف تخلیه شد، داده را تازه کنید
      if (typeof window !== "undefined" && result.sent > 0) {
        try {
          window.dispatchEvent(new CustomEvent("hoosh:sync-flush", { detail: result }));
          // کش API سرویس‌ورکر را هم باطل کن تا دادهٔ تازه بیاید
          if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage("hoosh-clear-api-cache");
          }
        } catch {}
      }
      // پروتکل SW v3 — نتیجهٔ تخلیه را به سرویس‌ورکر بده تا BG_SYNC_DONE را
      // broadcast کند (توست «همگام‌سازی آفلاین انجام شد» در sw-register)
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        try {
          navigator.serviceWorker.controller.postMessage({
            type: "SYNC_FLUSH_RESULT",
            sent: result.sent,
            failed: result.failed,
          });
        } catch {}
      }
      return result;
    } finally {
      setSyncing(false);
    }
  }, []);

  // همگام‌سازی خودکار هنگام بازگشت آنلاین
  const wasOnline = React.useRef(isOnline);
  React.useEffect(() => {
    if (wasOnline.current === false && isOnline) {
      void syncNow();
    }
    wasOnline.current = isOnline;
  }, [isOnline, syncNow]);

  // پیام FORCE_SYNC از سرویس‌ورکر (Background Sync tag «hoosh-bg-sync») →
  // این mount صف را تخلیه می‌کند (singleton مانع تخلیهٔ تکراری می‌شود)
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "FORCE_SYNC") {
        void syncNow();
      }
    };
    navigator.serviceWorker.addEventListener("message", onSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", onSwMessage);
    };
  }, [syncNow]);

  return { isOnline, serverOffline, pendingCount, syncing, lastSyncResult, syncNow };
}

export default useOfflineSync;
