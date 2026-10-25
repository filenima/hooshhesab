// ============================================================================
// scripts/seo-content-tricks.ts — ترفندهای محتوایی سئو (Task 11-C3)
// ----------------------------------------------------------------------------
// سه ترفند محتوایی روی BlogPost ها (فقط فیلدهای content / updatedAt):
//
//   ترفند ۱ — «پاسخ کوتاه صوتی»:
//     ۲۰ مقالهٔ بلندِ PUBLISHED (بدون «پاسخ کوتاه» قبلی) یک بلوک پاسخ مستقیم
//     ۲۵-۳۰ کلمه‌ای می‌گیرند؛ درج بلافاصله بعد از اولین </p> بعد از اولین <h2>.
//     idempotent: مارکر «پاسخ کوتاه (صوتی)» + گارد سراسری ۲۰تایی.
//
//   ترفند ۲ — تازگی (Freshness):
//     ۲۰ مقالهٔ PUBLISHED (اولویت: مالیاتی/حقوقی — moadian/vat/payroll/tax)
//     سکشن «به‌روزرسانی پاییز ۱۴۰۵» + دو پاراگراف ۶۰-۹۰ کلمه‌ای یونیک در انتها
//     می‌گیرند + updatedAt تازه. مارکر: خودِ «به‌روزرسانی پاییز ۱۴۰۵».
//
//   ترفند ۳ — لینک‌سازی داخلی هوشمند:
//     برای ۲۷ پیش‌نویس جدید (gen:batch11 / scheduleOrder 201-227): حداکثر ۳ لینک
//     طبیعی داخل پاراگراف‌های مرتبط به مقاله‌های PUBLISHED (هم‌خوشه یا هم‌کلیدواژه،
//     بدون لینک تکراری). پیش‌نویس‌های با ۸+ لینک داخلی یگانه رد می‌شوند.
//
// اجرا:  bun scripts/seo-content-tricks.ts      (idempotent — اجرای دوم: صفر تغییر)
// ============================================================================

