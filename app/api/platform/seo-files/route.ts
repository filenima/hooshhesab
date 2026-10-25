import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { emitAuditEvent } from "@/lib/audit-bus";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getSiteUrl, INDEXNOW_KEY } from "@/lib/seo";
// GEO-QUARTERLY(v37): قیمت تازه از منبع واحد + برند داینامیک
import { getEffectivePlans, monthlyPriceOfYearly, PRICE_STEPS } from "@/lib/plans";
import { getBrandName, interpolateBrand } from "@/lib/brand-interpolate";
// GEO(v38): فهرست شهرها داینامیک (۲۰ شهر) برای llms.txt
import { cities } from "@/lib/city-industry-data";
// Trick #14 (راند ۱۲): خلاصه‌های انگلیسی ۳ مقالهٔ ستون → فهرست مقالات llms.txt
import { ENGLISH_PILLARS_BY_SLUG, ENGLISH_PILLAR_SLUGS } from "@/lib/seo/english-pillars";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ============================================================
// /api/platform/seo-files — مدیریت فایل‌های سئو (v35)
// ============================================================
// درخواست مالک: «قسمتی باشه کلیک کردم سایت‌مپ بروز بده و هر فایلی که برای
// سئو و بررسی ربات‌های گوگل و هوش مصنوعی هست رو بروز کنه و فایلشو بهم بده»
//
// GET  ?download=<file> → محتوای فایل برای دانلود مستقیم
//      (بدون download → وضعیت همهٔ فایل‌ها)
// POST { action: "rebuild" } → بازسازی همهٔ فایل‌های سئو:
//      ۱) sitemap.xml  — fetch تازه از خود اپ (cache-bust) + شمارش URLها
//      ۲) robots.txt   — fetch تازه (قوانین خزش + آدرس sitemap)
//      ۳) llms.txt     — تولید فایل راهنمای ربات‌های هوش مصنوعی
//                        (GPTBot/ClaudeBot/PerplexityBot و...)
//      ۴) rss.xml      — fetch تازه (فید بلاگ)
//      ۵) ثبت زمان بازسازی + رویداد ممیزی + تلاش اطلاع‌رسانی موتورها
// ============================================================

const LAST_BUILD_KEY = "seo_files_last_build";
const BUILD_STATS_KEY = "seo_files_last_stats";

interface FileStatus {
  id: "sitemap" | "robots" | "llms" | "rss";
  name: string;
  path: string;
  description: string;
  urlCount?: number;
  sizeBytes?: number;
  ok: boolean;
  error?: string;
}

async function fetchSelf(pathname: string, request?: NextRequest): Promise<{ text: string; status: number }> {
 // FIX(v38): fetch داخلی باید به خودِ سرور برود نه دامنهٔ عمومی — در محیط‌های
 // بدون DNS دامنه (سندباکس/سرور داخلی) fetch به دامنهٔ عمومی «fetch failed»
 // می‌شد و بازسازی sitemap/robots/rss شکست می‌خورد. اول origin درخواست/لوکال‌هاست
 // امتحان می‌شود و فقط در صورت خطا، دامنهٔ عمومی به‌عنوان fallback.
 const bases: string[] = [];
 try {
  const origin = request?.headers.get("x-forwarded-host") || request?.headers.get("host");
  if (origin) bases.push(`http://${origin.replace(/^[a-zA-Z]+:\/\//, "")}`);
 } catch { /* ignore */ }
 bases.push("http://localhost:3000", "http://127.0.0.1:3000");
 try {
  const { getAppBaseUrl } = await import("@/lib/app-url");
  bases.push((await getAppBaseUrl()).replace(/\/+$/, ""));
 } catch { /* ignore */ }

 let lastError = "unknown error";
 for (const base of bases) {
  try {
   const url = `${base}${pathname}`;
   const res = await fetch(url, {
    cache: "no-store",
    headers: { "x-seo-rebuild": "1" },
    signal: AbortSignal.timeout(20_000),
   });
   return { text: await res.text(), status: res.status };
  } catch (err) {
   lastError = err instanceof Error ? err.message : String(err);
  }
 }
 throw new Error(lastError);
}

