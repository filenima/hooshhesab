import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/sessions
 *?active=true فقط نشست‌های فعال
 *?limit=100 حداکثر تعداد نشست (پیش‌فرض ۱۰۰، حداکثر ۵۰۰)
 *
 * لیست نشست‌های فعال کاربران در سراسر پلتفرم.
 */
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const limit = Math.min(Math.max(Number(searchParams.get("limit") || 100), 1), 500);
 const onlyActive = searchParams.get("active") === "true";

 const where: any = {};
 if (onlyActive) {
 where.isActive = true;
 where.expiresAt = { gt: new Date() };
 }

 // FIX(11-D): رکوردهای UserSessionِ یتیم (userId ارجاع به کاربرِ حذف‌شده) باعث
 // خطای Prisma «Field user is required, got null» و 500 شدن کل مسیر می‌شد.
 // رابطهٔ user با include واکشی نمی‌شود؛ کاربران جداگانه واکشی و با Map الحاق
 // می‌شوند تا نشست یتیم به‌جای خرابی مسیر، با user:null نمایش داده شود.
 const [sessions, total, activeCount] = await Promise.all([
 db.userSession.findMany({
 where,
 orderBy: { lastUsedAt: "desc" },
 take: limit,
 }),
 db.userSession.count({ where }),
 db.userSession.count({
 where: { isActive: true, expiresAt: { gt: new Date() } },
 }),
 ]);

 // واکشی امن کاربران مربوطه (بدون include اجباری)
 const userIds = [...new Set(sessions.map((s) => s.userId))];
 const users = userIds.length
 ? await db.user.findMany({
 where: { id: { in: userIds } },
 select: { id: true, username: true, email: true, tenantId: true },
 })
 : [];
 const userMap = new Map(users.map((u) => [u.id, u]));

 // FIX امنیتی: فیلد token (JWT زنده‌ی کاربر) هرگز در پاسخ برنمی‌گردد —
 // قبلاً کل رکورد نشست شامل توکن خام برگردانده می‌شد که در صورت لاگ/نشت XSS
 // امکان جعل هویت کامل داشت. فقط متادیتای لازم نگه داشته می‌شود.
 const safeSessions = sessions.map((s) => {
 const { token: _leakedToken, ...safe } = s;
 return { ...safe, user: userMap.get(s.userId) ?? null };
 });

 return NextResponse.json({
 success: true,
 data: safeSessions,
 total,
 activeCount,
 limit,
 });
 } catch (error) {
 console.error("platform/sessions error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت نشست‌ها" },
 { status: 500 }
 );
 }
}

/**
 * DELETE /api/platform/sessions
 * باطل‌کردن همه‌ی نشست‌های کاربران در سراسر پلتفرم (revoke_all_sessions).
 * نشست‌های فعال isActive=false می‌شوند و توکن‌ها بلافاصله بی‌اعتبار می‌گردند
 * (احراز هویت کاربران از همین جدول userSession انجام می‌شود).
 */
export async function DELETE(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 // ۱) باطل‌کردن همه‌ی نشست‌های فعال
 const revoked = await db.userSession.updateMany({
 where: { isActive: true },
 data: { isActive: false },
 });

 // ۲) حذف نشست‌های منقضی‌شده (پاک‌سازی جانبی)
 const purged = await db.userSession.deleteMany({
 where: { expiresAt: { lt: new Date() } },
 });

 await db.platformAuditLog.create({
 data: {
 superAdminId: auth.admin.id,
 action: "REVOKE_ALL_SESSIONS",
 entity: "UserSession",
 details: JSON.stringify({ revoked: revoked.count, purged: purged.count }),
 ipAddress: req.headers.get("x-forwarded-for") || null,
 },
 }).catch(() => {
 // ignore audit log failure
 });

 return NextResponse.json({
 success: true,
 data: {
 revoked: revoked.count,
 purged: purged.count,
 },
 message: `تمام ${revoked.count} نشست فعال باطل شد`,
 });
 } catch (error) {
 console.error("platform/sessions DELETE error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در باطل‌کردن نشست‌ها" },
 { status: 500 }
 );
 }
}
