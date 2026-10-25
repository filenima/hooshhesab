// ============================================================================
// scripts/fix-chinese-db.ts — پاکسازی نهایی کاراکترهای چینی (CJK) از BlogPost
// ----------------------------------------------------------------------------
// Task 7-الف: ۲۸ پست بلاگ (۱۳ PUBLISHED لایو در گوگل + ۱۵ DRAFT در صف انتشار)
// در دیتابیس کاراکتر چینی/CJK دارند. این اسکریپت:
//   ۱) همهٔ ۱۷۴+ پست را در همهٔ فیلدهای متنی اسکن می‌کند
//      (title, content, excerpt, metaTitle, metaDescription, tags, focusKeyword)
//   ۲) جایگزینی‌های دقیقِ بازبینی‌شده (معنی‌دار، فارسی روان) را اعمال می‌کند
//   ۳) هر ران CJK ناشناختهٔ باقی‌مانده را حذف و گزارش می‌کند (unexpected)
//   ۴) علائم نیمه‌پهن چینی (，。：؛...) را به معادل فارسی تبدیل می‌کند
//   ۵) در پایان verify می‌کند: تعداد کاراکتر CJK در کل جدول = ۰
//
// Idempotent: اجرای چندباره اثری ندارد (پس از پاک شدن، چیزی برای جایگزینی نیست).
//
// اجرا:
//   DATABASE_URL="file:/home/z/my-project/hooshhesab-work/extracted/hooshhesab/db/custom.db" \
//     bun scripts/fix-chinese-db.ts
// ============================================================================

import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

// ─── تعیین مسیر مطلق دیتابیس پروژه (ضد-hijack متغیر محیطی سندباکس) ───
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORCED_DB_URL = `file:${join(PROJECT_ROOT, "db", "custom.db")}`;
process.env.DATABASE_URL = FORCED_DB_URL;

const prisma = new PrismaClient({ log: ["error", "warn"] });

// ============ تشخیص CJK ============
const CJK_IDEO = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const CJK_IDEO_G = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g;
const CJK_FULLWIDTH = /[\u3000-\u303f\uff00-\uffef]/;

/** شمارش کاراکترهای ایديوگراف CJK یک رشته */
export function countCJK(s: string | null | undefined): number {
  if (!s) return 0;
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (
      (c >= 0x3400 && c <= 0x4dbf) ||
      (c >= 0x4e00 && c <= 0x9fff) ||
      (c >= 0xf900 && c <= 0xfaff)
    )
      n++;
  }
  return n;
}