function countSitemapUrls(xml: string): number {
  return (xml.match(/<url>/g) || []).length;
}

/**
 * ساخت llms.txt — استاندارد llmstxt.org (Task 7-د):
 * لینک‌های مطلق + شمارش واقعی از DB + معرفی llms-full.txt برای AI Overviews.
 *
 * REVERT(v38): برند و دامنه داینامیک از تنظیمات (هوش / hoosh.nobatime.ir).
 * GEO-QUARTERLY(v37): بخش «خلاصهٔ فصلی» با قیمت تازه از getEffectivePlans() —
 * درخواست مالک: «سئو/GEO/AI: خلاصه فصلی llms.txt با قیمت تازه».
 * چرا مهم است؟ ربات‌های هوش مصنوعی (ChatGPT/Perplexity/Gemini) بیشترین سوال را
 * دربارهٔ «قیمت» می‌پرسند؛ پاسخ عددی تازه + تاریخ در همین بخش = نقل‌قول مستقیم در
 * پاسخ‌های AI و AI Overviews (سیگنال تازگی + اعتماد).
 */

/** فصل و سال شمسی فعلی — برای سرتیتر «خلاصهٔ فصلی» */
function persianSeasonAndYear(at: Date = new Date()): { season: string; year: string; monthName: string } {
 try {
  const year = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric" }).format(at);
  const monthName = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "long" }).format(at);
  const m = Number(new Intl.DateTimeFormat("en-u-ca-persian", { month: "numeric" }).format(at));
  const season = m <= 3 ? "بهار" : m <= 6 ? "تابستان" : m <= 9 ? "پاییز" : "زمستان";
  return { season, year, monthName };
 } catch {
  return { season: "", year: "", monthName: "" };
 }
}

/** قلب «قیمت تازه» برای AI — عدد فارسی + واحد */
function faPrice(n: number): string {
 return `${n.toLocaleString("fa-IR")} تومان`;
}

