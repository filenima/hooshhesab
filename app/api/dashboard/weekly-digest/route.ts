import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import {
	buildWeeklyDigest,
	whatsappShareUrl,
	telegramShareUrl,
} from "@/lib/weekly-digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// GET /api/dashboard/weekly-digest — گزارش هفتگی مدیر (۶-۱)
// ============================================================
// خروجی: تجمیع واقعی ۷ روز اخیر (فروش/خرید/طلب/بدهی/مشتری برتر/
// دقیقه صرفه‌جویی) + متن اشتراک فارسی + لینک‌های آمادهٔ wa.me و
// t.me — کاربر با یک کلیک گزارش را برای خودش/هم‌تیمی می‌فرستد.
// هیچ کلید بیرونی لازم نیست (deep-link رسمی واتساپ/تلگرام).
export async function GET(req: NextRequest) {
	try {
		const auth = await getAuthContext(req);
		if (!auth) {
			return NextResponse.json(
				{ success: false, error: "احراز هویت الزامی است" },
				{ status: 401 }
			);
		}
		const digest = await buildWeeklyDigest(auth.tenantId);
		return NextResponse.json({
			success: true,
			data: {
				...digest,
				whatsappUrl: whatsappShareUrl(digest.shareText),
				telegramUrl: telegramShareUrl(digest.shareText),
			},
		});
	} catch (error) {
		console.error("weekly-digest error:", error);
		return NextResponse.json(
			{ success: false, error: "خطا در دریافت گزارش هفتگی" },
			{ status: 500 }
		);
	}
}
