import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { db } from "@/lib/db";
import {
  GSC_WATCHLIST_KEY,
  PR_OUTREACH_KEY,
  NEWS_WORKFLOW_KEY,
  getGscWatchlist,
  saveGscWatchlist,
  getPrOutreach,
  savePrOutreach,
  getNewsWorkflow,
  saveNewsWorkflow,
  type GscWatchRow,
  type GscWatchStatus,
  type GscWatchlistConfig,
  type PrMediaRow,
  type PrMediaStatus,
  type PrActivityRow,
  type PrOutreachConfig,
  type ActiveNewsRow,
  type NewsHistoryRow,
  type NewsSource,
  type NewsWorkflowConfig,
} from "@/lib/growth-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// /api/platform/growth-tools — سه ابزار رشد سئو (راند ۱۲ / Task 8)
// ------------------------------------------------------------
// GET  ?tool=gsc|pr|news|all → پیکربندی ذخیره‌شده (پیش‌فرض خالی)
// PUT  body { tool: "gsc"|"pr"|"news", data: <config> }
//      اعتبارسنجی ساختاری سست (آرایه‌ها موجود، شناسه‌ها متن) +
//      ذخیره در SystemSettings + رویداد ممیزی GROWTH_TOOLS_UPDATE
// الگوی کلی از ab-titles؛ الگوی ممیزی از anti-fraud (auditLog/PLATFORM).
// ============================================================

type ToolId = "gsc" | "pr" | "news";

const TOOL_IDS: ToolId[] = ["gsc", "pr", "news"];

const TOOL_LABELS: Record<ToolId, string> = {
  gsc: "پایش GSC و CTR",
  pr: "کیت Digital PR",
  news: "خبر ۴۸ ساعته",
};

/** سقف‌های امن — جلوگیری از بادکردن JSON در SystemSettings */
const MAX_GSC_ROWS = 100;
const MAX_PR_MEDIA = 100;
const MAX_PR_ACTIVITY = 300;
const MAX_NEWS_ACTIVE = 50;
const MAX_NEWS_HISTORY = 200;

/* ============ نرمال‌سازهای سست ============ */

function str(v: unknown, max = 300): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function num(v: unknown, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function bool(v: unknown): boolean {
  return v === true;
}

/** شناسهٔ ردیف باید متنِ غیرخالی باشد — تنها الزام سختِ اعتبارسنجی سست */
function rowId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, 64) : null;
}

function isGscStatus(v: unknown): v is GscWatchStatus {
  return v === "pending" || v === "running" || v === "done";
}

function isPrStatus(v: unknown): v is PrMediaStatus {
  return v === "new" || v === "contacted" || v === "replied" || v === "published" || v === "dead";
}

function isNewsSource(v: unknown): v is NewsSource {
  return v === "notice" || v === "rate" || v === "ban" || v === "other";
}

/** تاریخ ISO معتبر یا مقدار پیش‌فرض */
function isoDate(v: unknown, fallback: string): string {
  const s = str(v, 40);
  if (s) {
    const t = Date.parse(s);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return fallback;
}

/* ============ نرمال‌سازی پیکربندی هر ابزار ============ */

function normalizeGsc(data: unknown): { config?: GscWatchlistConfig; error?: string } {
  const d = data as Partial<GscWatchlistConfig> | null;
  if (!d || !Array.isArray(d.rows)) {
    return { error: "ساختار پیکربندی GSC نامعتبر است — فیلد rows باید آرایه باشد" };
  }
  if (d.rows.length > MAX_GSC_ROWS) {
    return { error: `حداکثر ${MAX_GSC_ROWS} ردیف پایش مجاز است` };
  }
  const rows: GscWatchRow[] = [];
  for (const raw of d.rows) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as unknown as Record<string, unknown>;
    const id = rowId(r.id);
    if (!id) return { error: "شناسهٔ ردیف‌های پایش GSC باید متن غیرخالی باشد" };
    rows.push({
      id,
      path: str(r.path, 300) || "/",
      currentTitle: str(r.currentTitle, 200),
      ctr: num(r.ctr, 0, 100),
      position: num(r.position, 0, 500),
      newTitleIdea: str(r.newTitleIdea, 200),
      cycleStart: isoDate(r.cycleStart, new Date().toISOString()),
      status: isGscStatus(r.status) ? r.status : "pending",
    });
  }
  return { config: { updatedAt: new Date().toISOString(), rows } };
}