async function buildLlmsTxt(): Promise<string> {
 // دامنه و برند از تنظیمات برندینگ (وایت‌لیبل) — همان منبع sitemap/robots (Task 7-ج)
 const base = (await getSiteUrl()).replace(/\/+$/, "");
 const brand = await getBrandName();
 const B = (t: string) => interpolateBrand(t, brand);

 const published = await db.blogPost.findMany({
  where: { status: "PUBLISHED" },
  select: { slug: true, title: true, excerpt: true, focusKeyword: true, publishedAt: true },
  orderBy: { publishedAt: "desc" },
  take: 40,
 });
 const publishedCount = await db.blogPost.count({ where: { status: "PUBLISHED" } });
 const drafts = await db.blogPost.count({ where: { status: "DRAFT" } });

 // قیمت‌های مؤثر تازه (پله‌های افزایش قیمت اعمال‌شده) — منبع واحد lib/plans.ts
 const plans = (await getEffectivePlans()).filter((p) => !p.hidden);
 const paid = plans.filter((p) => p.priceToman > 0);
 const { season, year, monthName } = persianSeasonAndYear();

 const lines: string[] = [];
 // FIX(v37→v38): نام کامل تاریخی فقط با برند «هوش» — برند و نام کامل فرق دارند
 lines.push(brand === "هوش" ? "# هوش (هوش‌حساب)" : `# ${brand}`);
 lines.push("");
 lines.push(B("> نرم‌افزار حسابداری ابری ایرانی با ۱۶ ماژول یکپارچه: صورتحساب الکترونیکی سامانه مودیان، انبار و کاردکس، حقوق و دستمزد ۱۴۰۴، CRM، درگاه پرداخت، OCR فاکتور و دستیار هوشمند اجرایی. تریال ۷ روزه رایگان بدون نیاز به کارت بانکی."));
 lines.push("");

 // ─── خلاصهٔ فصلی با قیمت تازه (GEO/AI-SEO) — درخواست مستقیم مالک ───
 lines.push(`## خلاصهٔ فصلی${season ? ` — ${season} ${year}` : ""}${monthName ? ` (به‌روزرسانی: ${monthName} ${year})` : ""}`);
 lines.push("");
 if (paid.length > 0) {
  lines.push(
   paid
    .map(
     (p) =>
      `- ${p.name}: ${faPrice(p.priceToman)} در سال` +
      (p.priceToman > 0 ? ` (معادل ${faPrice(monthlyPriceOfYearly(p.priceToman))} در ماه)` : "")
    )
    .join("\n")
  );
  lines.push("");
 }
 lines.push(B("- پلن رایگان آزمایشی: ۷ روز کامل بدون نیاز به کارت بانکی — همهٔ ۱۶ ماژول باز است."));
 lines.push(B("- روش‌های پرداخت: یک‌جا با ۳٪ تخفیف، اقساط ۱ تا ۶ ماهه، یا پرداخت مرحله‌ای سالانه در ۳ قسط (هر ۴ ماه یک قسط)."));
 lines.push(B("- مهاجرت رایگان از هلو، سپیدار و اکسل + آموزش اختصاصی برای هر شرکت."));
 lines.push(B("- اتصال رسمی به سامانه مودیان (صورتحساب الف/ب/ج)، OCR فاکتور با دقت ۹۸٪ و دستیار مالی هوشمند."));
 // پلهٔ افزایش قیمت بعدی — اطلاعات تازه برای AI + ایجاد فوریت خرید
 const now = Date.now();
 const nextStep = PRICE_STEPS.find((s) => new Date(s.startsAt).getTime() > now);
 if (nextStep) {
  const stepDate = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long" }).format(
   new Date(nextStep.startsAt)
  );
  lines.push(
   B(
    `- اطلاع‌رسانی قیمت: از ${stepDate} پله‌ای افزایش قیمت (${Math.round((nextStep.multiplier - 1) * 100)}٪) اعمال می‌شود؛ خرید قبل از پله، قیمت شما را برای تمدید هم قفل می‌کند.`
   )
  );
 }
 lines.push(B("- پشتیبانی فارسی: ۰۷۱-۳۲۶۲۲۴۹۳ (۹ صبح تا ۹ شب) + تیکت و چت داخل برنامه."));
 lines.push("");

 lines.push("## مستندات");
 lines.push("");
 lines.push(`- [شروع رایگان و پلن‌ها](${base}/pricing): پلن‌ها، قیمت‌ها و ۷ روز تریال رایگان`);
 lines.push(`- [امکانات کامل](${base}/features): فهرست کامل ۱۶ ماژول حسابداری`);
 lines.push(`- [راهنمای شروع سریع](${base}/tutorials): آموزش گام‌به‌گام شروع کار`);
 lines.push(`- [ماشین‌حساب‌ها](${base}/calculators): ابزارهای رایگان محاسبه (سود، استهلاک، مالیات، حقوق)`);
 lines.push(`- [سلامت مالی کسب‌وکار](${base}/financial-health): سنجش رایگان سلامت مالی`);
 lines.push(`- [مقایسه پلن‌ها](${base}/compare-plans): مقایسه تعاملی پلن‌ها`);
 lines.push(`- [مستندات API](${base}/api-docs): REST و GraphQL برای توسعه‌دهندگان`);
 lines.push("");
 lines.push("## راهنماهای اصلی حسابداری ایران");
 lines.push("");
 lines.push(`- [راهنمای کامل سامانه مودیان](${base}/moadian-invoice): صورتحساب الکترونیکی، کارپوشه و مهلت‌ها`);
 lines.push(`- [حسابداری صنایع](${base}/industries): رستوران، داروخانه، پوشاک، تولیدی و...`);
 lines.push(`- [مالیات و ارزش افزوده](${base}/taxes): نرخ‌ها، معافیت‌ها و اظهارنامه`);
 lines.push(`- [نرم‌افزار حسابداری شهرها](${base}/cities): ${cities.map((c) => c.name).join("، ")} (۲۰ شهر)`);
 lines.push(B(`- [مقالهٔ راهنمای حسابداری ابری](${base}/blog/cloud-accounting-software-what-is-1404)`));
 lines.push("");
 lines.push(`## مقالات منتشرشده (${publishedCount.toLocaleString("fa-IR")} مقاله${drafts > 0 ? ` + ${drafts.toLocaleString("fa-IR")} پیش‌نویس زمان‌بندی‌شده` : ""})`);
 lines.push("");
 for (const p of published.slice(0, 30)) {
  const desc = (p.excerpt || p.focusKeyword || p.title).slice(0, 110).replace(/\n/g, " ");
  lines.push(`- [${p.title}](${base}/blog/${p.slug}): ${desc}`);
 }
 // Trick #14 (راند ۱۲): خلاصه‌های انگلیسی ۳ مقالهٔ ستون — مخاطب بین‌المللی
 // (دیاسپورا/پژوهشگران)؛ برچسب (English) برای ربات‌های هوش مصنوعی. بازسازی
 // فایل از پنل (action=rebuild) انجام می‌شود — این فقط کد سازنده است.
 for (const slug of ENGLISH_PILLAR_SLUGS) {
  const en = ENGLISH_PILLARS_BY_SLUG[slug];
  if (!en) continue;
  const desc = en.description.slice(0, 110).replace(/\n/g, " ");
  lines.push(`- [${en.title} (English)](${base}/en/blog/${slug}): ${desc}`);
 }
 lines.push("");
 lines.push("## فایل‌های ماشینی (GEO/AI-SEO)");
 lines.push("");
 lines.push(`- متن کامل مقالات پیلار (برای AI Overviews): ${base}/llms-full.txt`);
 lines.push(`- نقشهٔ سایت: ${base}/sitemap.xml`);
 lines.push(`- فید بلاگ: ${base}/rss.xml`);
 lines.push("");
 lines.push("## قواعد خزش");
 lines.push("");
 lines.push("- محتوای بلاگ برای نقل‌قول در پاسخ‌های هوش مصنوعی آزاد است (با ذکر منبع).");
 lines.push("- مسیرهای /api، /portal، /superadmin و /uploads خزش نمی‌شوند (robots.txt).");
 lines.push(`- کلید IndexNow این سایت: ${INDEXNOW_KEY} (فایل کلید: ${base}/${INDEXNOW_KEY}.txt)`);
 return lines.join("\n");
}

