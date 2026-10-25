// ============================================================
// lib/growth-tools-shared.ts — ثابت‌ها و قالب‌های مشترک ابزارهای رشد
// ------------------------------------------------------------
// این فایل Client-safe است (هیچ import سمت‌سروری ندارد) تا تب‌های
// پنل سوپرادمین بتوانند قالب‌های ایمیل و برچسب‌ها را مستقیم استفاده
// کنند. منطق دیتابیس (getConfig/saveConfig) در lib/growth-tools.ts است
// و این فایل را re-export می‌کند.
// ============================================================

/* ============ ۱) پایش GSC و CTR (ترفند #۵) ============ */

export type GscWatchStatus = "pending" | "running" | "done";

export interface GscWatchRow {
  id: string;
  /** مسیر صفحه مثل /pricing یا /blog/slug */
  path: string;
  currentTitle: string;
  /** CTR فعلی به درصد (۰ تا ۱۰۰) */
  ctr: number;
  /** میانگین موقعیت فعلی در نتایج جستجو */
  position: number;
  newTitleIdea: string;
  /** تاریخ شروع چرخهٔ ۲۸روزهٔ A/B — ISO (YYYY-MM-DD یا کامل) */
  cycleStart: string;
  status: GscWatchStatus;
}

export interface GscWatchlistConfig {
  updatedAt: string;
  rows: GscWatchRow[];
}

/** طول استاندارد چرخهٔ ارزیابی تایتل — روز */
export const GSC_CYCLE_DAYS = 28;

/* ============ ۲) کیت Digital PR و رسانه (ترفند #۱) ============ */

export type PrMediaStatus = "new" | "contacted" | "replied" | "published" | "dead";

export interface PrMediaRow {
  id: string;
  name: string;
  email: string;
  /** حوزهٔ پوشش رسانه (مثلاً مالیاتی، فین‌تک، کسب‌وکار) */
  beat: string;
  /** آخرین تماس — ISO */
  lastContact: string;
  status: PrMediaStatus;
  note: string;
}

export interface PrActivityRow {
  id: string;
  /** ISO datetime */
  date: string;
  mediaId: string;
  action: string;
  note: string;
}

export interface PrOutreachConfig {
  updatedAt: string;
  media: PrMediaRow[];
  activityLog: PrActivityRow[];
}

/** هدف فصلی ارجاع رسانه‌ای — ۳ تا ۵؛ نوار پیشرفت بر مبنای ۵ */
export const PR_SEASON_REFERRAL_GOAL = 5;

/* ============ ۳) گردش‌کار خبر ۴۸ ساعته (ترفند #۱۳) ============ */

export type NewsSource = "notice" | "rate" | "ban" | "other";

export const NEWS_SOURCE_LABELS: Record<NewsSource, string> = {
  notice: "ابلاغیهٔ سازمان امور مالیاتی",
  rate: "تغییر نرخ",
  ban: "ممنوعیت",
  other: "سایر",
};

export interface NewsSteps {
  blogDraft: boolean;
  gbpPost: boolean;
  linkedinPost: boolean;
  published: boolean;
}

export interface ActiveNewsRow {
  id: string;
  title: string;
  source: NewsSource;
  /** ISO datetime شروع */
  startedAt: string;
  /** startedAt + ۴۸ ساعت — ISO datetime */
  deadline: string;
  steps: NewsSteps;
}

export interface NewsHistoryRow {
  id: string;
  title: string;
  /** ISO datetime انتشار */
  publishedAt: string;
  url: string;
}

export interface NewsWorkflowConfig {
  updatedAt: string;
  activeNews: ActiveNewsRow[];
  history: NewsHistoryRow[];
}

/* ============ قالب‌های ایمیل Digital PR (فارسی، آماده) ============ */

export interface PrEmailTemplate {
  id: string;
  /** عنوان فارسی قالب */
  title: string;
  description: string;
  subject: string;
  body: string;
}

