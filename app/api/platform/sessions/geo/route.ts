import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
import { resolveIpGeo, enrichIpGeo, IRAN_CITY_COORDS } from "@/lib/ip-geo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ کش درون‌حافظه‌ای geo ============
// IP → مختصات حل‌شده (یا null). resolveIpGeo خودش کش دارد؛ این لایه فقط
// برای پخش‌کردن (jitter) قطعی روی دایره‌های هم‌شهر است.
const jitterCache = new Map<string, number>();
const JITTER_CACHE_MAX = 2000;

function simpleHash(s: string): number {
 let h = 2166136261;
 for (let i = 0; i < s.length; i++) {
 h ^= s.charCodeAt(i);
 h = Math.imul(h, 16777619);
 }
 return h >>> 0;
}

function jitterFor(ip: string): { dLat: number; dLng: number } {
 if (jitterCache.has(ip)) {
 const v = jitterCache.get(ip)!;
 return { dLat: (((v % 11) - 5) / 10) * 0.06, dLng: ((((v >> 5) % 11) - 5) / 10) * 0.06 };
 }
 const h = simpleHash(ip);
 if (jitterCache.size >= JITTER_CACHE_MAX) jitterCache.clear();
 jitterCache.set(ip, h);
 return { dLat: (((h % 11) - 5) / 10) * 0.06, dLng: ((((h >> 5) % 11) - 5) / 10) * 0.06 };
}

/**
 * GET /api/platform/sessions/geo
 * نقشهٔ geo-location نشست‌های کاربران — برای تب «کاربران آنلاین» پنل سوپرادمین.
 * ?limit=500 حداکثر نشست بررسی‌شده (پیش‌فرض ۵۰۰، حداکثر ۱۰۰۰)
 * ?active=true فقط نشست‌های فعال
 *
 * پاسخ: { points: [{ip, lat, lng, city, count, users, lastSeen}], unresolved, totalSessions, uniqueCities }
 */
export async function GET(req: NextRequest) {
 const auth = await requireSuperAdmin(req);
 if ("error" in auth) return auth.error;

 try {
 const { searchParams } = new URL(req.url);
 const limit = Math.min(Math.max(Number(searchParams.get("limit") || 500), 1), 1000);
 const onlyActive = searchParams.get("active") === "true";

 const where: { isActive?: boolean; expiresAt?: { gt: Date } } = {};
 if (onlyActive) {
 where.isActive = true;
 where.expiresAt = { gt: new Date() };
 }

 const sessions = await db.userSession.findMany({
 where,
 orderBy: { lastUsedAt: "desc" },
 take: limit,
 select: {
 ipAddress: true,
 lastUsedAt: true,
 createdAt: true,
 user: {
 select: { name: true, family: true, username: true, email: true },
 },
 },
 });

 // ============ گروه‌بندی بر اساس IP ============
 interface IpAgg {
 count: number;
 users: Set<string>;
 lastSeen: Date;
 }
 const byIp = new Map<string, IpAgg>();
 let unresolved = 0; // نشست‌های بدون موقعیت قابل‌نمایش روی نقشه
 let noIp = 0; // نشست‌های بدون IP ثبت‌شده

 for (const s of sessions) {
 const ip = s.ipAddress;
 if (!ip || ip === "unknown") {
 noIp++;
 unresolved++;
 continue;
 }
 let agg = byIp.get(ip);
 if (!agg) {
 agg = { count: 0, users: new Set<string>(), lastSeen: s.lastUsedAt };
 byIp.set(ip, agg);
 }
 agg.count++;
 const u = s.user;
 const displayName =
 [u?.name, u?.family].filter(Boolean).join(" ").trim() || u?.username || u?.email || "کاربر";
 agg.users.add(displayName);
 if (s.lastUsedAt > agg.lastSeen) agg.lastSeen = s.lastUsedAt;
 }

 // ============ حل‌کردن مختصات هر IP (با کش) ============
 const points: {
 ip: string;
 lat: number;
 lng: number;
 city: string;
 count: number;
 users: string[];
 lastSeen: string;
 }[] = [];

 const MAX_USERS_PER_POINT = 8;
 for (const [ip, agg] of byIp) {
 // v39: resolveIpGeo سه‌لایه (حافظه → دیتابیس → استاتیک) — سریع و درست؛
 // IPهای بدون مختصات در پس‌زمینه برای دفعهٔ بعد غنی‌سازی می‌شوند.
 const geo = await resolveIpGeo(ip, { online: false });
 let lat = geo.lat;
 let lng = geo.lng;
 let city = geo.city;
 if (lat === null || lng === null) {
 // مختصات استاتیک شهر (بلوک‌های شهر-مشخص) — در غیر این صورت enrich
 const coords = city ? IRAN_CITY_COORDS[city] : null;
 if (coords) {
 lat = coords.lat;
 lng = coords.lng;
 } else {
 enrichIpGeo(ip); // برای بار بعدی نقشه غنی می‌شود
 unresolved += agg.count;
 continue;
 }
 }
 if (!city) city = "نامشخص";
 const { dLat, dLng } = jitterFor(ip);
 points.push({
 ip,
 lat: Number((lat + dLat).toFixed(4)),
 lng: Number((lng + dLng).toFixed(4)),
 city,
 count: agg.count,
 users: Array.from(agg.users).slice(0, MAX_USERS_PER_POINT),
 lastSeen: agg.lastSeen.toISOString(),
 });
 }

 // مرتب‌سازی: بیشترین نشست اول
 points.sort((a, b) => b.count - a.count);

 const uniqueCities = new Set(points.map((p) => p.city)).size;
 const mappedSessions = points.reduce((sum, p) => sum + p.count, 0);

 return NextResponse.json({
 success: true,
 points,
 unresolved,
 totalSessions: sessions.length,
 mappedSessions,
 uniqueCities,
 noIp,
 limit,
 checkedAt: new Date().toISOString(),
 });
 } catch (error) {
 console.error("platform/sessions/geo error:", error);
 return NextResponse.json(
 { success: false, error: "خطا در دریافت نقشهٔ نشست‌ها" },
 { status: 500 }
 );
 }
}
