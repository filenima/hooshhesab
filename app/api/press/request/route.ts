import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/auth";
import { sendFormSubmitEmail, SUPPORT_EMAIL } from "@/lib/formsubmit";

// ============================================================
// POST /api/press/request — اتاق خبر هوش (Digital PR)
// ============================================================
// عمومی (بدون احراز هویت) برای دو گروه:
//  ۱) رسانه‌ها: درخواست بستهٔ رسانه‌ای / مصاحبه / دادهٔ تفکیکی
//  ۲) کسب‌وکارها: مشارکت در پژوهش «نبض مالی»
// ذخیره در SystemSettings کلید press_requests (JSON، سقف ۲۰۰ رکورد)
// + نوتیفیکیشن ایمیلی فرم‌سابمیت. rate-limit: ۵ درخواست/۱۵ دقیقه/IP.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRESS_REQUESTS_KEY = "press_requests";
const WINDOW_MS = 15 * 60_000;
const MAX_PER_WINDOW = 5;
const MAX_RECORDS = 200;

const REQUEST_TYPES = ["media-kit", "interview", "data", "survey"] as const;
type RequestType = (typeof REQUEST_TYPES)[number];

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const attempts = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const arr = (attempts.get(key) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  attempts.set(key, arr);
  if (attempts.size > 2000) {
    for (const [k, v] of attempts) {
      if (v.every((t) => now - t >= WINDOW_MS)) attempts.delete(k);
    }
  }
  return arr.length > MAX_PER_WINDOW;
}

function sanitize(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.trim().replace(/\s+/g, " ");
  if (!s) return undefined;
  return s.slice(0, max);
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    if (rateLimited(`press:${ip}`)) {
      return NextResponse.json(
        { success: false, error: "تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید." },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = sanitize(body.name, 80);
    const email = sanitize(body.email, 120)?.toLowerCase();
    const org = sanitize(body.org, 120);
    const type = REQUEST_TYPES.includes(body.type as RequestType)
      ? (body.type as RequestType)
      : "media-kit";
    const message = sanitize(body.message, 2000);

    if (!name || name.length < 2) {
      return NextResponse.json({ success: false, error: "نام را کامل وارد کنید." }, { status: 400 });
    }
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ success: false, error: "ایمیل معتبر وارد کنید." }, { status: 400 });
    }

    const record = {
      id: crypto.randomUUID(),
      name,
      email,
      org: org || null,
      type,
      message: message || null,
      createdAt: new Date().toISOString(),
    };

    // ذخیره در SystemSettings (سقف ۲۰۰؛ قدیمی‌ها حذف می‌شوند)
    try {
      const row = await db.systemSettings.findUnique({ where: { key: PRESS_REQUESTS_KEY } });
      const list: unknown[] = row?.value ? JSON.parse(row.value) : [];
      if (Array.isArray(list)) {
        list.unshift(record);
        const trimmed = list.slice(0, MAX_RECORDS);
        await db.systemSettings.upsert({
          where: { key: PRESS_REQUESTS_KEY },
          update: { value: JSON.stringify(trimmed) },
          create: { key: PRESS_REQUESTS_KEY, value: JSON.stringify(trimmed) },
        });
      }
    } catch {
      // ذخیره اختیاری است — ایمیل مهم‌تر است
    }

    // نوتیفیکیشن ایمیلی (fire-and-forget)
    const typeLabel =
      type === "interview"
        ? "درخواست مصاحبه"
        : type === "data"
          ? "درخواست دادهٔ تفکیکی"
          : type === "survey"
            ? "مشارکت در پژوهش نبض مالی"
            : "درخواست بستهٔ رسانه‌ای";
    void sendFormSubmitEmail({
      to: SUPPORT_EMAIL,
      subject: `[اتاق خبر هوش] ${typeLabel} — ${name}`,
      fromName: name,
      fromEmail: email,
      message: message || "-",
      extra: { نوع: typeLabel, رسانه_سازمان: org || "-" },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message:
        type === "survey"
          ? "ثبت شد! خلاصهٔ یافته‌های پژوهش برایتان ایمیل می‌شود. سپاس از مشارکت."
          : "درخواست ثبت شد؛ بستهٔ رسانه‌ای ظرف یک روز کاری ارسال می‌شود.",
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "خطای غیرمنتظره" },
      { status: 500 }
    );
  }
}
