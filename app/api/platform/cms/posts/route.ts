import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { cacheDeleteByPrefix } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/platform/cms/posts — لیست همه پست‌ها (شامل draft)
// FIX(v20): محتوای کامل HTML پست‌ها (هر کدام ~۱۸۰KB برای مقالات ۳۰۰۰+ کلمه‌ای)
// در لیست ارسال نمی‌شود — با ۳۳ پست، پاسخ ~۶MB می‌شد و مرورگر/سرور را
// زیر فشار می‌برد (ویرایشگر «مقاله‌ای یافت نشد» نشان می‌داد).
// محتوا فقط در GET تک‌مقاله (/posts/[id]) بارگذاری می‌شود.
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const posts = await db.blogPost.findMany({
 orderBy: { updatedAt: "desc" },
 select: {
 id: true,
 slug: true,
 title: true,
 excerpt: true,
 coverImage: true,
 category: true,
 tags: true,
 status: true,
 publishedAt: true,
 readingTime: true,
 metaTitle: true,
 metaDescription: true,
 focusKeyword: true,
 ogImage: true,
 canonicalUrl: true,
 authorId: true,
 createdAt: true,
 updatedAt: true,
 // FIX(3-a): نوبت انتشار برای نمایش در ویرایشگر + لیست
 scheduledPublishAt: true,
 scheduleOrder: true,
 },
 });
 return NextResponse.json({ success: true, data: posts });
 } catch (error) {
 return NextResponse.json({ success: false, error: "خطا" }, { status: 500 });
 }
}

/** بعدین شمارهٔ ترتیب صف انتشار — برای نوبت جدید در انتهای صف */
async function nextScheduleOrder(): Promise<number> {
  try {
    const last = await db.blogPost.findFirst({
      where: { status: "DRAFT", scheduleOrder: { not: null } },
      orderBy: { scheduleOrder: "desc" },
      select: { scheduleOrder: true },
    });
    return (last?.scheduleOrder ?? 0) + 1;
  } catch {
    return 1;
  }
}

// POST /api/platform/cms/posts — ایجاد پست جدید
export async function POST(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const body = await req.json();
 const {
 slug,
 title,
 excerpt,
 content,
 coverImage,
 category,
 tags,
 status = "DRAFT",
 metaTitle,
 metaDescription,
 focusKeyword,
 ogImage,
 canonicalUrl,
 readingTime = 5,
 scheduledPublishAt,
 } = body;

 if (!slug ||!title ||!content) {
 return NextResponse.json(
 { success: false, error: "slug، عنوان و محتوا الزامی است" },
 { status: 400 }
 );
 }

 // FIX(3-a — ویرایشگر بلاگ): تاریخ انتشار آینده — فقط برای پیش‌نویس معنی دارد؛
 // اگر همین حالا منتشر می‌شود نوبت نمی‌خواهد.
 let parsedSchedule: Date | null = null;
 if (status!== "PUBLISHED" && scheduledPublishAt) {
 const d = new Date(scheduledPublishAt);
 if (!Number.isNaN(d.getTime())) parsedSchedule = d;
 }

 // بررسی یکتایی slug
 const existing = await db.blogPost.findUnique({ where: { slug } });
 if (existing) {
 return NextResponse.json(
 { success: false, error: "این slug قبلاً استفاده شده" },
 { status: 409 }
 );
 }

 const post = await db.blogPost.create({
 data: {
 slug,
 title,
 excerpt,
 content,
 coverImage,
 category: category || "ACCOUNTING",
 tags: tags? JSON.stringify(tags): null,
 status,
 publishedAt: status === "PUBLISHED"? new Date(): null,
 // نوبت انتشار (اگر پیش‌نویس زمان‌بندی‌شده است) — در انتهای صف با
 // scheduleOrder جدید می‌نشیند؛ اگر خالی بود، «بدون نوبت» می‌ماند و
 // «نوبت‌دهی خودکار» بعداً آن را صف می‌کند.
 scheduledPublishAt: parsedSchedule,
 scheduleOrder: parsedSchedule? await nextScheduleOrder(): null,
 metaTitle,
 metaDescription,
 focusKeyword,
 ogImage,
 canonicalUrl,
 readingTime,
 authorId: auth.admin.id,
 },
 });

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "CREATE_BLOG_POST",
 entity: "BlogPost",
 entityId: post.id,
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 });

 // کش لیست بلاگ و پست‌های تکی را باطل کن تا پست جدید فوراً دیده شود
 if (status === "PUBLISHED") {
 cacheDeleteByPrefix("blog:list:");
 cacheDeleteByPrefix("blog:post:");
 }

 return NextResponse.json({
 success: true,
 data: post,
 message: "پست ایجاد شد",
 });
 } catch (error) {
 console.error("Create post error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در ایجاد پست" },
 { status: 500 }
 );
 }
}
