import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { rateLimit, auditLog, getTenant } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// حداکثر اندازه محتوای فایل متنی که به AI ارسال می‌شود (کاراکتر)
const MAX_TEXT_LENGTH = 20_000;
// حد آپلود فایل (bytes) — ۲ مگابایت
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const FILE_PROMPT = `تو تحلیلگر داده‌ی نرم‌افزار حسابداری «هوش» هستی.
محتوای فایل ارسال‌شده توسط کاربر (CSV/TSV/Excel-exported/JSON) را تحلیل کن و:

۱. ساختار داده را شناسایی کن (ستون‌ها، تعداد ردیف، نوع داده‌ها).
۲. اگر داده‌ی مالی/حسابداری است (فاکتور، تراکنش، مشتری، محصول)، خلاصه‌ای از آن ارائه بده:
 - جمع مبالغ، میانگین، حداقل، حداکثر
 - تعداد رکوردها
 - توزیع بر اساس دسته/نوع/تاریخ
۳. اگر ناقص یا خطا دارد، مشخص کن.
۴. پیشنهاداتی برای بهبود داده یا وارد کردن آن به هوش ارائه بده.
۵. در صورت امکان، داده را به‌صورت جدول مارک‌داون خلاصه کن.

قواعد:
- به فارسی پاسخ بده
- اعداد را به فارسی بنویس
- مبالغ اگر به ریال است به تومان تبدیل کن
- از مارک‌داون (**) و (-) و | table | استفاده کن`;

interface FileAnalyzeRequest {
 content?: string;
 fileName?: string;
 prompt?: string;
}

export async function POST(req: NextRequest) {
 try {
 const ip =
 req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

 if (!rateLimit(`file-analyze:${ip}`, 6, 60_000)) {
 return NextResponse.json(
 { success: false, error: "سقف درخواست تحلیل فایل پر شده است. یک دقیقه بعد تلاش کنید." },
 { status: 429 }
 );
 }

 const body = await req.json();
 const { content, fileName, prompt } = body as FileAnalyzeRequest;

 if (!content || typeof content!== "string" || content.trim().length === 0) {
 return NextResponse.json(
 { success: false, error: "محتوای فایل ارسال نشده است" },
 { status: 400 }
 );
 }

 if (content.length > MAX_TEXT_LENGTH) {
 // برش محتوا برای جلوگیری از prompt طولانی
 const truncated = content.slice(0, MAX_TEXT_LENGTH);
 const body_content = `نام فایل: ${fileName || "نامشخص"}\n\n` +
 `(نکته: محتوای فایل از ${MAX_TEXT_LENGTH} کاراکتر بیشتر بود — فقط ${MAX_TEXT_LENGTH} کاراکتر اول ارسال شد)\n\n` +
 `--- محتوای فایل ---\n${truncated}\n--- پایان محتوا ---\n\n` +
 `سوال کاربر: ${prompt?.trim() || "این داده را تحلیل کن و خلاصه ارائه بده."}`;

 return await runAnalysis(body_content, req, fileName, true);
 }

 const body_content = `نام فایل: ${fileName || "نامشخص"}\n\n` +
 `--- محتوای فایل ---\n${content}\n--- پایان محتوا ---\n\n` +
 `سوال کاربر: ${prompt?.trim() || "این داده را تحلیل کن و خلاصه ارائه بده."}`;

 return await runAnalysis(body_content, req, fileName, false);
 } catch (error: unknown) {
 const msg = error instanceof Error? error.message: "خطای ناشناخته";
 console.error("AI File Analyze error:", msg);
 return NextResponse.json(
 { success: false, error: "خطا در تحلیل فایل. لطفاً دوباره تلاش کنید." },
 { status: 500 }
 );
 }
}

