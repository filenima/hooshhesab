// ============================================================
// lib/trial-reminders.ts — یادآوری چندکانالهٔ پایان تریال (v35.2)
// ============================================================
// پیاده‌سازی پیشنهاد شمارهٔ ۵ سند روانشناسی فروش
// (پیشنهادهای-ارتقا-v35.md): «یادآوری چندکانالهٔ پایان تریال».
//
// سه لمسِ زمان‌بندی‌شده — هرکدام با زبان روانشناختی متفاوت:
//   ۱. روز ۳ تریال → «آخرین روز تخفیف ۵٪» (Loss Aversion — منطبق
//      با پنجرهٔ واقعی تخفیف سه‌روزهٔ محصول؛ نه تاریخ‌های ساختگی)
//   ۲. روز ۵ تریال → «دو روز تا پایان؛ گزارش سودتان آماده است؛
//      داده‌ها محفوظ می‌ماند» (نگهداری داده + Endowment)
//   ۳. روز ۷ تریال → «آخرین روز دسترسی کامل + قیمت امروز قفل
//      می‌شود» (فوریت مضاعف + Anchoring پیشنهاد ۲)
//
// کانال‌ها: اعلان درون‌برنامه‌ای (همیشه) + ایمیل (SMTP فعال یا
// fallback به log — sendEmail خودش مدیریت می‌کند).
//
// ضدتکرار (idempotent): برای هر (کاربر × نوع یادآور × دورهٔ تریال)
// یک رکورد AuditLog با کلید یکتا ثبت می‌شود؛ کرون هر ساعت بی‌خطر است.
// ============================================================================
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email-sender";
import {
  getFirstDayDiscount,
  FIRST_DAY_DISCOUNT_PERCENT,
} from "@/lib/first-day-discount";
import { toPersianDigits } from "@/lib/persian";

interface ReminderCandidate {
  id: string;
  tenantId: string | null;
  email: string | null;
  name: string | null;
  family: string | null;
  isTrial: boolean;
  trialEndsAt: Date | null;
  createdAt: Date;
}

export interface TrialReminderResult {
  scanned: number;
  sent: { discountFinalDay: number; valueDay: number; finalDay: number };
  skipped: number;
  emails: number;
}

/** کلید یکتای ضدتکرار — دورهٔ تریال جدید = کلید جدید */
function markerKey(userId: string, kind: string, trialEndMs: number): string {
  return `trial-reminder:${userId}:${kind}:${trialEndMs}`;
}

async function alreadySent(key: string): Promise<boolean> {
  const found = await db.auditLog.findFirst({
    where: { entity: "trial-reminder", entityId: key },
    select: { id: true },
  });
  return !!found;
}

async function markSent(key: string, cand: ReminderCandidate): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        tenantId: cand.tenantId ?? "system",
        userId: cand.id,
        action: "TRIAL_REMINDER_SENT",
        entity: "trial-reminder",
        entityId: key,
        changes: JSON.stringify({ kind: key.split(":")[2] }),
      },
    });
  } catch {
    /* نباید جریان را متوقف کند */
  }
}

function fullName(cand: ReminderCandidate): string {
  return `${cand.name ?? ""} ${cand.family ?? ""}`.trim() || "کاربر گرامی";
}

/** قالب ایمیل RTL ساده — بدون وابستگی، مطابق برند (بدون آبی) */
function emailHtml(title: string, paragraphs: string[], ctaText: string): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:24px;background:#fafaf9;font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(270deg,#059669,#d97706);padding:20px 24px;">
      <h1 style="margin:0;color:#ffffff;font-size:18px;">هوش | نرم‌افزار حسابداری هوشمند</h1>
    </div>
    <div style="padding:24px;">
      <h2 style="margin:0 0 14px;color:#1c1917;font-size:16px;">${title}</h2>
      ${paragraphs.map((p) => `<p style="margin:0 0 12px;color:#44403c;font-size:13.5px;line-height:2;">${p}</p>`).join("")}
      <a href="/pricing" style="display:inline-block;margin-top:8px;background:#059669;color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:10px;font-size:13.5px;font-weight:bold;">${ctaText}</a>
    </div>
    <div style="padding:14px 24px;background:#fafaf9;border-top:1px solid #e7e5e4;color:#78716c;font-size:11px;">
      این ایمیل به‌صورت خودکار ارسال شده است — هوش، حسابداری هوشمند کسب‌وکارهای ایرانی
    </div>
  </div>
