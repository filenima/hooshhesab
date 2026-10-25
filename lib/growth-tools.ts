import { db } from "@/lib/db";
import { cacheGetOrSet, cacheDeleteByPrefix, CACHE_TTL } from "@/lib/cache";

// ============================================================
// lib/growth-tools.ts — ابزارهای رشد (راند ۱۲ / Task ۸)
// ------------------------------------------------------------
// سه ابزار عملیاتی سئو برای پنل سوپرادمین — همه در SystemSettings:
//  ۱) gsc_watchlist   → پایش هفتگی CTR در Search Console (ترفند #۵)
//  ۲) pr_outreach     → کیت Digital PR و رسانه (ترفند #۱)
//  ۳) news_workflow   → گردش‌کار «خبر ۴۸ ساعته» (ترفند #۱۳)
// الگوی ذخیره‌سازی همان ab-titles/gbp-posts است: JSON در SystemSettings
// + کش درون‌حافظه‌ای با پیشوند "system_settings:" (باطل‌سازی بعد از upsert).
//
// توجه: تایپ‌ها، برچسب‌ها و قالب‌های ایمیل در growth-tools-shared (Client-safe)
// تعریف شده‌اند و از همین فایل re-export می‌شوند. توابع DB فقط سمت سرور.
// ============================================================

export * from "@/lib/growth-tools-shared";
import type {
  GscWatchlistConfig,
  PrOutreachConfig,
  NewsWorkflowConfig,
} from "@/lib/growth-tools-shared";

const CACHE_PREFIX = "system_settings:";

export const GSC_WATCHLIST_KEY = "gsc_watchlist";
export const PR_OUTREACH_KEY = "pr_outreach";
export const NEWS_WORKFLOW_KEY = "news_workflow";

/* ============ مقادیر پیش‌فرض (وقتی هیچ‌ ذخیره نشده) ============ */

export const DEFAULT_GSC_WATCHLIST: GscWatchlistConfig = {
  updatedAt: new Date(0).toISOString(),
  rows: [],
};

export const DEFAULT_PR_OUTREACH: PrOutreachConfig = {
  updatedAt: new Date(0).toISOString(),
  media: [],
  activityLog: [],
};

export const DEFAULT_NEWS_WORKFLOW: NewsWorkflowConfig = {
  updatedAt: new Date(0).toISOString(),
  activeNews: [],
  history: [],
};

/* ============ خواندن/ذخیرهٔ هر ابزار ============ */

function parseJsonConfig<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<T>;
    if (!parsed || typeof parsed !== "object") return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

/** پایش GSC — خواندن (با کش ۶۰ثانیه‌ای) */
export async function getGscWatchlist(): Promise<GscWatchlistConfig> {
  return cacheGetOrSet(
    `${CACHE_PREFIX}${GSC_WATCHLIST_KEY}`,
    async () => {
      const row = await db.systemSettings.findUnique({ where: { key: GSC_WATCHLIST_KEY } });
      return parseJsonConfig<GscWatchlistConfig>(row?.value, DEFAULT_GSC_WATCHLIST);
    },
    CACHE_TTL.STANDARD
  );
}

/** پایش GSC — ذخیره (upsert + باطل‌سازی کش) */
export async function saveGscWatchlist(config: GscWatchlistConfig): Promise<GscWatchlistConfig> {
  const clean: GscWatchlistConfig = { updatedAt: config.updatedAt, rows: config.rows };
  await db.systemSettings.upsert({
    where: { key: GSC_WATCHLIST_KEY },
    update: { value: JSON.stringify(clean) },
    create: { key: GSC_WATCHLIST_KEY, value: JSON.stringify(clean) },
  });
  cacheDeleteByPrefix(CACHE_PREFIX);
  return clean;
}

/** کیت PR — خواندن */
export async function getPrOutreach(): Promise<PrOutreachConfig> {
  return cacheGetOrSet(
    `${CACHE_PREFIX}${PR_OUTREACH_KEY}`,
    async () => {
      const row = await db.systemSettings.findUnique({ where: { key: PR_OUTREACH_KEY } });
      return parseJsonConfig<PrOutreachConfig>(row?.value, DEFAULT_PR_OUTREACH);
    },
    CACHE_TTL.STANDARD
  );
}

/** کیت PR — ذخیره */
export async function savePrOutreach(config: PrOutreachConfig): Promise<PrOutreachConfig> {
  const clean: PrOutreachConfig = {
    updatedAt: config.updatedAt,
    media: config.media,
    activityLog: config.activityLog,
  };
  await db.systemSettings.upsert({
    where: { key: PR_OUTREACH_KEY },
    update: { value: JSON.stringify(clean) },
    create: { key: PR_OUTREACH_KEY, value: JSON.stringify(clean) },
  });
  cacheDeleteByPrefix(CACHE_PREFIX);
  return clean;
}

/** خبر ۴۸ ساعته — خواندن */
export async function getNewsWorkflow(): Promise<NewsWorkflowConfig> {
  return cacheGetOrSet(
    `${CACHE_PREFIX}${NEWS_WORKFLOW_KEY}`,
    async () => {
      const row = await db.systemSettings.findUnique({ where: { key: NEWS_WORKFLOW_KEY } });
      return parseJsonConfig<NewsWorkflowConfig>(row?.value, DEFAULT_NEWS_WORKFLOW);
    },
    CACHE_TTL.STANDARD
  );
}

/** خبر ۴۸ ساعته — ذخیره */
export async function saveNewsWorkflow(config: NewsWorkflowConfig): Promise<NewsWorkflowConfig> {
  const clean: NewsWorkflowConfig = {
    updatedAt: config.updatedAt,
    activeNews: config.activeNews,
    history: config.history,
  };
  await db.systemSettings.upsert({
    where: { key: NEWS_WORKFLOW_KEY },
    update: { value: JSON.stringify(clean) },
    create: { key: NEWS_WORKFLOW_KEY, value: JSON.stringify(clean) },
  });
  cacheDeleteByPrefix(CACHE_PREFIX);
  return clean;
}
