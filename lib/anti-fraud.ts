// ============ anti-fraud.ts — سد قدرتمند ضدتقلب ثبت‌نام (v39 — راند ۱۲) =====
// ----------------------------------------------------------------------------
// سیاست: هر «سیستم/دستگاه» و هر «شماره موبایل» حداکثر N بار می‌تواند
// ثبت‌نام کند (حساب تریال/رایگان). بار N+1 به بعد مسدود است و پیام واضح
// نشان داده می‌شود. **سقف‌ها از راند ۱۲ قابل‌تنظیم از پنل سوپرادمین‌اند**
// (SystemSettings → anti_fraud_limits) — کم/زیاد/غیرفعال + معافیت تک‌تک
// دستگاه‌ها/شماره‌ها/IPها از طریق فیلد exempt.
//
// لایه‌های تشخیص (همه سمت سرور):
//   ۱) Device Fingerprint — هش پایدار از سیگنال‌های مرورگر
//   ۲) شماره موبایل نرمال‌شده (۰۹xxxxxxxxx)
//   ۳) IP — سقف بالاتر (NAT شرکت‌ها/خانواده‌ها یک IP مشترک دارند)
//   ۴) ایمیل
//
// مقاوم در برابر دور زدن:
//   - کلیدهای device در غیبت fingerprint از IP+UA هش می‌شوند
//   - شمارنده‌ها اتمیک increment می‌شوند (race-safe)
//   - همهٔ تلاش‌ها در RegistrationGuard + AuditLog ثبت می‌شوند
//   - سوپرادمین می‌تواند هر کلید را معاف (exempt) یا مسدود (blocked) کند
// ============================================================================

import { db } from "@/lib/db";
import { createHash } from "crypto";

/** حداکثر ثبت‌نام به ازای هر دستگاه — مقدار پیش‌فرض؛ مقدار مؤثر از DB خوانده می‌شود */
export const MAX_REGS_PER_DEVICE = 2;
/** حداکثر ثبت‌نام به ازای هر شماره موبایل — مقدار پیش‌فرض */
export const MAX_REGS_PER_PHONE = 2;
/** حداکثر ثبت‌نام به ازای هر ایمیل (الگوی مشابه throwaway) — مقدار پیش‌فرض */
export const MAX_REGS_PER_EMAIL = 2;
/** سقف IP بالاتر — NAT ادارات/خانواده‌ها — مقدار پیش‌فرض */
export const MAX_REGS_PER_IP = 6;

export interface GuardSignals {
  /** fingerprint سمت کلاینت (اختیاری — در غیبت از IP+UA ساخته می‌شود) */
  deviceFingerprint?: string | null;
  /** شماره موبایل (هر فرمتی — نرمال‌سازی داخل موتور) */
  phone?: string | null;
  /** ایمیل */
  email?: string | null;
  /** IP درخواست */
  ip?: string | null;
  /** User-Agent */
  userAgent?: string | null;
}

export interface GuardVerdict {
  allowed: boolean;
  /** دلیل رد (فارسی، برای نمایش به کاربر) */
  reason?: string;
  /** کد خطا برای فرانت */
  errorCode?: "DEVICE_LIMIT" | "PHONE_LIMIT" | "EMAIL_LIMIT" | "IP_LIMIT" | "BLOCKED";
  /** جزئیات لایه‌ها برای لاگ */
  detail: {
    deviceKey: string;
    phoneKey: string | null;
    emailKey: string | null;
    ipKey: string;
    counts: { device: number; phone: number | null; email: number | null; ip: number };
  };
}

/* ---------------- نرمال‌سازی و هش ---------------- */

/** تبدیل ارقام فارسی/عربی به لاتین */
export function normalizeDigits(input: string): string {
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  const ar = "٠١٢٣٤٥٦٧٨٩";
  return input.replace(/[۰-۹٠-٩]/g, (d) => {
    const i = fa.indexOf(d);
    if (i >= 0) return String(i);
    return String(ar.indexOf(d));
  });
}

/** نرمال‌سازی شماره موبایل ایرانی → ۰۹xxxxxxxxx (یا null) */
export function normalizeIranMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = normalizeDigits(raw).replace(/[\s\-()]/g, "");
  // +989xxxxxxxxx → 09…
  if (/^\+989\d{9}$/.test(s)) s = "0" + s.slice(3);
  // 989xxxxxxxxx → 09…
  else if (/^989\d{9}$/.test(s)) s = "0" + s.slice(2);
  // 9xxxxxxxxx → 09…
  else if (/^9\d{9}$/.test(s)) s = "0" + s;
  return /^09\d{9}$/.test(s) ? s : null;
}

