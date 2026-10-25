import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, access } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { requireUser } from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/files/upload — آپلود تصویر عمومی (بلاگ/CMS/تبلیغات/مدیریت فایل)
// ----------------------------------------------------------------------------
// FIX(3-a باگ #۱ — بحرانی): این مسیر اصلاً وجود نداشت در حالی که ۵ کامپوننت
// (blog-editor-tab، cms-editor-tab، rich-content-editor، image-upload،
// file-manager-dialog) آن را صدا می‌زدند → «دکمه ساخت مقاله همیشه ارور می‌داد».
//
// قرارداد: POST multipart/form-data با فیلد «file» → ذخیره در public/uploads/
// با نام یکتا (uuid + پسوند امن) → پاسخ:
//   { success: true, url: "/uploads/<name>", message,
//     data: { name, url, size, sizeHuman, type, uploadedAt } }
//
// امنیت:
//   - احراز هویت اجباری: توکن سوپرادمین (requireSuperAdmin) یا توکن کاربر
//     (requireUser — برای FileManagerDialog پنل کاربری). آپلود ناشناس = 401.
//   - whitelist پسوند/MIME: jpg/jpeg/png/webp/gif/svg
//   - سقف حجم: ۵ مگابایت
//   - نام فایل سمت سرور ساخته می‌شود (uuid) → path traversal ناممکن است؛
//     به‌علاوه پسوند فقط از مجموعهٔ امن نگاشت می‌شود.
//   - SVG قبل از ذخیره پاک‌سازی می‌شود (script/on*/javascript:) چون روی
//     همان origin سرو می‌شود (XSS ذخیره‌شده — همانند FIX(SEC-4a)).
// ============================================================================

const MAX_FILE_SIZE = 5 * 1024 * 1024; // ۵ مگابایت

const ALLOWED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "svg"]);

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * پاک‌سازی SVG — حذف script، صفات on* و javascript: URLs.
 * دفاع در عمق است؛ سرو کردن SVG با CSP سخت‌گیرانه در app/uploads/[name] هم انجام می‌شود.
 */
function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "");
}