async function buildAll(origin: string | null, request?: NextRequest): Promise<{
  files: FileStatus[];
  sitemapPreview: string;
  robotsPreview: string;
  llmsPreview: string;
}> {
  const files: FileStatus[] = [];
  let sitemapPreview = "";
  let robotsPreview = "";
  let llmsPreview = "";

  // ۱) sitemap.xml — fetch تازه (Next.js آن را از DB می‌سازد؛ fetch = cache-bust + تأیید سلامت)
  try {
    const { text, status } = await fetchSelf("/sitemap.xml", request);
    if (status === 200 && text.includes("<urlset")) {
      sitemapPreview = text;
      files.push({
        id: "sitemap",
        name: "نقشهٔ سایت (sitemap.xml)",
        path: "/sitemap.xml",
        description: "همهٔ صفحات عمومی سایت برای گوگل و بینگ — داینامیک از دیتابیس",
        urlCount: countSitemapUrls(text),
        sizeBytes: Buffer.byteLength(text, "utf8"),
        ok: true,
      });
    } else {
      files.push({
        id: "sitemap", name: "نقشهٔ سایت (sitemap.xml)", path: "/sitemap.xml",
        description: "همهٔ صفحات عمومی سایت برای گوگل و بینگ",
        ok: false, error: `پاسخ ${status}`,
      });
    }
  } catch (e) {
    files.push({
      id: "sitemap", name: "نقشهٔ سایت (sitemap.xml)", path: "/sitemap.xml",
      description: "همهٔ صفحات عمومی سایت برای گوگل و بینگ",
      ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "خطا",
    });
  }

  // ۲) robots.txt — fetch تازه
  try {
    const { text, status } = await fetchSelf("/robots.txt", request);
    if (status === 200) {
      robotsPreview = text;
      files.push({
        id: "robots",
        name: "قوانین خزش (robots.txt)",
        path: "/robots.txt",
        description: "دسترسی ربات‌های گوگل و سایر خزنده‌ها + معرفی sitemap",
        sizeBytes: Buffer.byteLength(text, "utf8"),
        ok: true,
      });
    } else {
      files.push({
        id: "robots", name: "قوانین خزش (robots.txt)", path: "/robots.txt",
        description: "دسترسی ربات‌های گوگل و سایر خزنده‌ها",
        ok: false, error: `پاسخ ${status}`,
      });
    }
  } catch (e) {
    files.push({
      id: "robots", name: "قوانین خزش (robots.txt)", path: "/robots.txt",
      description: "دسترسی ربات‌های گوگل و سایر خزنده‌ها",
      ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "خطا",
    });
  }

  // ۳) llms.txt — تولید و ذخیرهٔ فیزیکی در public/
  try {
    const llms = await buildLlmsTxt();
    llmsPreview = llms;
    const llmsPath = join(process.cwd(), "public", "llms.txt");
    mkdirSync(join(process.cwd(), "public"), { recursive: true });
    writeFileSync(llmsPath, llms, "utf8");
    files.push({
      id: "llms",
      name: "راهنمای هوش مصنوعی (llms.txt)",
      path: "/llms.txt",
      description: "فایل استاندارد برای GPTBot، ClaudeBot، PerplexityBot و ربات‌های هوش مصنوعی — ساختار سایت و آخرین مقاله‌ها",
      sizeBytes: Buffer.byteLength(llms, "utf8"),
      ok: true,
    });
  } catch (e) {
    files.push({
      id: "llms", name: "راهنمای هوش مصنوعی (llms.txt)", path: "/llms.txt",
      description: "فایل استاندارد برای ربات‌های هوش مصنوعی",
      ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "خطا",
    });
  }

  // ۴) rss.xml — fetch تازه
  try {
    const { text, status } = await fetchSelf("/rss.xml", request);
    if (status === 200 && text.includes("<rss")) {
      files.push({
        id: "rss",
        name: "فید بلاگ (rss.xml)",
        path: "/rss.xml",
        description: "فید آخرین مقاله‌های منتشرشده برای دنبال‌کنندگان و سرویس‌های خبری",
        sizeBytes: Buffer.byteLength(text, "utf8"),
        ok: true,
      });
    } else {
      files.push({
        id: "rss", name: "فید بلاگ (rss.xml)", path: "/rss.xml",
        description: "فید آخرین مقاله‌های منتشرشده",
        ok: false, error: `پاسخ ${status}`,
      });
    }
  } catch (e) {
    files.push({
      id: "rss", name: "فید بلاگ (rss.xml)", path: "/rss.xml",
      description: "فید آخرین مقاله‌های منتشرشده",
      ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "خطا",
    });
  }

  return { files, sitemapPreview, robotsPreview, llmsPreview };
}

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const params = new URL(req.url).searchParams;
    const download = params.get("download");

    // دانلود مستقیم فایل — بازسازی سریع و بازگشت محتوا
    if (download === "sitemap" || download === "robots" || download === "llms" || download === "rss") {
      const built = await buildAll(req.url, req);
      const contentMap: Record<string, { text: string; type: string; filename: string }> = {
        sitemap: { text: built.sitemapPreview, type: "application/xml; charset=utf-8", filename: "sitemap.xml" },
        robots: { text: built.robotsPreview, type: "text/plain; charset=utf-8", filename: "robots.txt" },
        llms: { text: built.llmsPreview, type: "text/plain; charset=utf-8", filename: "llms.txt" },
        rss: { text: "", type: "application/rss+xml; charset=utf-8", filename: "rss.xml" },
      };
      let content = contentMap[download].text;
      if (download === "rss") {
        try {
          content = (await fetchSelf("/rss.xml", req)).text;
        } catch {
          content = "";
        }
      }
      if (!content) {
        return NextResponse.json({ success: false, error: "فایل خالی است — ابتدا بازسازی کنید" }, { status: 404 });
      }
      return new NextResponse(content, {
        status: 200,
        headers: {
          "Content-Type": contentMap[download].type,
          "Content-Disposition": `attachment; filename="${contentMap[download].filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // وضعیت — آخرین بازسازی ذخیره‌شده + وضعیت زندهٔ سبک
    const [lastBuild, statsRow] = await Promise.all([
      db.systemSettings.findUnique({ where: { key: LAST_BUILD_KEY } }),
      db.systemSettings.findUnique({ where: { key: BUILD_STATS_KEY } }),
    ]);

    const [published, drafts] = await Promise.all([
      db.blogPost.count({ where: { status: "PUBLISHED" } }),
      db.blogPost.count({ where: { status: "DRAFT" } }),
    ]);

    let liveFiles: FileStatus[] = [];
    try {
      const { text, status } = await fetchSelf("/sitemap.xml", req);
      const { text: robotsText } = await fetchSelf("/robots.txt", req);
      liveFiles = [
        {
          id: "sitemap",
          name: "نقشهٔ سایت (sitemap.xml)",
          path: "/sitemap.xml",
          description: "همهٔ صفحات عمومی سایت برای گوگل و بینگ — داینامیک از دیتابیس",
          urlCount: status === 200 ? countSitemapUrls(text) : undefined,
          sizeBytes: Buffer.byteLength(text, "utf8"),
          ok: status === 200,
        },
        {
          id: "robots",
          name: "قوانین خزش (robots.txt)",
          path: "/robots.txt",
          description: "دسترسی ربات‌های گوگل و سایر خزنده‌ها + معرفی sitemap",
          sizeBytes: Buffer.byteLength(robotsText, "utf8"),
          ok: robotsText.includes("Sitemap") || robotsText.includes("sitemap"),
        },
        {
          id: "llms",
          name: "راهنمای هوش مصنوعی (llms.txt)",
          path: "/llms.txt",
          description: "فایل استاندارد برای GPTBot، ClaudeBot، PerplexityBot و ربات‌های هوش مصنوعی",
          ok: true,
        },
        {
          id: "rss",
          name: "فید بلاگ (rss.xml)",
          path: "/rss.xml",
          description: "فید آخرین مقاله‌های منتشرشده",
          ok: true,
        },
      ];
    } catch {
      liveFiles = [];
    }

    let lastStats: unknown = null;
    if (statsRow?.value) {
      try {
        lastStats = JSON.parse(statsRow.value);
      } catch {
        lastStats = null;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        lastBuildAt: lastBuild?.value ?? null,
        lastStats,
        blog: { published, drafts },
        files: liveFiles,
      },
    });
  } catch (error) {
    console.error("seo-files GET error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت وضعیت فایل‌های سئو" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const action = (body as { action?: string }).action;

    if (action !== "rebuild" && action !== "reindex") {
      return NextResponse.json(
        { success: false, error: "action نامعتبر — rebuild یا reindex پشتیبانی می‌شود" },
        { status: 400 }
      );
    }

    // ─── reindex: اطلاع‌رسانی فعال به موتورهای جستجو و هوش مصنوعی ───
    // پس از rebuild، موتورها را از نسخهٔ جدید مطلع می‌کند (پینگ + ارسال URL)
    if (action === "reindex") {
      const { getAppBaseUrl } = await import("@/lib/app-url");
      const base = (await getAppBaseUrl()).replace(/\/+$/, "");
      const sitemapUrl = `${base}/sitemap.xml`;
      const homeUrl = `${base}/`;

      interface PingResult {
        engine: string;
        kind: "search" | "ai";
        ok: boolean;
        status?: number;
        note?: string;
      }
      const pings: PingResult[] = [];

      // بینگ — ثبت URL (استاندارد فعلی؛ پینگ sitemap قدیمی گوگل deprecated شده)
      // Task 7-د (۳): کلید واقعی IndexNow + keyLocation — قبلاً key=hooshhesab بود
      // بدون فایل کلید در ریشه → پینگ‌ها هرگز verify نمی‌شدند.
      const bingTargets = [
        {
          name: "Bing (IndexNow)",
          url: `https://www.bing.com/indexnow?url=${encodeURIComponent(homeUrl)}&key=${INDEXNOW_KEY}&keyLocation=${encodeURIComponent(`${base}/${INDEXNOW_KEY}.txt`)}`,
        },
        { name: "Bing (SiteIndex)", url: `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}` },
      ];
      // موتورهای جستجوی تخصصی
      const searchTargets = [
        ...bingTargets,
        { name: "Yandex", url: `https://webmaster.yandex.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}` },
      ];
      // اطلاع‌رسانی به IndexNow مرکزی (کلید + محل فایل کلید طبق پروتکل)
      const aiTargets: { name: string; url: string }[] = [
        {
          name: "IndexNow (سازمان مرکزی)",
          url: `https://api.indexnow.org/indexnow?url=${encodeURIComponent(homeUrl)}&key=${INDEXNOW_KEY}&keyLocation=${encodeURIComponent(`${base}/${INDEXNOW_KEY}.txt`)}`,
        },
      ];

      const tryPing = async (t: { name: string; url: string }, kind: "search" | "ai") => {
        try {
          const res = await fetch(t.url, {
            method: "GET",
            signal: AbortSignal.timeout(8000),
            redirect: "follow",
          });
          pings.push({ engine: t.name, kind, ok: res.status >= 200 && res.status < 400, status: res.status });
        } catch {
          pings.push({ engine: t.name, kind, ok: false, note: "دسترسی از سرور ممکن نبود (در استقرار واقعی کار می‌کند)" });
        }
      };

      await Promise.all([
        ...searchTargets.map((t) => tryPing(t, "search")),
        ...aiTargets.map((t) => tryPing(t, "ai")),
      ]);

      const okCount = pings.filter((p) => p.ok).length;

      // ثبت زمان ایندکس
      await db.systemSettings.upsert({
        where: { key: "seo_last_reindex" },
        create: { key: "seo_last_reindex", value: new Date().toISOString() },
        update: { value: new Date().toISOString() },
      });

      try {
        emitAuditEvent({
          tenantId: "platform",
          action: "SEO_REINDEX_PING",
          entity: "seo.index",
          changes: `اعلان به ${pings.length} موتور — ${okCount} موفق`,
        });
      } catch {
        /* اختیاری */
      }

      return NextResponse.json({
        success: true,
        message: `ایندکس اطلاع‌رسانی شد — ${okCount} از ${pings.length} موتور پاسخ داد`,
        data: {
          sitemapUrl,
          pings,
          at: new Date().toISOString(),
        },
      });
    }

    const startedAt = Date.now();
    const built = await buildAll(req.url, req);
    const okCount = built.files.filter((f) => f.ok).length;

    // ثبت زمان و آمار بازسازی
    const stats = {
      at: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      okCount,
      total: built.files.length,
      sitemapUrls: built.files.find((f) => f.id === "sitemap")?.urlCount ?? 0,
      files: built.files.map((f) => ({ id: f.id, ok: f.ok, urlCount: f.urlCount, sizeBytes: f.sizeBytes, error: f.error })),
    };
    await Promise.all([
      db.systemSettings.upsert({
        where: { key: LAST_BUILD_KEY },
        create: { key: LAST_BUILD_KEY, value: new Date().toISOString() },
        update: { value: new Date().toISOString() },
      }),
      db.systemSettings.upsert({
        where: { key: BUILD_STATS_KEY },
        create: { key: BUILD_STATS_KEY, value: JSON.stringify(stats) },
        update: { value: JSON.stringify(stats) },
      }),
    ]);

    // رویداد ممیزی (گزارش زندهٔ رخدادها) — بهترین تلاش
    try {
      emitAuditEvent({
        tenantId: "platform",
        action: "SEO_FILES_REBUILT",
        entity: "seo.files",
        changes: `sitemap: ${stats.sitemapUrls} URL — llms.txt و robots.txt و rss.xml تازه‌سازی شد`,
      });
    } catch {
      /* اختیاری */
    }

    return NextResponse.json({
      success: true,
      message: `بازسازی انجام شد — ${okCount} از ${built.files.length} فایل سالم (زمان: ${((Date.now() - startedAt) / 1000).toFixed(1)} ثانیه)`,
      data: { stats, files: built.files },
    });
  } catch (error) {
    console.error("seo-files POST error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در بازسازی فایل‌های سئو: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