async function runAnalysis(
 body_content: string,
 req: NextRequest,
 fileName: string | undefined,
 truncated: boolean
) {
 const tenant = await getTenant(req);
 if (!tenant) {
 return NextResponse.json(
 { success: false, error: "احراز هویت الزامی است" },
 { status: 401 }
 );
 }

 // Task 3-B: نبود پیکربندی ابری → پروفایل محلی داده (پاسخ ۲۰۰ مفید، نه ۵۰۰)
 const zai = await ZAI.create().catch(() => null);
 if (!zai) {
 const local = localFileProfile(body_content, fileName || "");
 return NextResponse.json({
 success: true,
 reply: local,
 truncated,
 note: "تحلیل عمیق به سرویس مدل ابری نیاز دارد و در دسترس نیست؛ خلاصهٔ آماری محلی ارائه شد.",
 });
 }

 const completion = await zai.chat.completions.create({
 messages: [
 { role: "assistant", content: FILE_PROMPT },
 { role: "user", content: body_content },
 ],
 thinking: { type: "disabled" },
 });

 const reply: string = completion?.choices?.[0]?.message?.content?? "";

 await auditLog({
 tenantId: tenant.id,
 action: "AI_FILE_ANALYZE",
 entity: "ai.file-analyze",
 changes: {
 fileName: (fileName || "").slice(0, 100),
 contentLength: body_content.length,
 truncated,
 replyLength: reply.length,
 },
 req,
 });

 return NextResponse.json({ success: true, reply, truncated });
}

// ============ Task 3-B: پروفایل محلی فایل برای حالت بدون سرویس ابری ============
/** خلاصهٔ آماری محلی CSV/TSV/JSON/متن — ۱۰۰٪ آفلاین، بدون ارسال داده به بیرون */
function localFileProfile(content: string, fileName: string): string {
 const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
 const totalChars = content.length;

 // جدول CSV/TSV؟
 const delim = content.includes("\t") ? "\t" : ",";
 const headerLine = lines[0] ?? "";
 const headers = headerLine.split(delim).map((h) => h.trim().replace(/^"|"$/g, ""));
 const looksTabular =
 headers.length >= 2 && lines.length >= 2 && lines.slice(1, 6).every((l) => l.split(delim).length === headers.length);

 const fa = (n: number | string) => String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

 if (looksTabular) {
 const rows = lines.length - 1;
 const colCount = headers.length;
 const sample = lines.slice(1, 4).map((l, i) => `${fa(i + 1)}. ${l.split(delim).slice(0, 6).join(" | ")}`);
 return (
 `### خلاصهٔ محلی فایل «${fileName || "پیوست"}»\n\n` +
 `- **نوع:** جدولی (CSV/TSV)\n` +
 `- تعداد ردیف داده: ${fa(rows)}\n` +
 `- تعداد ستون: ${fa(colCount)}\n` +
 `- ستون‌ها: ${headers.slice(0, 10).join("، ")}${colCount > 10 ? " و…" : ""}\n\n` +
 `**نمونهٔ ردیف‌ها:**\n${sample.join("\n")}\n\n` +
 `_برای تحلیل عمیق‌تر (روند/مقایسه/شاخص) سرویس مدل ابری لازم است؛ این خلاصه بدون ارسال داده به بیرون و کاملاً آفلاین ساخته شد._`
 );
 }

 // JSON؟
 const trimmed = content.trim();
 if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
 try {
 const parsed: unknown = JSON.parse(trimmed);
 const count = Array.isArray(parsed)
 ? parsed.length
 : typeof parsed === "object" && parsed !== null
 ? Object.keys(parsed).length
 : 0;
 return (
 `### خلاصهٔ محلی فایل «${fileName || "پیوست"}»\n\n` +
 `- **نوع:** JSON ${Array.isArray(parsed) ? "(آرایه)" : "(شیء)"}\n` +
 `- تعداد ${Array.isArray(parsed) ? "عضو" : "کلید"}: ${fa(count)}\n` +
 `- حجم: ${fa(totalChars)} کاراکتر\n\n` +
 `_برای تحلیل عمیق‌تر سرویس مدل ابری لازم است؛ این خلاصه کاملاً آفلاین ساخته شد._`
 );
 } catch {
 // JSON نامعتبر → مانند متن ساده ادامه بده
 }
 }

 // متن ساده
 const words = content.split(/\s+/).filter(Boolean).length;
 return (
 `### خلاصهٔ محلی فایل «${fileName || "پیوست"}»\n\n` +
 `- نوع: متن\n` +
 `- تعداد خط: ${fa(lines.length)}\n` +
 `- تعداد واژه: ${fa(words)}\n` +
 `- حجم: ${fa(totalChars)} کاراکتر\n\n` +
 `**بخش آغازین:**\n${content.slice(0, 400)}${totalChars > 400 ? "…" : ""}\n\n` +
 `_برای تحلیل عمیق‌تر سرویس مدل ابری لازم است؛ این خلاصه کاملاً آفلاین ساخته شد._`
 );
}