/** هش کوتاه و پایدار (sha256 → 24 hex) */
function hashKey(parts: (string | null | undefined)[]): string {
  return createHash("sha256")
    .update(parts.filter(Boolean).join("|") || "unknown")
    .digest("hex")
    .slice(0, 24);
}

/** استخراج IP از هدرهای استاندارد (پشت Caddy/CDN) */
export function extractIp(headers: Headers): string {
  return (
    headers.get("x-real-ip") ||
    (headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "0.0.0.0"
  );
}

/** ساخت کلیدهای یکنواخت — بین check و record مشترک تا هیچ انحرافی رخ ندهد */
function buildGuardKeys(signals: GuardSignals) {
  const ip = signals.ip || "0.0.0.0";
  const ua = signals.userAgent || "unknown";
  const fpRaw = (signals.deviceFingerprint || "").trim();
  const deviceKey = `device:${/^[a-f0-9-]{16,64}$/i.test(fpRaw) ? fpRaw.toLowerCase() : hashKey([ip, ua])}`;
  const phone = normalizeIranMobile(signals.phone);
  const phoneKey = phone ? `phone:${phone}` : null;
  const email = (signals.email || "").trim().toLowerCase();
  const emailKey = email ? `email:${email}` : null;
  const ipKey = `ip:${hashKey([ip])}`;
  return { ip, ua, deviceKey, phoneKey, emailKey, ipKey };
}

/* ---------------- موتور اصلی ---------------- */

/**
 * بررسی اجازهٔ ثبت‌نام — قبل از ساخت حساب صدا زده می‌شود.
 * سقف‌ها از SystemSettings (قابل‌تنظیم از پنل سوپرادمین) خوانده می‌شوند؛
 * کلیدهای «معاف» (exempt=true) هیچ سقفی ندارند.
 * هرگز throw نمی‌کند؛ خطای DB = اجازه (fail-open برای دسترس‌پذیری ثبت‌نام،
 * چون تلاش‌های مخرب در Rate limit لایهٔ بالاتر هم مهار می‌شوند).
 */
export async function checkRegistrationGuard(
  signals: GuardSignals
): Promise<GuardVerdict> {
  const { deviceKey, phoneKey, emailKey, ipKey } = buildGuardKeys(signals);

  // سقف‌های مؤثر از تنظیمات (پنل) — خطا = پیش‌فرض‌های امن
  let limits = {
    enabled: true,
    device: MAX_REGS_PER_DEVICE,
    phone: MAX_REGS_PER_PHONE,
    email: MAX_REGS_PER_EMAIL,
    ip: MAX_REGS_PER_IP,
  };
  try {
    const { getAntiFraudLimits } = await import("@/lib/system-settings");
    limits = await getAntiFraudLimits();
  } catch {
    /* تنظیمات خوانده نشد → پیش‌فرض */
  }

  try {
    const keys = [deviceKey, ipKey, ...(phoneKey ? [phoneKey] : []), ...(emailKey ? [emailKey] : [])];
    const rows = await db.registrationGuard.findMany({ where: { guardKey: { in: keys } } });
    const byKey = new Map(rows.map((r) => [r.guardKey, r]));

    const deviceRow = byKey.get(deviceKey);
    const phoneRow = phoneKey ? byKey.get(phoneKey) : undefined;
    const emailRow = emailKey ? byKey.get(emailKey) : undefined;
    const ipRow = byKey.get(ipKey);

    const counts = {
      device: deviceRow?.count ?? 0,
      phone: phoneRow?.count ?? null,
      email: emailRow?.count ?? null,
      ip: ipRow?.count ?? 0,
    };
    const ctx = { deviceKey, phoneKey, emailKey, ipKey, counts };

    // مسدودی دستی سوپرادمین — حتی اگر سیستم خاموش باشد، مسدودی معتبر است
    if (deviceRow?.blocked) {
      return denied(
        "DEVICE_LIMIT",
        "این دستگاه به دلیل فعالیت مشکوک مسدود شده است. برای پیگیری با پشتیبانی تماس بگیرید.",
        { ...ctx, deviceRow, phoneRow, emailRow, ipRow }
      );
    }
    if (phoneRow?.blocked) {
      return denied(
        "PHONE_LIMIT",
        "این شماره موبایل به دلیل فعالیت مشکوک مسدود شده است. برای پیگیری با پشتیبانی تماس بگیرید.",
        { ...ctx, deviceRow, phoneRow, emailRow, ipRow }
      );
    }

    // سویچ اصلی خاموش → فقط مسدودی دستی فعال است
    if (!limits.enabled) {
      return { allowed: true, detail: { deviceKey, phoneKey, emailKey, ipKey, counts } };
    }

    // سقف دستگاه (۰ = بدون سقف) — معافیت exempt سقف را دور می‌زند
    if (limits.device > 0 && !deviceRow?.exempt && (deviceRow?.count ?? 0) >= limits.device) {
      return denied(
        "DEVICE_LIMIT",
        `با این دستگاه قبلاً ${limits.device} بار ثبت‌نام انجام شده است. برای ادامهٔ استفاده، لطفاً یکی از پلن‌های پولی را تهیه کنید یا با پشتیبانی تماس بگیرید.`,
        { ...ctx, deviceRow, phoneRow, emailRow, ipRow }
      );
    }

    // سقف شماره موبایل
    if (limits.phone > 0 && phoneRow && !phoneRow.exempt && phoneRow.count >= limits.phone) {
      return denied(
        "PHONE_LIMIT",
        `این شماره موبایل قبلاً ${limits.phone} بار برای ثبت‌نام استفاده شده است. هر شماره فقط ${limits.phone} بار می‌تواند ثبت‌نام کند.`,
        { ...ctx, deviceRow, phoneRow, emailRow, ipRow }
      );
    }

    // سقف ایمیل
    if (limits.email > 0 && emailRow && !emailRow.exempt && emailRow.count >= limits.email) {
      return denied(
        "EMAIL_LIMIT",
        `این ایمیل قبلاً ${limits.email} بار ثبت‌نام کرده است. لطفاً وارد شوید یا از ایمیل دیگری استفاده کنید.`,
        { ...ctx, deviceRow, phoneRow, emailRow, ipRow }
      );
    }

    // سقف IP
    if (limits.ip > 0 && !ipRow?.exempt && (ipRow?.count ?? 0) >= limits.ip) {
      return denied(
        "IP_LIMIT",
        "از این شبکهٔ اینترنت تعداد ثبت‌نام مجاز تکمیل شده است. برای ثبت‌نام‌های سازمانی با پشتیبانی تماس بگیرید.",
        { ...ctx, deviceRow, phoneRow, emailRow, ipRow }
      );
    }

    return {
      allowed: true,
      detail: { deviceKey, phoneKey, emailKey, ipKey, counts },
    };
  } catch (error) {
    console.error("[anti-fraud] checkRegistrationGuard error:", error);
    // fail-open برای دسترس‌پذیری — با شمارنده‌های صفر
    return {
      allowed: true,
      detail: {
        deviceKey,
        phoneKey,
        emailKey,
        ipKey,
        counts: { device: 0, phone: null, email: null, ip: 0 },
      },
    };
  }
}

function denied(
  errorCode: NonNullable<GuardVerdict["errorCode"]>,
  reason: string,
  ctx: {
    deviceKey: string;
    phoneKey: string | null;
    emailKey: string | null;
    ipKey: string;
    counts: { device: number; phone: number | null; email: number | null; ip: number };
    deviceRow?: { count: number };
    phoneRow?: { count: number };
    emailRow?: { count: number };
    ipRow?: { count: number };
  }
): GuardVerdict {
  return {
    allowed: false,
    errorCode,
    reason,
    detail: {
      deviceKey: ctx.deviceKey,
      phoneKey: ctx.phoneKey,
      emailKey: ctx.emailKey,
      ipKey: ctx.ipKey,
      counts: {
        device: ctx.deviceRow?.count ?? ctx.counts.device,
        phone: ctx.phoneRow?.count ?? ctx.counts.phone,
        email: ctx.emailRow?.count ?? ctx.counts.email,
        ip: ctx.ipRow?.count ?? ctx.counts.ip,
      },
    },
  };
}

/**
 * ثبت یک ثبت‌نام موفق — شمارنده‌های همهٔ لایه‌ها اتمیک increment می‌شوند.
 * فقط بعد از موفقیتِ کامل ساخت حساب صدا زده شود.
 */
export async function recordRegistrationSuccess(signals: GuardSignals): Promise<void> {
  const { ip, ua, deviceKey, phoneKey, emailKey, ipKey } = buildGuardKeys(signals);

  const entries: { key: string; type: string }[] = [
    { key: deviceKey, type: "device" },
    { key: ipKey, type: "ip" },
    ...(phoneKey ? [{ key: phoneKey, type: "phone" }] : []),
    ...(emailKey ? [{ key: emailKey, type: "email" }] : []),
  ];

  await Promise.all(
    entries.map((e) =>
      db.registrationGuard.upsert({
        where: { guardKey: e.key },
        create: {
          guardKey: e.key,
          guardType: e.type,
          count: 1,
          lastIp: ip,
          lastUserAgent: ua,
        },
        update: {
          count: { increment: 1 },
          lastIp: ip,
          lastUserAgent: ua,
          lastSeen: new Date(),
        },
      }).catch(() => {
        /* آمار ضدتقلب نباید جریان ثبت‌نام موفق را متوقف کند */
      })
    )
  );
}