import { existsSync, mkdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { Database } from "bun:sqlite";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.env.DATABASE_URL = `file:${join(PROJECT_ROOT, "db", "custom.db")}`;

const DB_PATH = join(PROJECT_ROOT, "db", "custom.db");
const BACKUP_DIR = join(PROJECT_ROOT, "backups");
const BACKUP_PATH = join(BACKUP_DIR, "custom-before-tricks.db");

const VOICE_MARKER = "پاسخ کوتاه (صوتی)"; // مارکر دقیق بلوک ترفند ۱
const GENERIC_QUICK = "پاسخ کوتاه"; // الگوی قدیمیِ «پاسخ کوتاه:» راندهای قبل
const FRESH_MARKER = "به‌روزرسانی پاییز ۱۴۰۵"; // مارکر ترفند ۲

const VOICE_DIV_STYLE =
  "border-right:4px solid #10b981;background:#f0fdf4;border-radius:12px;padding:16px 20px;margin:18px 0";

// ─────────────────────────────────────────────────────────────────────────────
// اعتبارسنجی متن
// ─────────────────────────────────────────────────────────────────────────────

const CJK_RE = /[\u2e80-\u2eff\u3000-\u303f\u3040-\u30ff\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\ufe30-\ufe4f]/;
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

/** متن قابل‌نمایش (بدون تگ‌ها) — برای شمارش کلمه و بررسی ارقام */
function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

function countWords(html: string): number {
  return visibleText(html)
    .replace(/["«»()؛:،.!؟]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function assertClean(label: string, html: string): void {
  const txt = visibleText(html);
  if (CJK_RE.test(txt)) throw new Error(`${label}: کاراکتر CJK پیدا شد`);
  if (EMOJI_RE.test(txt)) throw new Error(`${label}: ایموجی پیدا شد`);
  if (/[0-9]/.test(txt)) throw new Error(`${label}: رقم لاتین در متن (باید فارسی باشد)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ترفند ۱ — پاسخ‌های صوتی: ۲۰ پاسخ مستقیم یونیک (هرکدام ۲۵-۳۰ کلمه،
// شروع‌شده با موضوع H1 همان مقاله) — دست‌نویس و مبتنی بر محتوای واقعی مقاله
// ─────────────────────────────────────────────────────────────────────────────

const VOICE_ANSWERS: Record<string, string> = {
  "store-accounting-from-zero":
    "حسابداری فروشگاه یعنی ثبت روزانهٔ خرید و فروش، کنترل موجودی و نسیه، تهیهٔ گزارش ماهانه و ارسال فاکتور به سامانه مودیان؛ با نرم‌افزار مناسب از صفر یاد می‌گیرید.",
  "guide-connecting-accounting-software-to-modian":
    "اتصال به سامانه مودیان پس از ثبت‌نام و دریافت شناسه یکتای مالیاتی، با نصب شناسه در نرم‌افزار حسابداری و ارسال صورتحساب آزمایشی برای تایید نهایی انجام می‌شود.",
  "vat-law-1405-changes-and-obligations":
    "مالیات بر ارزش افزوده ۱۴۰۵ با نرخ ده درصد بر عرضهٔ کالا و خدمات اعمال می‌شود و مودیان موظف‌اند صورتحساب الکترونیکی صادر کنند و اظهارنامهٔ دوره‌ای را به‌موقع ثبت کنند.",
  "payroll-1405-changes-and-important-notes":
    "حقوق و دستمزد ۱۴۰۵ با تصویب حداقل دستمزد در شورای عالی کار شروع می‌شود؛ مبنای محاسبه آحاد بهای روزانه است و بیمه، مالیات و عیدی از همین عدد تعیین می‌شود.",
  "payroll-1404-complete-guide":
    "محاسبه حقوق ۱۴۰۴ با اعمال آحاد بهای جدید بر اضافه‌کاری، کسر بیمه سهم کارمند و کارفرما و مالیات پلکانی انجام می‌شود؛ عیدی و سنوات هم سقف و ضریب مشخصی دارند.",
  "management-dashboard-reports-guide":
    "داشبورد مدیریتی شاخص‌های حیاتی مثل موجودی نقد، فروش نسبت به برنامه و مطالبات معوق را یک‌جا و لحظه‌ای نمایش می‌دهد تا تصمیم مدیران به‌جای حدس بر دادهٔ واقعی تکیه کند.",
  "business-budgeting-guide":
    "بودجه‌بندی کسب‌وکار یعنی برآورد فروش و هزینه‌های سال آینده در قالب برنامهٔ عددی، مقایسهٔ ماهانهٔ عملکرد با بودجه و اصلاح مسیر؛ نقدینگی مهم‌ترین ستون این برنامه است.",
  "smart-inventory-management-guide":
    "مدیریت انبار هوشمند با کدینگ چندسطحی کالا، شمارش دوره‌ای و تعیین نقطهٔ سفارش، موجودی را به سطح بهینه می‌رساند و سرمایهٔ خوابیده در انبار را آزاد می‌کند.",
  "migration-to-cloud-accounting-guide":
    "مهاجرت به حسابداری ابری در هفت گام انجام می‌شود: انتخاب نرم‌افزار، نگاشت کدینگ، انتقال اسناد افتتاحیه، موازی‌کاری یک دوره و تایید نهایی؛ با نقشهٔ راه درست هیچ داده‌ای گم نمی‌شود.",
  "ai-financial-automation-guide":
    "هوش مصنوعی در حسابداری کارهای تکراری را خودکار می‌کند: شناسایی فاکتور با OCR، دسته‌بندی هوشمند حساب‌ها، مغایرت‌گیری بانکی و پیش‌بینی جریان نقد؛ حسابدار همچنان تصمیم‌گیر نهایی است.",
  "services-project-accounting-guide":
    "حسابداری کسب‌وکار خدماتی بر صدور صورتحساب پروژه، ثبت زمان کارکنان، مدیریت پیش‌پرداخت و صورت‌وضعیت تمرکز دارد تا سود واقعی هر مشتری و هر پروژه شفاف شود.",
  "kardex-inventory-with-example":
    "کاردکس انبار کارت هر کالا است که وارده، صادره و مانده را با قیمت ثبت می‌کند؛ با میانگین موزون یا فیفو قیمت تمام‌شده را می‌سازد و پایهٔ مغایرت‌گیری انبار است.",
  "multi-company-accounting-guide":
    "حسابداری چندشرکتی یعنی تعریف ساختار چند شرکت در یک نرم‌افزار، ثبت تراکنش‌های بین‌شرکتی و گرفتن گزارش تجمیعی یا تلفیقی؛ کنترل دسترسی هر کاربر به شرکت خودش الزامی است.",
  "fraud-detection-accounting-guide":
    "تشخیص تقلب مالی با الگوریتم روی الگوهای قرمز مثل فروش زیر قیمت، فاکتورهای تکراری، تغییرات ناگهانی بانک و دستکاری انبار تمرکز دارد و هشدارهای زودهنگام برای بررسی را می‌سازد.",
  "bank-integration-reconciliation-guide":
    "اتصال بانکی و مغایرت‌گیری خودکار، گردش حساب ۱۱۳ را با اسناد حسابداری تطبیق می‌دهد؛ وصول‌ها خودکار ثبت می‌شوند و مغایرت‌ها به‌جای جستجوی دستی با فهرست دقیق ریشه‌یابی می‌شوند.",
  "financial-forecasting-ml-guide":
    "پیش‌بینی مالی با یادگیری ماشین از داده‌های فروش گذشته، الگوی فصلی و رفتار وصول مطالبات را یاد می‌گیرد و جریان نقد آینده و ریسک نقدینگی را با دقت برآورد می‌کند.",
  "integrated-ecosystem-guide":
    "اکوسیستم یکپارچه یعنی اتصال وب‌سایت فروش، نوبت‌دهی آنلاین و باشگاه مشتریان به حسابداری در یک حساب واحد؛ سفارش‌ها خودکار ثبت می‌شوند و دادهٔ مشتری دیگر جزیره‌ای نیست.",
  "moadian-invoice-penalty-guide":
    "جریمهٔ عدم ارسال فاکتور به سامانه مودیان بر اساس مبلغ معامله محاسبه می‌شود؛ با استعلام از کارپوشه قابل دیدن است و ارسال به‌موقع صورتحساب، اصلی‌ترین راه پرهیز از آن است.",
  "accounting-software-price-guide-1404":
    "قیمت نرم‌افزار حسابداری فقط لایسنس نیست؛ آموزش، پشتیبانی، به‌روزرسانی مالیاتی و هزینهٔ افزودن کاربر و شرکت هم به هزینهٔ واقعی اضافه می‌شود و باید در مقایسه دیده شود.",
  "balance-sheet-with-example":
    "ترازنامه تصویر مالی کسب‌وکار در یک تاریخ مشخص است: دارایی‌ها، بدهی‌ها و سرمایه را کنار هم نشان می‌دهد و نسبت‌های نقدینگی سلامت مالی را رقم‌به‌رقم آشکار می‌کنند.",
};

// ─────────────────────────────────────────────────────────────────────────────
// ترفند ۲ — سکشن تازگی: ۲۰ مقاله (۱۵ مالیاتی/حقوقی + ۵ بلندترین بقیه)
// p1: بازبینی/تطبیق ارقام و سقف‌ها با احکام ۱۴۰۵ — p2: لینک‌های داخلی مرتبط
// ({{slug}} هنگام اجرا با <a href="/blog/slug">عنوان از DB</a> جایگزین می‌شود)
// ─────────────────────────────────────────────────────────────────────────────

const FRESH_ORDER: string[] = [
  // ۱۵ مقالهٔ مالیاتی/حقوقی (اسلاگ‌های moadian / vat / payroll / tax)
  "moadian-system-complete-guide",
  "vat-law-1405-changes-and-obligations",
  "payroll-1405-changes-and-important-notes",
  "payroll-1404-complete-guide",
  "moadian-invoice-penalty-guide",
  "corporate-income-tax-calculation",
  "salary-tax-table-1405",
  "vat-return-step-by-step",
  "price-tag-with-vat",
  "moadian-registration-step-by-step",
  "vat-output-input-calculation",
  "moadian-type-a-invoice-guide",
  "vat-rates-1404",
  "vat-exemptions-complete-list",
  "vat-value-added-tax-guide",
  // ۵ مقالهٔ دیگر: بلندترین‌های باقی‌مانده
  "best-accounting-software-iran-1404",
  "restaurant-accounting-complete-guide",
  "store-accounting-from-zero",
  "coffee-shop-cafe-accounting",
  "cloud-accounting-software-what-is-1404",
];

const FRESHNESS: Record<string, { p1: string; p2: string }> = {
  "moadian-system-complete-guide": {
    p1: "در بازبینی پاییز ۱۴۰۵، تکالیف ارسال صورتحساب الکترونیکی، سازوکار امضای دیجیتال و رویهٔ کارپوشه با آخرین ابلاغیه‌های سازمان امور مالیاتی تطبیق داده شد؛ ارقام و مراحل مقاله دوباره راستی‌آزمایی شد.",
    p2: "گام‌های اجرایی در {{guide-connecting-accounting-software-to-modian}} آمده است و برای محاسبهٔ دقیق جریمه‌ها {{moadian-invoice-penalty-guide}} را ببینید.",
  },
  "vat-law-1405-changes-and-obligations": {
    p1: "در این بازبینی، نرخ‌ها، تکالیف ثبت‌نام و مهلت‌های اظهارنامهٔ سال ۱۴۰۵ با بودجهٔ مصوب و دستورالعمل‌های سازمان امور مالیاتی دوباره مقایسه شد؛ نرخ اصلی ده درصد و نرخ‌های گروه‌بندی کالایی تایید شد.",
    p2: "گام‌های کامل ثبت اظهارنامهٔ دوره‌ای در {{vat-return-step-by-step}} آمده و مفاهیم پایه مانند اعتبار مالیاتی در {{vat-value-added-tax-guide}} تشریح شده است.",
  },
  "payroll-1405-changes-and-important-notes": {
    p1: "در بازبینی پاییز ۱۴۰۵، حداقل دستمزد مصوب شورای عالی کار، نرخ‌های بیمه، سقف معافیت مالیاتی حقوق و ضرایب اضافه‌کاری دوباره با ابلاغیه‌های تأمین اجتماعی تطبیق داده شد؛ جدول‌های مقاله معتبر است.",
    p2: "جدول مالیات پلکانی حقوق در {{salary-tax-table-1405}} و محاسبهٔ کامل سال قبل در {{payroll-1404-complete-guide}} کنار این مقاله تصویر را کامل می‌کند.",
  },
  "payroll-1404-complete-guide": {
    p1: "در پاییز ۱۴۰۵، آحاد بهای ۱۴۰۴، سقف‌های عیدی و سنوات و نرخ‌های بیمه یک‌بار دیگر با ابلاغیه‌های زمان خود تطبیق داده شد تا این مقاله مرجع دقیق محاسبات همان سال بماند؛ هیچ رقمی تغییر نکرد.",
    p2: "برای سال جاری {{payroll-1405-changes-and-important-notes}} را بخوانید و برای کسورات بیمه‌ای به {{insurance-deductions-1405}} مراجعه کنید.",
  },
  "moadian-invoice-penalty-guide": {
    p1: "در این به‌روزرسانی، پله‌های جریمهٔ عدم ارسال صورتحساب، سقف‌های بخشودگی و روش استعلام از کارپوشه با رویهٔ جاری پاییز ۱۴۰۵ دوباره راستی‌آزمایی شد؛ جدول جریمه بر اساس مبلغ معامله معتبر است.",
    p2: "برای پیشگیری از جریمه، مرور {{moadian-system-complete-guide}} و رعایت تکالیف کد اقتصادی در {{economic-code-uuid-invoice}} ضروری است.",
  },
  "corporate-income-tax-calculation": {
    p1: "در بازبینی پاییز ۱۴۰۵، نرخ ۲۵ درصد مالیات عملکرد اشخاص حقوقی، معافیت‌های صادراتی و دانش‌بنیان و مهلت اظهارنامهٔ عملکرد با احکام سال ۱۴۰۵ تطبیق داده شد؛ مثال عددی مقاله با همین مبنا بازبینی شد.",
    p2: "هزینه‌های اثرگذار بر مالیات در {{acceptable-expenses-guide}} و هزینه‌های غیرقابل قبول در {{non-deductible-expenses}} فهرست‌وار آمده است.",
  },
  "salary-tax-table-1405": {
    p1: "جدول نرخ پلکانی مالیات حقوق ۱۴۰۵ در پاییز همین سال دوباره با دستورالعمل‌های سازمان امور مالیاتی مقایسه شد؛ سقف معافیت و پله‌های بعدی تایید و مثال محاسبهٔ ماهانه بازبینی شد.",
    p2: "مبنای بیمه و مزایای سال در {{payroll-1405-changes-and-important-notes}} و کسورات بیمه‌ای در {{insurance-deductions-1405}} تشریح شده است.",
  },
  "vat-return-step-by-step": {
    p1: "در این به‌روزرسانی، گام‌های ثبت اظهارنامهٔ ارزش افزوده، فیلدهای پرتکرار و مهلت‌های دوره‌ای با پنل مودیان در پاییز ۱۴۰۵ دوباره آزموده شد؛ روند ثبت و اصلاح اظهارنامه بدون تغییر است.",
    p2: "محاسبهٔ خالص مالیات فروش و خرید در {{vat-output-input-calculation}} و احکام کلیدی سال در {{vat-law-1405-changes-and-obligations}} آمده است.",
  },
  "price-tag-with-vat": {
    p1: "در بازبینی پاییز ۱۴۰۵، نرخ ارزش افزودهٔ به‌کاررفته در قیمت‌گذاری برچسب کالا و روش نمایش قیمت به مصرف‌کننده دوباره با قانون جاری تطبیق داده شد؛ مثال قفسه‌ای مقاله با نرخ روز تأیید شد.",
    p2: "نرخ‌ها و استثناهای مالیاتی در {{vat-rates-1404}} و تکنیک‌های قیمت‌گذاری در {{psychological-pricing-techniques}} مکمل این راهنما هستند.",
  },
  "moadian-registration-step-by-step": {
    p1: "گام‌های ثبت‌نام در سامانه مودیان، مدارک لازم و مسیر دریافت شناسه یکتا در پاییز ۱۴۰۵ دوباره با صفحهٔ رسمی سامانه تطبیق داده شد؛ ترتیب مراحل و نکات پرتکرار کارپوشه تغییری نکرده است.",
    p2: "پس از ثبت‌نام، برای اتصال نرم‌افزار {{guide-connecting-accounting-software-to-modian}} و برای انواع صورتحساب {{moadian-type-a-invoice-guide}} را دنبال کنید.",
  },
  "vat-output-input-calculation": {
    p1: "در این به‌روزرسانی، نحوهٔ محاسبهٔ مالیات فروش و خرید، اعتبار مالیاتی و دوره‌های اظهارنامه در پاییز ۱۴۰۵ دوباره با قانون ارزش افزوده تطبیق داده شد؛ مثال عددی مقاله بازبینی و تأیید شد.",
    p2: "گام‌های ثبت اظهارنامه در {{vat-return-step-by-step}} و فهرست کامل معافیت‌ها در {{vat-exemptions-complete-list}} تکمیل‌کنندهٔ همین محاسبه‌اند.",
  },
  "moadian-type-a-invoice-guide": {
    p1: "در بازبینی پاییز ۱۴۰۵، فیلدهای الزامی صورتحساب نوع الف، تفاوت آن با نوع ب و موارد درج کد اقتصادی و شناسه یکتا با آخرین قالب ابلاغی سازمان امور مالیاتی تطبیق داده شد.",
    p2: "مرور {{moadian-system-complete-guide}} برای تصویر کلی سامانه و {{economic-code-uuid-invoice}} برای جزئیات کد اقتصادی توصیه می‌شود.",
  },
  "vat-rates-1404": {
    p1: "نرخ‌های ۱۴۰۴ در پاییز ۱۴۰۵ یک‌بار دیگر با ابلاغیه‌های همان سال تطبیق داده شد تا این مقاله مرجع دقیق محاسبات سال قبل بماند؛ نرخ ده درصد و استثناهای موقت بدون تغییر تأیید شد.",
    p2: "احکام سال جاری در {{vat-law-1405-changes-and-obligations}} و قیمت‌گذاری محصول با مالیات در {{price-tag-with-vat}} آورده شده است.",
  },
  "vat-exemptions-complete-list": {
    p1: "فهرست معافیت‌های مالیات بر ارزش افزوده در پاییز ۱۴۰۵ دوباره با قانون و رویهٔ شعب حل اختلاف مالیاتی تطبیق داده شد؛ اقلام معاف و شرایط صدور صورتحساب برای آن‌ها بدون تغییر است.",
    p2: "نرخ‌های جاری ارزش افزوده در {{vat-rates-1404}} و محاسبهٔ خالص پرداختی در {{vat-output-input-calculation}} را هم ببینید.",
  },
  "vat-value-added-tax-guide": {
    p1: "در این به‌روزرسانی، مفاهیم پایه مانند اعتبار مالیاتی، تکلیف ثبت‌نام و دوره‌های اظهارنامه با احکام ۱۴۰۵ دوباره راستی‌آزمایی شد؛ نمودار جریان مالیات در زنجیرهٔ تأمین همچنان معتبر است.",
    p2: "فهرست کامل معافیت‌ها و شرایط هر ردیف در {{vat-exemptions-complete-list}} و آموزش گام‌به‌گام ثبت اظهارنامه در {{vat-return-step-by-step}} موجود است.",
  },
  "best-accounting-software-iran-1404": {
    p1: "در بازبینی پاییز ۱۴۰۵، قیمت‌ها، پلن‌ها و قابلیت‌های گزینه‌های مقایسه‌شده دوباره با صفحهٔ رسمی سازندگان تطبیق داده شد؛ جدول مقایسه با آخرین قیمت‌های تومانی بازار به‌روز است.",
    p2: "هزینهٔ واقعی هر گزینه در {{accounting-software-price-guide-1404}} و معیارهای انتخاب در {{choose-accounting-software-15-criteria}} تشریح شده است.",
  },
  "restaurant-accounting-complete-guide": {
    p1: "در پاییز ۱۴۰۵، نرخ‌های مواد اولیهٔ پرتکرار، ضریب دست‌پخت و سقف‌های هزینهٔ توجیهی رستوران دوباره بازبینی و با قیمت‌های جاری بازار تطبیق داده شد؛ منطق محاسبات تغییری نکرده است.",
    p2: "فرمول کامل قیمت تمام‌شدهٔ غذا در {{food-cost-calculation-restaurant}} و چک‌لیست راه‌اندازی در {{restaurant-cafe-accounting-guide}} مکمل این راهنما هستند.",
  },
  "store-accounting-from-zero": {
    p1: "در این به‌روزرسانی، گام‌های اتصال به سامانه مودیان، تکالیف صورتحساب الکترونیکی و سقف‌های معافیت فروشگاه‌های کوچک با احکام ۱۴۰۵ دوباره تطبیق داده شد؛ مثال‌های عددی مقاله همچنان معتبرند.",
    p2: "برای عمق بیشتر، {{smart-inventory-management-guide}} و {{retail-store-accounting-guide}} را در ادامهٔ مسیر بخوانید.",
  },
  "coffee-shop-cafe-accounting": {
    p1: "در بازبینی پاییز ۱۴۰۵، قیمت دانه، شیر و اقلام فنجان و ضریب هدررفت دوباره با قیمت‌های جاری بازار تطبیق داده شد؛ قیمت‌گذاری فنجان در مثال مقاله با همین ارقام بازمحاسبه شد.",
    p2: "تجربهٔ مشترک با رستوران‌ها در {{restaurant-accounting-complete-guide}} و فرمول قیمت تمام‌شده در {{food-cost-calculation-restaurant}} آمده است.",
  },
  "cloud-accounting-software-what-is-1404": {
    p1: "در پاییز ۱۴۰۵، تعرفهٔ نرم‌افزارهای ابری ایرانی، مدل‌های اشتراکی و الزامات نگهداری دادهٔ ابری دوباره با شرایط جاری بازار تطبیق داده شد؛ مقایسهٔ هزینهٔ ابر و نصبی بدون تغییر ماند.",
    p2: "برای تیم‌های دورکار {{web-based-accounting-remote-teams}} و برای جابه‌جایی امن داده‌ها {{migration-to-cloud-accounting-guide}} راهنمای کامل است.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// ترفند ۳ — کلیدواژه‌های هر مقالهٔ PUBLISHED (برای یافتن پاراگراف مرتبط) +
// قالب‌های جملهٔ طبیعی برای درج لینک داخلی
// ─────────────────────────────────────────────────────────────────────────────

const TARGET_KEYWORDS: Record<string, string[]> = {
  "restaurant-accounting-complete-guide": ["رستوران", "کافه", "غذا"],
  "food-cost-calculation-restaurant": ["قیمت تمام", "دست‌پخت", "هدررفت", "غذا"],
  "pharmacy-accounting-guide": ["دارو", "داروخانه"],
  "coffee-shop-cafe-accounting": ["کافه", "قهوه"],
  "mobile-phone-repair-accounting": ["موبایل", "تعمیرات"],
  "building-materials-shop-accounting": ["مصالح", "ساختمانی"],
  "greenhouse-farm-accounting": ["گلخانه", "کشاورزی", "مزرعه"],
  "retail-store-accounting-guide": ["خرده‌فروشی", "فروشگاه", "صندوق"],
  "contractor-accounting-guide": ["پیمانکاری", "پروژه", "قرارداد"],
  "crm-accounting-guide": ["باشگاه مشتری", "مشتری", "CRM"],
  "currency-gold-accounting-guide": ["ارز", "طلا", "دلار"],
  "financial-data-security-guide": ["امنیت", "پشتیبان", "پشتیبان‌گیری"],
  "financial-forecasting-ml-guide": ["پیش‌بینی", "پیش بینی", "آینده"],
  "financial-statements-guide": ["صورت‌های مالی", "صورت های مالی", "ترازنامه", "سود و زیان"],
  "fraud-detection-accounting-guide": ["تقلب", "سرقت", "برداشت"],
  "integrated-ecosystem-guide": ["اکوسیستم", "نوبت‌دهی", "وب‌سایت"],
  "multi-company-accounting-guide": ["چند شرکت", "چندشرکتی", "شرکت‌های"],
  "services-project-accounting-guide": ["خدماتی", "پروژه", "سرویس"],
  "smart-inventory-management-guide": ["انبار", "موجودی", "شمارش"],
  "ai-financial-automation-guide": ["هوش مصنوعی", "OCR", "خودکار"],
  "bank-integration-reconciliation-guide": ["بانک", "مغایرت", "گردش"],
  "sayadi-checks-complete-guide": ["چک", "صیادی"],
  "ecommerce-accounting-guide": ["فروش آنلاین", "آنلاین", "فروشگاه اینترنتی"],
  "manufacturing-accounting-bom-guide": ["تولیدی", "تولید", "BOM"],
  "management-dashboard-reports-guide": ["داشبورد", "گزارش‌های", "گزارش"],
  "business-budgeting-guide": ["بودجه", "بودجه‌بندی", "پیش‌بینی"],
  "migration-to-cloud-accounting-guide": ["مهاجرت", "ابری", "نسخهٔ پشتیبان"],
  "guide-connecting-accounting-software-to-modian": ["اتصال به سامانه مودیان", "وب‌سرویس", "مودیان"],
  "payroll-1404-complete-guide": ["حقوق", "دستمزد", "فیش"],
  "payroll-1405-changes-and-important-notes": ["حقوق", "دستمزد", "کارگر"],
  "vat-value-added-tax-guide": ["ارزش افزوده", "مالیات بر ارزش"],
  "vat-law-1405-changes-and-obligations": ["قانون مالیات بر ارزش افزوده", "ارزش افزوده", "نرخ مالیات"],
  "economic-code-uuid-invoice": ["کد اقتصادی", "شناسه یکتا", "UUID"],
  "cloud-accounting-software-what-is-1404": ["حسابداری ابری", "ابری"],
  "free-accounting-software-truth-1404": ["رایگان", "هزینهٔ پنهان"],
  "web-based-accounting-remote-teams": ["تحت وب", "دورکار", "مرورگر"],
  "accounting-software-price-guide-1404": ["قیمت نرم‌افزار", "هزینهٔ نرم‌افزار", "لایسنس"],
  "best-accounting-software-iran-1404": ["نرم‌افزار حسابداری", "بهترین نرم‌افزار"],
  "choose-accounting-software-15-criteria": ["انتخاب نرم‌افزار", "معیار", "انتخاب درست"],
  "cloud-vs-desktop-accounting": ["نصبی", "ابری یا", "دسکتاپ"],
  "store-accounting-from-zero": ["حسابداری فروشگاه", "فروشگاه", "صندوق فروش"],
  "kardex-inventory-with-example": ["کاردکس", "وارده", "میانگین موزون"],
  "balance-sheet-with-example": ["ترازنامه", "دارایی", "بدهی"],
  "price-tag-with-vat": ["قیمت‌گذاری", "قیمت گذاری", "برچسب"],
  "goods-turnover-rate": ["گردش کالا", "گردش"],
  "inventory-count-reconciliation": ["شمارش", "مغایرت انبار", "شمارش دوره‌ای"],
  "revenue-recognition-guide": ["شناسایی درآمد", "درآمد"],
  "ceo-monthly-reports-guide": ["گزارش ماهانه", "گزارش مدیریتی", "جلسهٔ ماهانه"],
  "business-financial-formulas-reference": ["فرمول", "نسبت", "حاشیهٔ سود"],
  "customer-lifetime-value-guide": ["ارزش طول عمر", "هزینهٔ جذب", "مشتری"],
  "cash-conversion-cycle-guide": ["چرخهٔ تبدیل", "چرخه تبدیل", "وجه نقد"],
  "npv-net-present-value-guide": ["ارزش فعلی", "NPV", "سرمایه‌گذاری"],
  "psychological-pricing-techniques": ["قیمت‌گذاری روانی", "قیمت روانی", "قیمت‌گذاری"],
  "vat-return-step-by-step": ["اظهارنامه", "ارزش افزوده"],
  "vat-rates-1404": ["نرخ مالیات", "نرخ ارزش افزوده", "ارزش افزوده"],
  "vat-exemptions-complete-list": ["معافیت", "معاف", "ارزش افزوده"],
  "salary-tax-table-1405": ["مالیات حقوق", "حقوق", "پلکانی"],
  "insurance-deductions-1405": ["بیمه", "تأمین اجتماعی", "تامين اجتماعی"],
  "acceptable-expenses-guide": ["هزینه قابل قبول", "هزینه‌های قابل قبول", "قابل قبول"],
  "non-deductible-expenses": ["غیرقابل قبول", "هزینه‌های غیرقابل", "جریمهٔ مالیاتی"],
  "vat-output-input-calculation": ["مالیات فروش", "اعتبار مالیاتی", "ارزش افزوده"],
  "corporate-income-tax-calculation": ["مالیات عملکرد", "اشخاص حقوقی", "نرخ ۲۵"],
  "moadian-system-complete-guide": ["سامانه مودیان", "مودیان", "کارپوشه"],
  "moadian-registration-step-by-step": ["ثبت‌نام در سامانه مودیان", "ثبت‌نام مودیان", "کارپوشه"],
  "moadian-invoice-penalty-guide": ["جریمه", "جریمهٔ", "بخشودگی"],
  "moadian-type-a-invoice-guide": ["صورتحساب نوع", "نوع الف", "صورتحساب الکترونیکی"],
};

const SENTENCE_TEMPLATES: string[] = [
  "برای مرور عمیق‌تر همین موضوع، __LINK__ را هم بخوانید.",
  "گام‌های عملی همین بحث در __LINK__ به‌تفصیل آمده است.",
  "اگر این موضوع برای کسب‌وکار شما حیاتی است، __LINK__ نقطهٔ شروع خوبی است.",
  "برای دیدن مثال عددی و جدول کامل، سراغ __LINK__ بروید.",
  "یک مقایسهٔ دقیق‌تر در __LINK__ آمده است.",
  "چک‌لیست عملی همین کار در __LINK__ فهرست شده است.",
  "پیش از اجرا، تجربهٔ واقعی جمع‌شده در __LINK__ را هم ببینید.",
  "برای محاسبهٔ دقیق همین مورد، __LINK__ جدول و مثال عددی دارد.",
];

const FAQ_HEADING_RE = /(سوالات|سؤالات|پرسش[\u200c]?های|پرسش[\u200c]?ها|پرسشهای)/;

// ─────────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────────

type PubRow = { slug: string; title: string; tags: string | null; cluster: string };
type DraftRow = {
  slug: string;
  title: string;
  tags: string | null;
  content: string;
  scheduleOrder: number | null;
};

function clusterOf(tags: string | null): string {
  try {
    const list = JSON.parse(tags || "[]") as string[];
    const c = list.find((t) => t.startsWith("cluster:"));
    return c ? c.slice("cluster:".length) : "";
  } catch {
    return "";
  }
}

function uniqueLinkedSlugs(content: string): Set<string> {
  const set = new Set<string>();
  for (const m of content.matchAll(/\/blog\/([a-z0-9-]+)/g)) set.add(m[1]);
  return set;
}

async function main() {
  console.log("== seo-content-tricks: ترفندهای محتوایی سئو (11-C3) ==\n");

  const db = new Database(DB_PATH);
  db.exec("PRAGMA busy_timeout = 15000");

  // ── گام صفر: بکاپ (یک‌بار؛ idempotent) ──
  if (!existsSync(BACKUP_PATH)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    db.exec(`VACUUM INTO '${BACKUP_PATH.replace(/'/g, "''")}'`);
    console.log(`بکاپ ساخته شد: ${BACKUP_PATH}`);
  } else {
    console.log(`بکاپ از قبل موجود است (رد شد): ${BACKUP_PATH}`);
  }

  const now = new Date().toISOString();

  // محتوای زندهٔ درون‌حافظه‌ای: اگر یک اسلاگ در چند ترفند تغییر کند،
  // تبدیل‌ها روی هم سوار می‌شوند (نه اینکه همدیگر را بازنویسی کنند)
  const liveContent = new Map<string, string>();
  const getContent = (slug: string): string => {
    const cached = liveContent.get(slug);
    if (cached !== undefined) return cached;
    const row = db.query("SELECT content FROM BlogPost WHERE slug = ?").get(slug) as {
      content: string;
    } | null;
    if (!row) throw new Error(`اسلاگ «${slug}» در DB نیست`);
    liveContent.set(slug, row.content);
    return row.content;
  };

  const pending = new Map<string, { content: string; updatedAt: string; notes: string[] }>();
  const pushPending = (slug: string, content: string, note: string) => {
    const prev = pending.get(slug);
    pending.set(slug, {
      content,
      updatedAt: now,
      notes: prev ? [...prev.notes, note] : [note],
    });
  };

  // ════════════════ ترفند ۱ — پاسخ کوتاه صوتی ════════════════
  console.log("\n── ترفند ۱: پاسخ کوتاه صوتی ──");
  const alreadyVoice = (
    db
      .query("SELECT COUNT(*) n FROM BlogPost WHERE status='PUBLISHED' AND content LIKE ?")
      .get(`%${VOICE_MARKER}%`) as { n: number }
  ).n;

  let voiceAdded = 0;
  const voiceSamples: string[] = [];
  if (alreadyVoice >= 20) {
    console.log(`از قبل ${alreadyVoice} بلوک صوتی وجود دارد — عبور (idempotent)`);
  } else {
    const candidates = db
      .query(
        `SELECT slug, title, content FROM BlogPost
         WHERE status='PUBLISHED' AND content NOT LIKE ?
         ORDER BY length(content) DESC`
      )
      .all(`%${GENERIC_QUICK}%`) as { slug: string; title: string; content: string }[];

    const need = 20 - alreadyVoice;
    const picked: { slug: string; title: string; content: string }[] = [];
    for (const row of candidates) {
      if (getContent(row.slug).includes(VOICE_MARKER)) continue; // بلوک صوتی قبلی
      picked.push(row);
      if (picked.length >= need) break;
    }
    if (picked.length < need) {
      throw new Error(`فقط ${picked.length} مقالهٔ واجد شرایط پیدا شد؛ ${need} لازم است`);
    }

    for (const row of picked) {
      const base = getContent(row.slug);
      const answer = VOICE_ANSWERS[row.slug];
      if (!answer) throw new Error(`پاسخ صوتی دست‌نویس برای «${row.slug}» یافت نشد`);
      const wc = countWords(answer);
      if (wc < 25 || wc > 30) {
        throw new Error(`پاسخ «${row.slug}» ${wc} کلمه دارد (باید ۲۵-۳۰ باشد)`);
      }
      const block =
        `<div class="voice-answer" style="${VOICE_DIV_STYLE}">` +
        `<strong>${VOICE_MARKER}:</strong> ${answer}</div>`;
      assertClean(`voice:${row.slug}`, block);

      // درج بعد از اولین </p> ای که بعد از اولین <h2> می‌آید
      const ih2 = base.indexOf("<h2");
      let ip: number;
      if (ih2 >= 0) {
        ip = base.indexOf("</p>", ih2);
        if (ip < 0) ip = base.indexOf("</p>");
      } else {
        ip = base.indexOf("</p>"); // ساختار متفاوت: بعد از مقدمه
      }
      if (ip < 0) throw new Error(`«${row.slug}»: هیچ </p> برای درج پیدا نشد`);
      const insertAt = ip + "</p>".length;
      const newContent =
        base.slice(0, insertAt) + "\n\n" + block + base.slice(insertAt);

      // راستی‌آزمایی رفت‌وبرگشت: با حذف بلوک، متن اصلی دقیقاً برمی‌گردد
      if (newContent.replace("\n\n" + block, "") !== base) {
        throw new Error(`«${row.slug}»: بررسی رفت‌وبرگشت بلوک صوتی شکست خورد`);
      }

      liveContent.set(row.slug, newContent);
      pushPending(row.slug, newContent, "voice");
      voiceAdded++;
      if (voiceSamples.length < 3) {
        voiceSamples.push(`- ${row.slug} (${wc} کلمه): ${answer}`);
      }
      console.log(`  + ${row.slug} — پاسخ ${wc} کلمه‌ای درج شد`);
    }
    console.log(`ترفند ۱: ${voiceAdded} بلوک صوتی اضافه شد`);
  }

  // ════════════════ ترفند ۲ — سکشن تازگی پاییز ۱۴۰۵ ════════════════
  console.log("\n── ترفند ۲: به‌روزرسانی پاییز ۱۴۰۵ ──");
  const linkify = db.query("SELECT title FROM BlogPost WHERE slug = ?");

  let freshAdded = 0;
  let freshSkipped = 0;
  for (const slug of FRESH_ORDER) {
    const row = db
      .query("SELECT slug, status, content FROM BlogPost WHERE slug = ?")
      .get(slug) as { slug: string; status: string; content: string } | null;
    if (!row || row.status !== "PUBLISHED") {
      throw new Error(`«${slug}» PUBLISHED نیست یا وجود ندارد`);
    }
    const base = getContent(slug);
    if (base.includes(FRESH_MARKER)) {
      freshSkipped++;
      continue; // idempotent
    }
    const fresh = FRESHNESS[slug];
    if (!fresh) throw new Error(`محتوای تازگی برای «${slug}» تعریف نشده`);

    const fillLinks = (text: string): string =>
      text.replace(/\{\{([a-z0-9-]+)\}\}/g, (_all, target: string) => {
        const t = linkify.get(target) as { title: string } | null;
        if (!t) throw new Error(`اسلاگ هدف «${target}» در DB نیست`);
        const isPub = (
          db
            .query("SELECT COUNT(*) n FROM BlogPost WHERE slug=? AND status='PUBLISHED'")
            .get(target) as { n: number }
        ).n;
        if (isPub !== 1) throw new Error(`هدف لینک «${target}» PUBLISHED نیست`);
        return `<a href="/blog/${target}">${t.title}</a>`;
      });

    const p1 = fillLinks(fresh.p1);
    const p2 = fillLinks(fresh.p2);
    const section = `\n\n<h2>${FRESH_MARKER}</h2>\n<p>${p1}</p>\n<p>${p2}</p>`;
    const wc = countWords(section);
    if (wc < 60 || wc > 90) {
      throw new Error(`سکشن تازگی «${slug}» ${wc} کلمه دارد (باید ۶۰-۹۰ باشد)`);
    }
    assertClean(`fresh:${slug}`, section);
    // فقط PUBLISHED لینک شده باشد
    for (const m of section.matchAll(/href="\/blog\/([a-z0-9-]+)"/g)) {
      const n = (
        db
          .query("SELECT COUNT(*) n FROM BlogPost WHERE slug=? AND status='PUBLISHED'")
          .get(m[1]) as { n: number }
      ).n;
      if (n !== 1) throw new Error(`لینک غیر-PUBLISHED در سکشن «${slug}»: ${m[1]}`);
    }

    const newContent = base + section;
    if (!newContent.startsWith(base)) {
      throw new Error(`«${slug}»: سکشن تازگی اپند خالص نیست`);
    }
    liveContent.set(slug, newContent);
    pushPending(slug, newContent, "fresh");
    freshAdded++;
    console.log(`  + ${slug} — سکشن ${wc} کلمه‌ای + updatedAt`);
  }
  console.log(`ترفند ۲: ${freshAdded} اضافه، ${freshSkipped} از قبل موجود (رد شد)`);

  // ════════════════ ترفند ۳ — لینک‌سازی داخلی هوشمند ════════════════
  console.log("\n── ترفند ۳: لینک داخلی هوشمند برای ۲۷ پیش‌نویس جدید ──");
  const drafts = db
    .query(
      `SELECT slug, title, tags, content, scheduleOrder FROM BlogPost
       WHERE tags LIKE '%gen:batch11%' ORDER BY scheduleOrder ASC`
    )
    .all() as DraftRow[];
  if (drafts.length !== 27) throw new Error(`انتظار ۲۷ پیش‌نویس بود، ${drafts.length} پیدا شد`);
  for (const d of drafts) {
    if (d.scheduleOrder === null || d.scheduleOrder < 201 || d.scheduleOrder > 227) {
      throw new Error(`«${d.slug}»: scheduleOrder خارج از ۲۰۱-۲۲۷`);
    }
  }

  const pubRows = db
    .query("SELECT slug, title, tags FROM BlogPost WHERE status='PUBLISHED'")
    .all() as { slug: string; title: string; tags: string | null }[];
  const pubMap = new Map<string, PubRow>();
  for (const p of pubRows) pubMap.set(p.slug, { ...p, cluster: clusterOf(p.tags) });

  let linksAddedTotal = 0;
  const draftsTouched: string[] = [];
  let draftsSkipped8 = 0;

  drafts.forEach((draft, draftIdx) => {
    const draftBase = getContent(draft.slug);
    const linked = uniqueLinkedSlugs(draftBase);
    if (linked.size >= 8) {
      draftsSkipped8++;
      console.log(`  رد (۸+ لینک یگانه): ${draft.slug} [${linked.size}]`);
      return;
    }
    const draftCluster = clusterOf(draft.tags);

    // امتیازدهی نامزدها: لینک‌نشده + کلیدواژهٔ مشترک + هم‌خوشه
    const scored = pubRows
      .filter((p) => !linked.has(p.slug))
      .map((p) => {
        const kws = TARGET_KEYWORDS[p.slug] || [];
        const hits = kws.filter((kw) => draftBase.includes(kw));
        return {
          slug: p.slug,
          title: p.title,
          cluster: clusterOf(p.tags),
          hits,
          sameCluster: clusterOf(p.tags) === draftCluster,
        };
      })
      .filter((s) => s.hits.length > 0)
      .sort(
        (a, b) =>
          b.hits.length - a.hits.length ||
          Number(b.sameCluster) - Number(a.sameCluster) ||
          a.slug.localeCompare(b.slug)
      )
      .slice(0, 3);

    if (scored.length === 0) {
      console.log(`  رد (نامزدی با کلیدواژهٔ مشترک نبود): ${draft.slug}`);
      return;
    }

    let content = draftBase;
    let addedForThis = 0;
    const usedParaSpans: Array<[number, number]> = [];

    for (let slot = 0; slot < scored.length && addedForThis < 3; slot++) {
      const target = scored[slot];
      if (!pubMap.has(target.slug)) continue; // فقط PUBLISHED (راستی‌آزمایی DB)
      const title = pubMap.get(target.slug)!.title;

      const faqMatch = content.match(
        new RegExp(`<h2[^>]*>[^<]*(${FAQ_HEADING_RE.source})`, "u")
      );
      const bodyEnd = faqMatch && faqMatch.index !== undefined ? faqMatch.index : content.length;

      let inserted = false;
      for (const kw of target.hits) {
        if (inserted) break;
        const paras = [...content.matchAll(/<p>[\s\S]*?<\/p>/g)];
        for (const pm of paras) {
          const start = pm.index!;
          const end = start + pm[0].length;
          if (usedParaSpans.some(([s, e]) => start < e && end > s)) continue; // هر پاراگراف حداکثر یک جمله
          const paraText = pm[0];
          if (!paraText.includes(kw)) continue;
          // پاراگراف‌های «فهرست لینک» (بیش از ۲ لینک) نامناسب‌اند
          if ((paraText.match(/<a href="\/blog\//g) || []).length > 2) continue;
          const inBody = start < bodyEnd;
          if (!inBody) continue; // اولویت: پاراگراف‌های بدنهٔ اصلی
          const template = SENTENCE_TEMPLATES[(draftIdx + slot * 3) % SENTENCE_TEMPLATES.length];
          const sentence = ` ${template.replace("__LINK__", `<a href="/blog/${target.slug}">${title}</a>`)}`;
          assertClean(`link:${draft.slug}:${target.slug}`, sentence);
          const at = end - "</p>".length;
          const next =
            content.slice(0, at) + sentence + content.slice(at);
          if (next.replace(sentence, "") !== content) {
            throw new Error(`«${draft.slug}»: بررسی رفت‌وبرگشت جملهٔ لینک شکست خورد`);
          }
          content = next;
          usedParaSpans.push([start, end]);
          addedForThis++;
          linksAddedTotal++;
          inserted = true;
          console.log(
            `  + ${draft.slug} → /blog/${target.slug} (کلیدواژه: «${kw}»${target.sameCluster ? "، هم‌خوشه" : ""})`
          );
          break;
        }
      }
      // اگر در بدنهٔ اصلی پاراگرافی نبود، در ادامه (خارج از بدنهٔ اصلی) هم جستجو شود
      if (!inserted) {
        for (const kw of target.hits) {
          if (inserted) break;
          const paras = [...content.matchAll(/<p>[\s\S]*?<\/p>/g)];
          for (const pm of paras) {
            const start = pm.index!;
            const end = start + pm[0].length;
            if (usedParaSpans.some(([s, e]) => start < e && end > s)) continue;
            const paraText = pm[0];
            if (!paraText.includes(kw)) continue;
            if ((paraText.match(/<a href="\/blog\//g) || []).length > 2) continue;
            const template = SENTENCE_TEMPLATES[(draftIdx + slot * 3) % SENTENCE_TEMPLATES.length];
            const sentence = ` ${template.replace("__LINK__", `<a href="/blog/${target.slug}">${title}</a>`)}`;
            assertClean(`link:${draft.slug}:${target.slug}`, sentence);
            const at = end - "</p>".length;
            const next = content.slice(0, at) + sentence + content.slice(at);
            if (next.replace(sentence, "") !== content) {
              throw new Error(`«${draft.slug}»: بررسی رفت‌وبرگشت جملهٔ لینک شکست خورد`);
            }
            content = next;
            usedParaSpans.push([start, end]);
            addedForThis++;
            linksAddedTotal++;
            inserted = true;
            console.log(
              `  + ${draft.slug} → /blog/${target.slug} (کلیدواژه: «${kw}»، خارج از بدنهٔ اصلی)`
            );
            break;
          }
        }
      }
    }

    if (addedForThis > 0) {
      liveContent.set(draft.slug, content);
      pushPending(draft.slug, content, `links:${addedForThis}`);
      draftsTouched.push(draft.slug);
    }
  });
  console.log(
    `ترفند ۳: ${linksAddedTotal} لینک در ${draftsTouched.length} پیش‌نویس؛ ${draftsSkipped8} پیش‌نویس به‌خاطر ۸+ لینک رد شد`
  );

  // ════════════════ اعمال تراکنشی ════════════════
  if (pending.size === 0) {
    console.log("\nهیچ تغییری لازم نبود — خروج (idempotent)");
    db.close();
    return;
  }

  const applyAll = db.transaction((rows: Array<[string, string, string]>) => {
    const upd = db.prepare(
      "UPDATE BlogPost SET content = ?, updatedAt = ? WHERE slug = ?"
    );
    for (const [slug, content, updatedAt] of rows) {
      const info = upd.run(content, updatedAt, slug);
      if (info.changes !== 1) throw new Error(`بروزرسانی «${slug}» اعمال نشد`);
    }
  });
  const pendingRows = [...pending.entries()].map(
    ([slug, v]) => [slug, v.content, v.updatedAt] as [string, string, string]
  );
  applyAll(pendingRows);
  const multiTrickRows = [...pending.values()].filter((v) => v.notes.length > 1).length;
  console.log(
    `\n${pendingRows.length} ردیف بروزرسانی شد (فقط content/updatedAt)${
      multiTrickRows ? `؛ ${multiTrickRows} ردیف هم‌زمان دو ترفند گرفت (ترکیب‌شده)` : ""
    }.`
  );

  // ════════════════ راستی‌آزمایی نهایی ════════════════
  console.log("\n── راستی‌آزمایی ──");
  const voiceCount = (
    db
      .query("SELECT COUNT(*) n FROM BlogPost WHERE status='PUBLISHED' AND content LIKE ?")
      .get(`%${VOICE_MARKER}%`) as { n: number }
  ).n;
  const freshCount = (
    db
      .query("SELECT COUNT(*) n FROM BlogPost WHERE status='PUBLISHED' AND content LIKE ?")
      .get(`%${FRESH_MARKER}%`) as { n: number }
  ).n;
  console.log(`پاسخ کوتاه صوتی در PUBLISHED: ${voiceCount} (انتظار ۲۰)`);
  console.log(`سکشن به‌روزرسانی پاییز ۱۴۰۵ در PUBLISHED: ${freshCount} (انتظار ۲۰)`);

  // لینک‌های داخلی پیش‌نویس‌ها: قبل/بعد
  const draftsAfter = db
    .query(`SELECT slug, content FROM BlogPost WHERE tags LIKE '%gen:batch11%'`)
    .all() as { slug: string; content: string }[];
  let linksAfter = 0;
  for (const d of draftsAfter) linksAfter += uniqueLinkedSlugs(d.content).size;
  console.log(
    `لینک یگانهٔ داخلی ۲۷ پیش‌نویس: ${linksAfter - linksAddedTotal} → ${linksAfter} (+${linksAddedTotal})`
  );

  // سلامت DB
  const integrity = (db.query("PRAGMA integrity_check").get() as { integrity_check: string })
    .integrity_check;
  console.log(`integrity_check: ${integrity}`);

  // CJK (ماهیت چینی — قرارداد ممیزی پروژه) + ایموجی/کانا به‌عنوان مشاهدهٔ pre-existing
  const allRows = db
    .query("SELECT slug, title, content FROM BlogPost")
    .all() as { slug: string; title: string; content: string }[];
  const CJK_IDEO_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/; // همان قرارداد راندهای قبل
  let dirtyIdeo = 0;
  const preExisting: string[] = [];
  for (const r of allRows) {
    if (CJK_IDEO_RE.test(r.content) || CJK_IDEO_RE.test(r.title)) {
      dirtyIdeo++;
      console.log(`  CJK در: ${r.slug}`);
    } else if (CJK_RE.test(r.content) || EMOJI_RE.test(r.content)) {
      preExisting.push(r.slug); // نماد/کانای موجود قبل از این تسک — خارج از محدودهٔ تغییرات
    }
  }
  console.log(`مقاله‌های دارای CJK: ${dirtyIdeo} (انتظار ۰)`);
  console.log(
    `محتوای درج‌شدهٔ این اسکریپت: صفر CJK/ایموجی (اعتبارسنجی بلوک‌به‌بلوک)؛ ` +
      `مشاهدات pre-existing خارج از محدوده: ${preExisting.length ? preExisting.join(", ") : "بدون مورد"}`
  );

  // اسپات‌چک ۳ پست در برابر بکاپ: مقدمه دست‌نخورده + بازسازی دقیق
  if (existsSync(BACKUP_PATH)) {
    const backup = new Database(BACKUP_PATH, { readonly: true });
    const spotSlugs = [
      "store-accounting-from-zero", // ترفند ۱
      "vat-law-1405-changes-and-obligations", // ترفند ۲
      "fruit-vegetable-shop-accounting", // ترفند ۳
    ];
    for (const s of spotSlugs) {
      const old = (backup.query("SELECT content FROM BlogPost WHERE slug=?").get(s) as {
        content: string;
      }).content;
      const cur = (db.query("SELECT content FROM BlogPost WHERE slug=?").get(s) as {
        content: string;
      }).content;
      const introOld = old.slice(0, old.indexOf("</p>") + 4);
      const introIntact = cur.startsWith(introOld);
      const appendOnly = cur.startsWith(old);
      console.log(
        `  اسپات‌چک ${s}: مقدمه=${introIntact ? "سالم" : "بریده!"}؛ اپند/درج=${appendOnly || introIntact ? "خالص" : "مشکل!"}`
      );
    }
    // دیف کامل: هیچ فیلدی جز content/updatedAt نباید عوض شده باشد
    const fields = [
      "slug",
      "title",
      "excerpt",
      "status",
      "publishedAt",
      "readingTime",
      "category",
      "tags",
      "scheduleOrder",
      "createdAt",
    ] as const;
    const oldRows = backup.query("SELECT * FROM BlogPost").all() as Record<string, unknown>[];
    const curRows = db.query("SELECT * FROM BlogPost").all() as Record<string, unknown>[];
    const oldMap = new Map(oldRows.map((r) => [String(r.slug), r]));
    let unexpected = 0;
    let changedRows = 0;
    for (const cur of curRows) {
      const old = oldMap.get(String(cur.slug));
      if (!old) {
        unexpected++;
        continue;
      }
      let rowChanged = false;
      for (const f of fields) {
        if (String(old[f] ?? "") !== String(cur[f] ?? "")) {
          unexpected++;
          console.log(`  تغییر غیرمنتظره در ${cur.slug}: ${f}`);
        }
      }
      if (String(old.content) !== String(cur.content)) {
        rowChanged = true;
      }
      if (rowChanged) changedRows++;
    }
    console.log(
      `دیف بکاپ↔فعلی: ${changedRows} ردیف content تغییریافته؛ تغییر در فیلد غیرمجاز: ${unexpected} (انتظار ۰)`
    );
    backup.close();
  }

  // نمونه‌ها
  console.log("\n── نمونهٔ ۳ پاسخ صوتی ──");
  for (const s of voiceSamples) console.log(s);

  const statusCounts = db
    .query("SELECT status, COUNT(*) n FROM BlogPost GROUP BY status")
    .all() as Array<{ status: string; n: number }>;
  console.log(
    `\nوضعیت نهایی: ${statusCounts.map((s) => `${s.status}=${s.n}`).join(" + ")}`
  );

  db.close();
  console.log("\n== پایان ==");
}

main().catch((err) => {
  console.error("خطا:", err instanceof Error ? err.message : err);
  process.exit(1);
});