// ============ جایگزینی هوشمند (با اصلاح خودکار فاصلهٔ چسبیده) ============
// prev: اگر حرف/رقم یا نقطه‌گذاری «بسته» (نقطه، کاما، پرانتز بسته...) است → فاصله لازم است
// next: فقط اگر «حرف/رقم» باشد فاصله لازم است — نه علائم (کاما بعد از جایگزین نباید فاصله بگیرد)
const PREV_LETTER = /[\u0600-\u06FF\u06f0-\u06f90-9A-Za-z]/;
const PREV_PUNCT_NEEDS_SPACE = /[.:،؛!؟?)\]»"…]/;
const NEXT_LETTER = /[\u0621-\u063a\u0641-\u064a\u066e-\u06d5\u06f0-\u06f90-9A-Za-z]/;
const REP_START_PUNCT = /^[\s،؛.,:()\[\]«»"'!?؟\-—]/;
const REP_END_PUNCT = /[\s،؛.,:()\[\]«»"'!?؟\-—]$/;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** جایگزینی با فاصله‌گذاری درست در مرز فارسی↔جایگزین */
function smartReplace(text: string, pattern: RegExp, rep: string): string {
  return text.replace(pattern, (m: string, off: number, full: string) => {
    const prev = off > 0 ? full[off - 1] : "";
    const nextIdx = off + m.length;
    const next = nextIdx < full.length ? full[nextIdx] : "";
    let r = rep;
    if (
      prev &&
      (PREV_LETTER.test(prev) || PREV_PUNCT_NEEDS_SPACE.test(prev)) &&
      !REP_START_PUNCT.test(r)
    ) {
      r = " " + r;
    }
    if (next && NEXT_LETTER.test(next) && !REP_END_PUNCT.test(r)) {
      r = r + " ";
    }
    return r;
  });
}

// ============ تعمیر مواضعی که در اجرای اول آسیب دیدند ============
// (ران CJK با ZWNJ چسبیده که الگوی «optional-ZWNJ» به‌خاطر escapeRegex
// match نشد و به‌صورت ناقص حذف شد — اینجا دقیقاً از حالت فعلی تعمیر می‌شوند)
const REPAIRS: Array<[RegExp, string]> = [
  [new RegExp("دارد:ی متمرکز و توزیع", "g"), "دارد: الگوی مدیریت متمرکز و توزیع"],
  [new RegExp("داشتنبوردهای", "g"), "داشتن داشبوردهای"],
  [new RegExp("زمان\\u200c?شده", "g"), "زمان تخمینی"],
  [new RegExp("\\.از یک طرف ، هزینه", "g"), ". از طرف دیگر، هزینه"],
  [new RegExp(": از یک طرف ،", "g"), ": از یک طرف،"],
  [new RegExp("حوله\\u200c?یک\\u200c?بار مصرف", "g"), "حوله‌های یک‌بارمصرف"],
  [
    new RegExp("سایرین فقط کافی است مالیات نهایی را پرداخت می\\u200c?کنند", "g"),
    "برای سایرین فقط پرداخت مالیات نهایی کافی است",
  ],
  [new RegExp("بیکاری غیر داوطلبانه", "g"), "بیکاری غیرداوطلبانه"],
  // فاصله‌گذاری‌های نادرست ناشی از پاس اول
  [new RegExp("متوسط ،", "g"), "متوسط،"],
  [new RegExp("لحظه‌ای ،", "g"), "لحظه‌ای،"],
  [new RegExp("\\( پس از کسر", "g"), "(پس از کسر"],
  [new RegExp("ترسیم ،", "g"), "ترسیم،"],
];

// ============ جدول جایگزینی‌ها — ترتیب مهم: خاص → عام ============
// هر ورودی: [الگوی regex، متن فارسی جایگزین]
// ZWNJ اختیاری (\u200c?) در مرزهای فارسی↔چینی درج شده تا فایل حتی اگر
// نویسهٔ نامرئی ZWNJ بین آن‌ها باشد هم MATCH شود.
const REPLACEMENTS: Array<[RegExp, string]> = [
  // ۱) جملهٔ کاملاً چینی — پست best-accounting-software-iran-1404
  [
    new RegExp(escapeRegex("不仅能处理多公司的账务，还要具备强大的报告生成能力和数据安全保障"), "g"),
    "باید هم‌زمان حساب‌های چند شرکت را مدیریت کند و از گزارش‌سازی قدرتمند و امنیت داده قوی برخوردار باشد",
  ],
  // ۲) پاراگراف انگلیسی با «想象一下» — پست accounting-software-security-checklist
  [
    new RegExp(
      escapeRegex(
        "想象一下 that a customer is sending their payment details to your accounting software, or your accountant is accessing financial reports from home. If this data is not encrypted, it's like sending a postcard with all your secrets written on it – anyone along the way can read it."
      ),
      "g"
    ),
    "تصور کنید مشتری‌ای جزئیات پرداخت خود را به نرم‌افزار حسابداری شما می‌فرستد یا حسابدار شما از خانه به گزارش‌های مالی دسترسی دارد. اگر این داده‌ها رمزنگاری نشده باشند، مثل این است که کارت‌پستالی با تمام اسرارتان پست کنید — هرکسی در مسیر می‌تواند آن را بخواند.",
  ],
  // ۳) عبارت‌های دقیق (چسبیده به فارسی)
  [new RegExp(escapeRegex("فرآیند报销"), "g"), "فرآیند ثبت هزینه‌ها"],
  [new RegExp(escapeRegex("ممکن只需要"), "g"), "ممکن است فقط"],
  [new RegExp(escapeRegex("از نظر纸上"), "g"), "روی کاغذ"],
  [new RegExp("سوددهی\u200c?纸上\u200c?ی", "g"), "سوددهی کاغذی"],
  [new RegExp(escapeRegex("纸上"), "g"), "روی کاغذ"],
  [new RegExp("管理模式\u200c?ی", "g"), "الگوی مدیریت"],
  [new RegExp("仪表\u200c?بوردهای", "g"), "داشبوردهای"],
  [new RegExp(escapeRegex("IP地址"), "g"), "آدرس IP"],
  [new RegExp(escapeRegex("اطلاعات غ误导 کند"), "g"), "اطلاعات غلط گمراه کند"],
  [new RegExp(escapeRegex("،特别是"), "g"), "، به‌ویژه"],
  [new RegExp(escapeRegex("特别是"), "g"), "به‌ویژه"],
  [new RegExp(escapeRegex("中小企业"), "g"), "کسب‌وکارهای کوچک و متوسط"],
  [new RegExp(escapeRegex("违约"), "g"), "نقض قرارداد"],
  [new RegExp(escapeRegex("实时"), "g"), "لحظه‌ای"],
  [new RegExp(escapeRegex("但仍"), "g"), "ولی همچنان"],
  [new RegExp(escapeRegex("一台"), "g"), "یک دستگاه"],
  [new RegExp(escapeRegex("自然人"), "g"), "حقیقی"],
  [new RegExp("不仅\u200c?نهایت", "g"), "در نهایت"],
  [new RegExp(escapeRegex("不仅要"), "g"), "نه‌تنها باید"],
  [new RegExp(escapeRegex("主要通过"), "g"), "عمدتاً از طریق"],
  [new RegExp(escapeRegex("技术上"), "g"), "از نظر فنی"],
  [new RegExp("预估\u200c?شده", "g"), "تخمینی"],
  [new RegExp(escapeRegex("一批"), "g"), "یک محموله"],
  [new RegExp(escapeRegex("这意味着"), "g"), "یعنی"],
  [new RegExp("非自愿", "g"), "غیرداوطلبانه"],
  [new RegExp("غیر\u200c?自愿", "g"), "غیرداوطلبانه"],
  [new RegExp(escapeRegex("自愿"), "g"), "داوطلبانه"],
  [new RegExp(escapeRegex("它们"), "g"), "آن‌ها"],
  [new RegExp(escapeRegex("حس و估算"), "g"), "حس و حدس"],
  [new RegExp(escapeRegex("估算ی"), "g"), "برآوردی"],
  [new RegExp(escapeRegex("估算"), "g"), "برآورد"],
  [new RegExp(escapeRegex("被动"), "g"), "منفعلانه"],
  [new RegExp("حوله\u200c?是一次 مصرف", "g"), "حوله‌های یک‌بارمصرف"],
  [new RegExp(escapeRegex("是一次"), "g"), "یک‌بار"],
  [new RegExp(escapeRegex("真正的"), "g"), "واقعاً"],
  [new RegExp(escapeRegex("亏损"), "g"), "زیان"],
  [new RegExp(escapeRegex("بد扣除"), "g"), "پس از کسر"],
  [new RegExp(escapeRegex("扣除"), "g"), "کسر"],
  [new RegExp(escapeRegex("每人"), "g"), "به‌ازای هر نفر"],
  [new RegExp(escapeRegex("绘图"), "g"), "ترسیم"],
  [new RegExp("另一方面", "g"), "از طرف دیگر"],
  [new RegExp("一方面", "g"), "از یک طرف"],
  [new RegExp(escapeRegex("قابل收取"), "g"), "قابل وصول"],
  [new RegExp(escapeRegex("收取"), "g"), "وصول"],
  [new RegExp(escapeRegex("ابلاغ通告"), "g"), "ابلاغیه"],
  [new RegExp(escapeRegex("通告"), "g"), "ابلاغیه"],
  [new RegExp(escapeRegex("有限责任公司"), "g"), "مسئولیت محدود"],
  [new RegExp(escapeRegex("口头"), "g"), "شفاهی"],
  [new RegExp(escapeRegex("诊所"), "g"), "درمانگاه"],
  [
    new RegExp("سایرین仅需 مالیات نهایی را پرداخت می\u200c?کنند", "g"),
    "برای سایرین فقط پرداخت مالیات نهایی کافی است",
  ],
  [new RegExp(escapeRegex("仅需"), "g"), "فقط کافی است"],
  [new RegExp(escapeRegex("迁移"), "g"), "مهاجرت"],
  [new RegExp(escapeRegex("地址"), "g"), "آدرس"],
  [new RegExp(escapeRegex("存在"), "g"), "وجود"],
  [new RegExp(escapeRegex("想象一下"), "g"), "تصور کنید"],
  [new RegExp(escapeRegex("只需"), "g"), "فقط"],
];

// ============ تبدیل علائم نیمه‌پهن چینی ============
const FULLWIDTH_MAP: Record<string, string> = {
  "，": "،",
  "。": ".",
  "：": ":",
  "；": "؛",
  "（": "(",
  "）": ")",
  "！": "!",
  "？": "؟",
  "、": "،",
  "　": " ",
};

interface FieldReport {
  slug: string;
  status: string;
  field: string;
  changes: number;
  samples: string[];
}

async function main() {
  console.log("== fix-chinese-db: پاکسازی کاراکترهای چینی BlogPost ==");
  console.log("DB:", FORCED_DB_URL);

  const posts = await prisma.blogPost.findMany({
    select: {
      id: true,
      slug: true,
      title: true,
      content: true,
      excerpt: true,
      metaTitle: true,
      metaDescription: true,
      tags: true,
      focusKeyword: true,
      status: true,
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(`کل پست‌ها: ${posts.length}`);

  const FIELDS = [
    "title",
    "content",
    "excerpt",
    "metaTitle",
    "metaDescription",
    "tags",
    "focusKeyword",
  ] as const;

  const reports: FieldReport[] = [];
  const unexpected: Array<{ slug: string; field: string; run: string; ctx: string }> = [];
  let fixedPosts = 0;
  let totalReplacements = 0;

  for (const post of posts) {
    const data: Record<string, string> = {};
    let postChanged = false;

    for (const field of FIELDS) {
      const original = post[field] as string | null;
      if (!original) continue;

      let text = original;

      // ۰) تعمیر مواضع آسیب‌دیده از اجرای اول (فارسی↔فارسی — بدون نیاز به CJK)
      for (const [pattern, rep] of REPAIRS) {
        pattern.lastIndex = 0;
        if (pattern.test(text)) {
          pattern.lastIndex = 0;
          const before = text;
          text = smartReplace(text, pattern, rep);
          if (text !== before) {
            totalReplacements++;
            postChanged = true;
            reports.push({
              slug: post.slug,
              status: post.status,
              field,
              changes: 0,
              samples: [
                `تعمیر: «${(pattern.source || "").slice(0, 30)}» → «${rep.slice(0, 40)}»`,
              ],
            });
          }
        }
      }

      if (!CJK_IDEO.test(original)) {
        if (text !== original) {
          data[field] = text;
        }
        continue;
      }

      const before = countCJK(text);
      const appliedSamples: string[] = [];

      // ۱) جایگزینی‌های دقیق (ترتیب: خاص → عام)
      for (const [pattern, rep] of REPLACEMENTS) {
        pattern.lastIndex = 0;
        if (pattern.test(text)) {
          pattern.lastIndex = 0;
          text = smartReplace(text, pattern, rep);
          totalReplacements++;
          const m = original.match(pattern) || original.match(new RegExp(pattern.source));
          if (m && appliedSamples.length < 4) {
            appliedSamples.push(
              `«${(m[0] || "").slice(0, 34)}${(m[0] || "").length > 34 ? "…" : ""}» → «${rep.slice(0, 34)}${rep.length > 34 ? "…" : ""}»`
            );
          }
        }
      }

      // ۲) ران‌های CJK ناشناختهٔ باقی‌مانده → حذف + گزارش unexpected
      if (CJK_IDEO.test(text)) {
        let out = "";
        let lastIdx = 0;
        CJK_IDEO_G.lastIndex = 0;
        let m2: RegExpExecArray | null;
        while ((m2 = CJK_IDEO_G.exec(text)) !== null) {
          const gap = text.slice(lastIdx, m2.index);
          const ctx = text
            .slice(Math.max(0, m2.index - 40), m2.index + m2[0].length + 40)
            .replace(/\s+/g, " ");
          unexpected.push({ slug: post.slug, field, run: m2[0], ctx });
          // فاصلهٔ چسبیده را فقط به‌صورت محلی جمع کن (بدون دست‌زدن به بقیهٔ متن)
          out += gap.replace(/[ \t]{2,}$/, " ");
          lastIdx = m2.index + m2[0].length;
        }
        out += text.slice(lastIdx);
        text = out;
      }

      // ۳) علائم نیمه‌پهن چینی
      if (CJK_FULLWIDTH.test(text)) {
        text = text.replace(/[\u3000-\u303f\uff00-\uffef]/g, (ch) => {
          const mapped = FULLWIDTH_MAP[ch];
          if (mapped !== undefined) return mapped;
          unexpected.push({ slug: post.slug, field, run: ch, ctx: "(fullwidth)" });
          return "";
        });
      }

      const after = countCJK(text);
      if (text !== original && after === 0) {
        data[field] = text;
        postChanged = true;
        reports.push({
          slug: post.slug,
          status: post.status,
          field,
          changes: before,
          samples:
            appliedSamples.length > 0
              ? appliedSamples
              : ["ران CJK ناشناخته حذف شد"],
        });
      } else if (after > 0) {
        console.error(
          `✗ خطا: پس از پردازش هنوز ${after} کاراکتر CJK مانده — [${post.slug}/${field}]`
        );
      }
    }

    if (postChanged) {
      await prisma.blogPost.update({ where: { id: post.id }, data });
      fixedPosts++;
    }
  }

  // ─── گزارش ───
  console.log(
    `\n— پست‌های اصلاح‌شده: ${fixedPosts} (مجموع الگوهای اعمال‌شده: ${totalReplacements})`
  );
  for (const r of reports) {
    console.log(`  ✓ [${r.status}] ${r.slug} | ${r.field} — ${r.changes} کاراکتر CJK`);
    for (const s of r.samples) console.log(`      ${s}`);
  }
  if (unexpected.length > 0) {
    console.log(`\n⚠ ران‌های CJK ناشناختهٔ حذف‌شده (${unexpected.length}):`);
    for (const u of unexpected) {
      console.log(`  - [${u.slug}/${u.field}] "${u.run}" → حذف | بافت: …${u.ctx}…`);
    }
  } else {
    console.log(
      "— هیچ ران CJK ناشناخته‌ای پیدا نشد (همه با لیست جایگزینی دقیق پوشش داده شد)."
    );
  }

  // ─── Verify: اسکن مجدد کل جدول = صفر CJK ───
  console.log("\n== VERIFY: اسکن مجدد کل BlogPost ==");
  const all = await prisma.blogPost.findMany({
    select: {
      slug: true,
      title: true,
      content: true,
      excerpt: true,
      metaTitle: true,
      metaDescription: true,
      tags: true,
      focusKeyword: true,
      status: true,
    },
  });
  let totalCJK = 0;
  let badPosts = 0;
  for (const p2 of all) {
    let c = 0;
    for (const f of FIELDS) c += countCJK(p2[f] as string | null);
    if (c > 0) {
      badPosts++;
      console.log(`  ✗ [${p2.slug}] هنوز ${c} کاراکتر CJK دارد!`);
    }
    totalCJK += c;
  }
  console.log(
    `کل پست‌ها: ${all.length} | پست‌های همچنان آلوده: ${badPosts} | مجموع CJK باقی‌مانده: ${totalCJK}`
  );
  console.log(
    totalCJK === 0
      ? "✓ VERIFY PASS — دیتابیس BlogPost کاملاً CJK-free است."
      : "✗ VERIFY FAIL — نیاز به بررسی دستی."
  );

  // ─── اسکن عمومی چند جدول محتوایی دیگر (گزارش فقط) ───
  console.log("\n== اسکن چند جدول محتوایی دیگر (برای اطمینان) ==");
  try {
    const cms = await prisma.cmsPage.findMany({
      select: { slug: true, title: true, content: true },
    });
    let cmsBad = 0;
    for (const c of cms) {
      if (countCJK(c.title) + countCJK(c.content) > 0) {
        cmsBad++;
        console.log(`  ⚠ CmsPage آلوده: ${c.slug}`);
      }
    }
    console.log(`  CmsPage: ${cms.length} ردیف، آلوده: ${cmsBad}`);

    const tst = await prisma.siteTestimonial.findMany({
      select: { id: true, name: true, content: true },
    });
    let tstBad = 0;
    for (const t of tst) {
      if (countCJK(t.name) + countCJK(t.content) > 0) tstBad++;
    }
    console.log(`  SiteTestimonial: ${tst.length} ردیف، آلوده: ${tstBad}`);
  } catch {
    console.log("  (اسکن جداول جانبی رد شد — مهم نیست)");
  }

  if (totalCJK > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("خطا در پاکسازی چینی:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
