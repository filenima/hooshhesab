import { NextRequest, NextResponse } from "next/server";
import { sendWeeklyDigests } from "@/lib/weekly-digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET|POST /api/cron/weekly-digest — گزارش هفتگی مدیر (نقشهٔ راه ۶-۱).
 *
 * هر جمعه (به وقت تهران) برای تِنانت‌های فعال یک اعلان درون‌برنامه‌ای
 * «گزارش هفتگی شما آماده است» می‌سازد — کاربر وارد اپ می‌شود و گزارش
 * را با دکمهٔ واتساپ/تلگرام به اشتراک می‌گذارد.
 *
 * الگوی امنیتی مثل trial-reminders: هدر CRON_SECRET (اگر تنظیم شده) +
 * ضدتکرار با AuditLog marker یکتا در هر هفته (idempotent).
 * پارامتر ?force=1 فقط برای تست (از گارد جمعه رد می‌شود).
 */
async function handle(req: NextRequest) {
	try {
		const secret = process.env.CRON_SECRET;
		if (secret) {
			const provided =
				req.headers.get("x-cron-secret") ||
				new URL(req.url).searchParams.get("secret");
			if (provided !== secret) {
				return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
			}
		}
		const force = new URL(req.url).searchParams.get("force") === "1";
		const result = await sendWeeklyDigests(force);
		return NextResponse.json({
			success: true,
			...result,
			at: new Date().toISOString(),
		});
	} catch (error) {
		console.error("weekly-digest cron error:", error);
		return NextResponse.json(
			{ success: false, error: "خطا در اجرای گزارش هفتگی" },
			{ status: 500 }
		);
	}
}

export const GET = handle;
export const POST = handle;