export async function POST(req: NextRequest) {
  try {
    // ─── احراز هویت: سوپرادمین یا کاربر لاگین‌شده ───
    let actor: {
      kind: "superadmin" | "user";
      superAdminId?: string;
      userId?: string;
      tenantId?: string;
    } | null = null;

    const adminAuth = await requireSuperAdmin(req);
    if (!("error" in adminAuth)) {
      actor = { kind: "superadmin", superAdminId: adminAuth.admin.id };
    } else {
      const userAuth = await requireUser(req);
      if (!("error" in userAuth)) {
        actor = {
          kind: "user",
          userId: userAuth.user.userId,
          tenantId: userAuth.user.tenantId,
        };
      }
    }
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "احراز هویت الزامی است" },
        { status: 401 }
      );
    }

    // ─── فرم ───
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { success: false, error: "درخواست باید multipart/form-data باشد" },
        { status: 400 }
      );
    }

    const file = formData.get("file") as File | null;
    if (!file || typeof file !== "object" || typeof file.arrayBuffer !== "function") {
      return NextResponse.json(
        { success: false, error: "فایل الزامی است (فیلد file)" },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { success: false, error: "فایل خالی است" },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "حجم فایل نباید بیش از ۵ مگابایت باشد" },
        { status: 400 }
      );
    }

    // ─── تعیین پسوند امن (MIME معتبر → پسوند whitelist؛ fallback پسوند نام فایل) ───
    const fileType = (file.type || "").toLowerCase();
    const nameExtRaw = (file.name || "").split(".").pop() || "";
    const nameExt = nameExtRaw.toLowerCase().replace(/[^a-z0-9]/g, "");
    let ext = ALLOWED_MIME[fileType];
    if (!ext) {
      // MIME نامعتبر/خالی — پسوند نام فایل از مجموعهٔ امن؟ (کلاینت‌های واقعی image/* می‌فرستند)
      if (ALLOWED_EXT.has(nameExt)) {
        ext = nameExt === "jpeg" ? "jpg" : nameExt;
      }
    }
    if (!ext) {
      return NextResponse.json(
        {
          success: false,
          error: "فقط تصویر (JPG، PNG، WebP، GIF، SVG) مجاز است",
        },
        { status: 400 }
      );
    }

    // ─── خواندن بافر ───
    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch {
      return NextResponse.json(
        { success: false, error: "خطا در خواندن فایل — فایل ممکن است خراب باشد" },
        { status: 400 }
      );
    }

    // SVG: پاک‌سازی قبل از ذخیره (XSS)
    if (ext === "svg") {
      const asText = buffer.toString("utf8");
      if (!/<svg[\s>]/i.test(asText)) {
        return NextResponse.json(
          { success: false, error: "فایل SVG معتبر نیست" },
          { status: 400 }
        );
      }
      buffer = Buffer.from(sanitizeSvg(asText), "utf8");
    }

    // ─── نام یکتا: uuid + پسوند امن (ضد path-traversal) ───
    const fileName = `cms-${crypto.randomUUID()}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    try {
      await mkdir(uploadDir, { recursive: true });
      await access(uploadDir);
    } catch (mkdirErr) {
      console.error("[files/upload] Cannot create uploads dir:", mkdirErr);
      return NextResponse.json(
        { success: false, error: "خطا در ایجاد پوشه آپلود" },
        { status: 500 }
      );
    }
    const filePath = path.join(uploadDir, fileName);
    // گارد نهایی: مسیر حل‌شده باید داخل uploads باشد
    const resolvedRoot = path.resolve(uploadDir);
    const resolvedFile = path.resolve(filePath);
    if (!resolvedFile.startsWith(resolvedRoot + path.sep)) {
      return NextResponse.json(
        { success: false, error: "مسیر فایل نامعتبر است" },
        { status: 400 }
      );
    }

    try {
      await writeFile(filePath, buffer);
    } catch (writeErr) {
      console.error("[files/upload] Write file error:", writeErr);
      return NextResponse.json(
        { success: false, error: "خطا در ذخیره فایل" },
        { status: 500 }
      );
    }

    const url = `/uploads/${fileName}`;

    // ─── audit log ───
    try {
      if (actor.kind === "superadmin") {
        await db.platformAuditLog.create({
          data: {
            superAdminId: actor.superAdminId,
            action: "UPLOAD_FILE",
            entity: "File",
            entityId: fileName,
            details: JSON.stringify({
              name: fileName,
              size: buffer.byteLength,
              type: file.type || ext,
            }),
            ipAddress: req.headers.get("x-forwarded-for") || null,
          },
        });
      } else {
        await db.auditLog.create({
          data: {
            tenantId: actor.tenantId || "",
            userId: actor.userId || "",
            action: "UPLOAD_FILE",
            entity: "File",
            entityId: fileName,
          },
        });
      }
    } catch (auditErr) {
      console.error("[files/upload] audit log error:", auditErr);
    }

    const uploadedAt = new Date().toISOString();
    return NextResponse.json({
      success: true,
      url,
      message: "فایل با موفقیت آپلود شد",
      data: {
        name: fileName,
        url,
        size: buffer.byteLength,
        sizeHuman: humanSize(buffer.byteLength),
        type: file.type || `image/${ext}`,
        uploadedAt,
      },
    });
  } catch (error) {
    console.error(
      "[files/upload] Error:",
      error instanceof Error ? error.message : error
    );
    // پیام خام خطا به کلاینت نشت نمی‌کند
    return NextResponse.json(
      { success: false, error: "خطا در آپلود فایل — لطفاً دوباره تلاش کنید" },
      { status: 500 }
    );
  }
}