// (۱) معرفی + داده — ارسال اول به سردبیران رسانه‌های اقتصادی
// ۹۰ تا ۱۳۰ کلمه؛ جای‌نگهدارها: [نام سردبیر] [نام رسانه] [یافتهٔ برجسته] [نام شما]
export const PR_EMAIL_TEMPLATE_INTRO: PrEmailTemplate = {
  id: "intro",
  title: "قالب ۱ — معرفی + داده (ارسال اول)",
  description: "ایمیل اصلی برای سردبیر رسانهٔ اقتصادی؛ شخصی‌سازی‌شده با یک یافتهٔ برجستهٔ پژوهش «نبض مالی».",
  subject: "دادهٔ جدید از پژوهش نبض مالی کسب‌وکارهای ایرانی",
  body: `[نام سردبیر] عزیز، سلام.

من [نام شما] هستم، از تحریریهٔ «هوش» — سامانهٔ ابری حسابداری برای کسب‌وکارهای ایرانی. در چارچوب پژوهش «نبض مالی»، دادهٔ تازه‌ای جمع‌آوری کرده‌ایم که برای مخاطبان [نام رسانه] جالب است:

[یافتهٔ برجسته]

این یافته بخشی از گزارش داده‌محور ماست؛ خلاصهٔ کامل آن همراه با نمودار و دادهٔ خام، از اتاق خبر هوش (hoosh.nobatime.ir/press) به‌صورت رایگان در دسترس رسانه‌هاست. اگر مایل باشید، داده‌های اختصاصی‌تر، مصاحبه با کارشناسان مالیاتی یا اینفوگرافیک اختصاصی [نام رسانه] را هم برایتان آماده می‌کنیم.

با احترام،
[نام شما] — تحریریهٔ هوش`,
};

// (۲) پیگیری دوم — ۷ روز بعد از ارسال اول
export const PR_EMAIL_TEMPLATE_FOLLOWUP: PrEmailTemplate = {
  id: "followup",
  title: "قالب ۲ — پیگیری دوم (۷ روز بعد)",
  description: "یادآوری کوتاه و محترمانه؛ با پیشنهاد دادهٔ اختصاصی و یک خروج آسان برای سردبیر.",
  subject: "پیگیری: دادهٔ پژوهش نبض مالی برای [نام رسانه]",
  body: `[نام سردبیر] عزیز، سلام.

هفتهٔ گذشته دربارهٔ دادهٔ جدید پژوهش «نبض مالی» برایتان نوشتم — [یافتهٔ برجسته]. اگر فرصت مرورش را نداشتید، خلاصهٔ گزارش و دادهٔ خام همچنان در hoosh.nobatime.ir/press در دسترس است.

برای [نام رسانه] می‌توانیم داده‌های اختصاصی یا مصاحبهٔ اختصاصی هم آماده کنیم. اگر موضوع برایتان جذاب نیست، همین یک خط بفرمایید تا دیگر پیگیری نکنم.

با احترام،
[نام شما] — تحریریهٔ هوش`,
};

// (۳) پیشنهاد مقالهٔ مهمان / دادهٔ انحصاری
export const PR_EMAIL_TEMPLATE_GUEST: PrEmailTemplate = {
  id: "guest",
  title: "قالب ۳ — مقالهٔ مهمان / دادهٔ انحصاری",
  description: "پیشنهاد همکاری محتوایی: مقالهٔ داده‌محورِ منتشرنشده فقط در رسانهٔ مقابل، در ازای یک ارجاع.",
  subject: "پیشنهاد مقالهٔ داده‌محور اختصاصی برای [نام رسانه]",
  body: `[نام سردبیر] عزیز، سلام.

پیشنهاد همکاری محتوایی دارم برای [نام رسانه]: مقالهٔ مهمانِ داده‌محور با محوریت «[یافتهٔ برجسته]» — تحلیل اختصاصی بر پایهٔ دادهٔ پژوهش «نبض مالی» هوش که تا امروز هیچ‌جا منتشر نشده است.

مقاله حدود ۱۵۰۰ کلمه، همراه با نمودارهای اختصاصی و برداشت عملیاتی برای صاحبان کسب‌وکار خواهد بود و فقط در [نام رسانه] منتشر می‌شود؛ در ازای آن، یک ارجاع به اتاق خبر هوش کافی است.

اگر موافق باشید، پیش‌نویس را ظرف یک هفته آماده می‌کنم.

با احترام،
[نام شما] — تحریریهٔ هوش`,
};

/** هر سه قالب به‌ترتیب استفاده — برای رندر یک‌جا در تب */
export const PR_EMAIL_TEMPLATES: PrEmailTemplate[] = [
  PR_EMAIL_TEMPLATE_INTRO,
  PR_EMAIL_TEMPLATE_FOLLOWUP,
  PR_EMAIL_TEMPLATE_GUEST,
];