function normalizePr(data: unknown): { config?: PrOutreachConfig; error?: string } {
  const d = data as Partial<PrOutreachConfig> | null;
  if (!d || !Array.isArray(d.media) || !Array.isArray(d.activityLog)) {
    return { error: "ساختار کیت PR نامعتبر است — media و activityLog باید آرایه باشند" };
  }
  if (d.media.length > MAX_PR_MEDIA) {
    return { error: `حداکثر ${MAX_PR_MEDIA} رسانه مجاز است` };
  }
  if (d.activityLog.length > MAX_PR_ACTIVITY) {
    return { error: `حداکثر ${MAX_PR_ACTIVITY} رویداد فعالیت مجاز است` };
  }
  const media: PrMediaRow[] = [];
  for (const raw of d.media) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as unknown as Record<string, unknown>;
    const id = rowId(r.id);
    if (!id) return { error: "شناسهٔ رسانه‌ها باید متن غیرخالی باشد" };
    media.push({
      id,
      name: str(r.name, 120),
      email: str(r.email, 200),
      beat: str(r.beat, 200),
      lastContact: str(r.lastContact, 40),
      status: isPrStatus(r.status) ? r.status : "new",
      note: str(r.note, 500),
    });
  }
  const activityLog: PrActivityRow[] = [];
  for (const raw of d.activityLog) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as unknown as Record<string, unknown>;
    const id = rowId(r.id);
    if (!id) return { error: "شناسهٔ رویدادهای فعالیت باید متن غیرخالی باشد" };
    activityLog.push({
      id,
      date: isoDate(r.date, new Date().toISOString()),
      mediaId: str(r.mediaId, 64),
      action: str(r.action, 200),
      note: str(r.note, 500),
    });
  }
  return { config: { updatedAt: new Date().toISOString(), media, activityLog } };
}

function normalizeNews(data: unknown): { config?: NewsWorkflowConfig; error?: string } {
  const d = data as Partial<NewsWorkflowConfig> | null;
  if (!d || !Array.isArray(d.activeNews) || !Array.isArray(d.history)) {
    return { error: "ساختار گردش‌کار خبر نامعتبر است — activeNews و history باید آرایه باشند" };
  }
  if (d.activeNews.length > MAX_NEWS_ACTIVE) {
    return { error: `حداکثر ${MAX_NEWS_ACTIVE} خبر فعال مجاز است` };
  }
  if (d.history.length > MAX_NEWS_HISTORY) {
    return { error: `حداکثر ${MAX_NEWS_HISTORY} رکورد تاریخچه مجاز است` };
  }
  const activeNews: ActiveNewsRow[] = [];
  for (const raw of d.activeNews) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as unknown as Record<string, unknown>;
    const id = rowId(r.id);
    if (!id) return { error: "شناسهٔ خبرهای فعال باید متن غیرخالی باشد" };
    const startedAt = isoDate(r.startedAt, new Date().toISOString());
    const deadline = isoDate(r.deadline, new Date(Date.parse(startedAt) + 48 * 3600_000).toISOString());
    const steps = (r.steps && typeof r.steps === "object" ? r.steps : {}) as Record<string, unknown>;
    activeNews.push({
      id,
      title: str(r.title, 200),
      source: isNewsSource(r.source) ? r.source : "other",
      startedAt,
      deadline,
      steps: {
        blogDraft: bool(steps.blogDraft),
        gbpPost: bool(steps.gbpPost),
        linkedinPost: bool(steps.linkedinPost),
        published: bool(steps.published),
      },
    });
  }
  const history: NewsHistoryRow[] = [];
  for (const raw of d.history) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as unknown as Record<string, unknown>;
    const id = rowId(r.id);
    if (!id) return { error: "شناسهٔ رکورد تاریخچه باید متن غیرخالی باشد" };
    history.push({
      id,
      title: str(r.title, 200),
      publishedAt: isoDate(r.publishedAt, new Date().toISOString()),
      url: str(r.url, 500),
    });
  }
  return { config: { updatedAt: new Date().toISOString(), activeNews, history } };
}

/* ============ GET ============ */

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const tool = new URL(req.url).searchParams.get("tool") ?? "all";

    if (tool === "all") {
      const [gsc, pr, news] = await Promise.all([getGscWatchlist(), getPrOutreach(), getNewsWorkflow()]);
      return NextResponse.json({ success: true, data: { gsc, pr, news } });
    }

    if (!TOOL_IDS.includes(tool as ToolId)) {
      return NextResponse.json(
        { success: false, error: "پارامتر tool نامعتبر است — gsc | pr | news | all" },
        { status: 400 }
      );
    }

    if (tool === "gsc") {
      return NextResponse.json({ success: true, data: { gsc: await getGscWatchlist() } });
    }
    if (tool === "pr") {
      return NextResponse.json({ success: true, data: { pr: await getPrOutreach() } });
    }
    return NextResponse.json({ success: true, data: { news: await getNewsWorkflow() } });
  } catch (error) {
    console.error("growth-tools GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت پیکربندی ابزارهای رشد" },
      { status: 500 }
    );
  }
}