</body>
</html>`;
}

/**
 * اسکن کاربران تریال و ارسال یادآوری‌های سررسیدشده.
 * هر یادآوری حداکثر یک‌بار در هر دورهٔ تریال ارسال می‌شود.
 */
export async function sendTrialReminders(): Promise<TrialReminderResult> {
  const now = new Date();
  const result: TrialReminderResult = {
    scanned: 0,
    sent: { discountFinalDay: 0, valueDay: 0, finalDay: 0 },
    skipped: 0,
    emails: 0,
  };

  // کاربران تریالِ فعال (پایان در آینده)
  const candidates = await db.user.findMany({
    where: {
      isTrial: true,
      trialEndsAt: { not: null, gte: now },
      deletedAt: null,
    },
    select: {
      id: true,
      tenantId: true,
      email: true,
      name: true,
      family: true,
      isTrial: true,
      trialEndsAt: true,
      createdAt: true,
    },
    take: 500,
  });
  result.scanned = candidates.length;

  for (const cand of candidates) {
    if (!cand.trialEndsAt) continue;
    const trialEndMs = new Date(cand.trialEndsAt).getTime();
    const daysRemaining = Math.max(
      0,
      Math.ceil((trialEndMs - now.getTime()) / (24 * 60 * 60 * 1000))
    );

    // ─── تعریف سه یادآور ───
    interface ReminderDef {
      kind: "discountFinalDay" | "valueDay" | "finalDay";
      due: boolean;
      title: string;
      message: string;
      type: "INFO" | "WARNING";
      email?: { subject: string; paragraphs: string[]; ctaText: string };
    }
    const reminders: ReminderDef[] = [];

    // ۱) آخرین روز تخفیف ۵٪ (پنجرهٔ واقعی: ۳ روز اول ثبت‌نام)
    const discount = getFirstDayDiscount(cand.createdAt);
    if (discount.active && discount.secondsRemaining > 0 && discount.secondsRemaining <= 24 * 3600) {
      // ساعت باقی‌ماندهٔ واقعی — صدق در ادعا (مهلت، پایان «امروز» نیست؛ X ساعت دیگر است)
      const hoursLeft = Math.max(1, Math.ceil(discount.secondsRemaining / 3600));
      const hoursFa = toPersianDigits(hoursLeft);
      reminders.push({
        kind: "discountFinalDay",
        due: true,
        title: `آخرین فرصت: تخفیف ${toPersianDigits(FIRST_DAY_DISCOUNT_PERCENT)}٪ ویژهٔ شما`,
        message: `تخفیف ${toPersianDigits(FIRST_DAY_DISCOUNT_PERCENT)}٪ خرید پلن فقط تا ${hoursFa} ساعت دیگر فعال است؛ پس از آن به‌طور خودکار حذف می‌شود و قیمت کامل خواهد بود — همین حالا پلن خود را با قیمت امروز قفل کنید.`,
        type: "WARNING",
        email: {
          subject: `آخرین فرصت: تخفیف ${toPersianDigits(FIRST_DAY_DISCOUNT_PERCENT)}٪ هوش تا ${hoursFa} ساعت دیگر`,
          paragraphs: [
            `${fullName(cand)} عزیز،`,
            `تخفیف ${toPersianDigits(FIRST_DAY_DISCOUNT_PERCENT)}٪ خرید اشتراک هوش فقط تا ${hoursFa} ساعت دیگر برای شما فعال است و پس از آن به‌طور خودکار غیرفعال می‌شود.`,
            "اگر قصد ادامه دارید، همین حالا مقرون‌به‌صرفه‌ترین ساعت شماست.",
          ],
          ctaText: "دیدن پلن‌ها با تخفیف ۵٪",
        },
      });
    }

    // ۲) روز ۵ تریال (دو روز مانده) — گزارش ارزش و محفوظ‌ماندن داده‌ها
    if (daysRemaining === 2) {
      // شمارش واقعی فعالیت کاربر برای «گزارش آماده است» (صدق در ادعا)
      let invoiceCount = 0;
      let partyCount = 0;
      try {
        if (cand.tenantId) {
          [invoiceCount, partyCount] = await Promise.all([
            db.invoice.count({
              where: { tenantId: cand.tenantId!, type: { in: ["SALE", "PURCHASE"] } },
            }),
            db.party.count({ where: { tenantId: cand.tenantId! } }),
          ]);
        }
      } catch {
        /* شمارش اختیاری است */
      }
      const hasActivity = invoiceCount > 0 || partyCount > 0;
      reminders.push({
        kind: "valueDay",
        due: true,
        title: "دو روز تا پایان تریال — داده‌های شما آماده و محفوظ است",
        message: hasActivity
          ? `شما تا امروز ${toPersianDigits(invoiceCount)} فاکتور و ${toPersianDigits(partyCount)} طرف‌حساب ثبت کرده‌اید؛ گزارش سود و زیانتان همین حالا در «گزارش‌ها» آماده است. با انتخاب پلن، همهٔ این داده‌ها دقیقاً همان‌جا که هستند می‌مانند.`
          : "دو روز از دسترسی کامل شما باقی مانده. با ثبت چند فاکتور واقعی، گزارش سود و زیان خودکار ساخته می‌شود — و با انتخاب پلن، همه‌چیز محفوظ می‌ماند.",
        type: "INFO",
        email: {
          subject: "دو روز تا پایان تریال هوش — گزارش شما آماده است",
          paragraphs: [
            `${fullName(cand)} عزیز،`,
            hasActivity
              ? `شما در این دوره ${toPersianDigits(invoiceCount)} فاکتور و ${toPersianDigits(partyCount)} طرف‌حساب ثبت کرده‌اید و گزارش سود و زیان شما به‌صورت خودکار به‌روز شده است.`
              : "با ثبت چند فاکتور واقعی، گزارش سود و زیان شما به‌صورت خودکار ساخته می‌شود.",
            "با انتخاب پلن، همهٔ داده‌ها، تنظیمات و گزارش‌هایتان بدون هیچ تغییری محفوظ می‌مانند — این را از دست ندهید.",
          ],
          ctaText: "دیدن گزارش و پلن‌ها",
        },
      });
    }

    // ۳) آخرین روز تریال (روز ۷) — فوریت مضاعف + قیمت قفل
    if (daysRemaining <= 1) {
      reminders.push({
        kind: "finalDay",
        due: true,
        title: "امروز آخرین روز دسترسی کامل به هوش است",
        message:
          "دسترسی کامل به همهٔ ۱۶ ماژول فقط تا امشب فعال است. با خرید پلن امروز: ۱) داده‌های هفتهٔ گذشته‌تان دست‌نخورده می‌ماند ۲) قیمت امروز برای شما قفل می‌شود و افزایش‌های سالانهٔ آینده شامل شما نخواهد بود.",
        type: "WARNING",
        email: {
          subject: "آخرین روز تریال هوش — تصمیم امروز، قیمت همیشگی",
          paragraphs: [
            `${fullName(cand)} عزیز،`,
            "امروز آخرین روز دسترسی کامل شما به هوش است.",
            "با خرید پلن امروز: داده‌های این هفتهٔ شما دست‌نخورده می‌ماند و قیمت امروز برای همیشه برای شما قفل می‌شود — رقبا هر سال ۲۰ تا ۳۰٪ گران می‌کنند.",
          ],
          ctaText: "فعال‌سازی پلن با قیمت امروز",
        },
      });
    }

    // ─── ارسال یادآورهای سررسیدشده (با ضدتکرار) ───
    for (const rem of reminders) {
      if (!rem.due) continue;
      const key = markerKey(cand.id, rem.kind, trialEndMs);
      if (await alreadySent(key)) {
        result.skipped++;
        continue;
      }

      // ۱) اعلان درون‌برنامه‌ای
      try {
        await db.notification.create({
          data: {
            tenantId: cand.tenantId ?? "system",
            userId: cand.id,
            title: rem.title,
            message: rem.message,
            type: rem.type,
            link: "/?module=license",
          },
        });
      } catch {
        /* ایمیلی را هم امتحان می‌کنیم */
      }

      // ۲) ایمیل (اگر نشانی دارد)
      if (cand.email) {
        try {
          const mail = await sendEmail({
            to: cand.email,
            subject: rem.email!.subject,
            html: emailHtml(rem.title, rem.email!.paragraphs, rem.email!.ctaText),
          });
          if (mail.success) result.emails++;
        } catch {
          /* SMTP غیرفعال — اعلان درون‌برنامه‌ای کافی است */
        }
      }

      await markSent(key, cand);
      result.sent[rem.kind]++;
    }
  }

  return result;
}
