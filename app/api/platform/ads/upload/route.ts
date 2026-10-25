import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, access } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/platform/ads/upload — آپلود تصویر بنر تبلیغاتی (سوپرادمین)
// ----------------------------------------------------------------------------
// FIX(3-a): ads-tab.tsx یک XHR به این مسیر می‌فرستاد که وجود نداشت (404) →
// آپلود تصویر تبلیغات همیشه شکست می‌خورد.
// قرارداد همان آپلود عمومی: { success, url } (ads-tab فقط همین دو فیلد را می‌خواند)
// با این تفاوت که فقط سوپرادمین مجاز است. حداکثر حجم تبلیغات: ۲MB
// (مطابق گارد سمت کلاینت ads-tab) — whitelist: jpg/jpeg/png/webp/gif/svg.
// ============================================================================

const MAX_FILE_SIZE = 2 * 1024 * 1024; // ۲ مگابایت — هماهنگ با ads-tab

const ALLOWED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "svg"]);

function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "");
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
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
        { success: false, error: "حجم تصویر تبلیغ نباید بیش از ۲ مگابایت باشد" },
        { status: 400 }
      );
    }

    const fileType = (file.type || "").toLowerCase();
    const nameExt = ((file.name || "").split(".").pop() || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    let ext = ALLOWED_MIME[fileType];
    if (!ext && ALLOWED_EXT.has(nameExt)) {
      ext = nameExt === "jpeg" ? "jpg" : nameExt;
    }
    if (!ext) {
      return NextResponse.json(
        { success: false, error: "فقط تصویر (JPG، PNG، WebP، GIF، SVG) مجاز است" },
        { status: 400 }
      );
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch {
      return NextResponse.json(
        { success: false, error: "خطا در خواندن فایل" },
        { status: 400 }
      );
    }

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

    const fileName = `ad-${crypto.randomUUID()}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    try {
      await mkdir(uploadDir, { recursive: true });
      await access(uploadDir);
    } catch (mkdirErr) {
      console.error("[ads/upload] Cannot create uploads dir:", mkdirErr);
      return NextResponse.json(
        { success: false, error: "خطا در ایجاد پوشه آپلود" },
        { status: 500 }
      );
    }
    const filePath = path.join(uploadDir, fileName);
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
      console.error("[ads/upload] Write file error:", writeErr);
      return NextResponse.json(
        { success: false, error: "خطا در ذخیره فایل" },
        { status: 500 }
      );
    }

    const url = `/uploads/${fileName}`;

    try {
      await db.platformAuditLog.create({
        data: {
          superAdminId: auth.admin.id,
          action: "UPLOAD_AD_IMAGE",
          entity: "Ad",
          entityId: fileName,
          details: JSON.stringify({ size: buffer.byteLength, type: file.type || ext }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      });
    } catch (auditErr) {
      console.error("[ads/upload] audit log error:", auditErr);
    }

    return NextResponse.json({
      success: true,
      url,
      data: {
        name: fileName,
        url,
        size: buffer.byteLength,
        type: file.type || `image/${ext}`,
        uploadedAt: new Date().toISOString(),
      },
      message: "تصویر تبلیغ آپلود شد",
    });
  } catch (error) {
    console.error(
      "[ads/upload] Error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { success: false, error: "خطا در آپلود تصویر — لطفاً دوباره تلاش کنید" },
      { status: 500 }
    );
  }
}