/* ============ PUT ============ */

export async function PUT(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  try {
    const body = (await req.json().catch(() => null)) as { tool?: unknown; data?: unknown } | null;
    const tool = typeof body?.tool === "string" ? (body.tool as ToolId) : null;

    if (!tool || !TOOL_IDS.includes(tool)) {
      return NextResponse.json(
        { success: false, error: "فیلد tool باید یکی از gsc | pr | news باشد" },
        { status: 400 }
      );
    }

    let saved:
      | { kind: "gsc"; config: GscWatchlistConfig }
      | { kind: "pr"; config: PrOutreachConfig }
      | { kind: "news"; config: NewsWorkflowConfig };

    if (tool === "gsc") {
      const { config, error } = normalizeGsc(body?.data);
      if (error || !config) {
        return NextResponse.json({ success: false, error: error || "پیکربندی نامعتبر" }, { status: 400 });
      }
      saved = { kind: "gsc", config: await saveGscWatchlist(config) };
    } else if (tool === "pr") {
      const { config, error } = normalizePr(body?.data);
      if (error || !config) {
        return NextResponse.json({ success: false, error: error || "پیکربندی نامعتبر" }, { status: 400 });
      }
      saved = { kind: "pr", config: await savePrOutreach(config) };
    } else {
      const { config, error } = normalizeNews(body?.data);
      if (error || !config) {
        return NextResponse.json({ success: false, error: error || "پیکربندی نامعتبر" }, { status: 400 });
      }
      saved = { kind: "news", config: await saveNewsWorkflow(config) };
    }

    // خلاصهٔ تغییر برای هر دو رویداد ممیزی
    const summary =
      saved.kind === "gsc"
        ? { key: GSC_WATCHLIST_KEY, rows: saved.config.rows.length }
        : saved.kind === "pr"
        ? { key: PR_OUTREACH_KEY, media: saved.config.media.length, activityLog: saved.config.activityLog.length }
        : { key: NEWS_WORKFLOW_KEY, activeNews: saved.config.activeNews.length, history: saved.config.history.length };

    // رویداد ممیزی ۱ — الگوی anti-fraud (auditLog با tenantId=PLATFORM).
    // نکتهٔ زیرساخت: در این DB هنوز Tenant با id=PLATFORM وجود ندارد و FK
    // این درج را رد می‌کند؛ الگوی مرجع آن را با catch بی‌صدا می‌بلعد
    // (رفتار یکسان با anti-fraud). برای ثبتِ واقعیِ قابل‌مشاهده، رویداد
    // دوم در platformAuditLog (الگوی ab-titles) نوشته می‌شود.
    await db.auditLog
      .create({
        data: {
          tenantId: "PLATFORM",
          action: "GROWTH_TOOLS_UPDATE",
          entity: TOOL_LABELS[saved.kind],
          entityId: summary.key,
          changes: JSON.stringify(summary),
        },
      })
      .catch(() => {
        /* audit نباید عملیات را متوقف کند */
      });

    // رویداد ممیزی ۲ — platformAuditLog (نمای «لاگ تغییرات» پنل)
    await db.platformAuditLog
      .create({
        data: {
          superAdminId: admin.id,
          action: "GROWTH_TOOLS_UPDATE",
          entity: TOOL_LABELS[saved.kind],
          entityId: summary.key,
          details: JSON.stringify(summary),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      })
      .catch(() => {
        /* audit نباید عملیات را متوقف کند */
      });

    const message =
      saved.kind === "gsc"
        ? `فهرست پایش GSC ذخیره شد — ${saved.config.rows.length} صفحه`
        : saved.kind === "pr"
        ? `کیت Digital PR ذخیره شد — ${saved.config.media.length} رسانه، ${saved.config.activityLog.length} رویداد`
        : `گردش‌کار خبر ۴۸ ساعته ذخیره شد — ${saved.config.activeNews.length} خبر فعال، ${saved.config.history.length} تاریخچه`;

    return NextResponse.json({
      success: true,
      message,
      data: { tool: saved.kind, config: saved.config },
    });
  } catch (error) {
    console.error("growth-tools PUT error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در ذخیرهٔ پیکربندی ابزارهای رشد" },
      { status: 500 }
    );
  }
}
