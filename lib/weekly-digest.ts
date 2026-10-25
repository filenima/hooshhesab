/**
 * lib/weekly-digest.ts — گزارش هفتگی مدیر (نقشهٔ راه ۶-۱ سند پیشنهادها)
 * =====================================================================
 * «گزارش خودکار هفتگی واتساپ/تلگرام برای مدیر: خلاصهٔ سود/طلب/بدهی هر
 * جمعه — بدون باز کردن اپ».
 *
 * دو بخش دارد:
 *  ۱) buildWeeklyDigest(tenantId) — تجمیع واقعی رخدادهای ۷ روز اخیر:
 *     فروش/خرید/طلب باقی‌مانده/مشتری برتر/دقیقه صرفه‌جویی (هم‌راستا با
 *     منطق value-summary) + متن اشتراک‌گذاری فارسی + لینک‌های اشتراک
 *     واتساپ/تلگرام (wa.me / t.me — بدون نیاز به کلید بیرونی).
 *  ۲) sendWeeklyDigests() — کرون جمعه‌ها: برای هر تِنانتِ فعال با فعالیتِ
 *     این هفته یک اعلان درون‌برنامه‌ای می‌سازد (AuditLog marker یکتا در هر
 *     هفته → idempotent؛ فراخوانی مکرر بی‌خطر). کاربر از همان اعلان
 *     وارد اپ می‌شود و با یک کلیک گزارش را در واتساپ/تلگرام می‌فرستد.
 *
 * نکته: مبالغ فاکتور به «ریال» ذخیره می‌شوند → همه‌جا ÷۱۰ برای تومان.
 */

import { db } from "@/lib/db";
import { formatNumber } from "@/lib/persian";

export const DIGEST_MIN_ACTIVITY = 3; // حداقل رخداد هفته برای اعلان خودکار

export interface WeeklyDigest {
	weekStartISO: string;
	salesCount: number;
	salesTotalToman: number;
	purchaseCount: number;
	purchaseTotalToman: number;
	receivableToman: number; // طلبِ باقی‌مانده از فروش‌های ثبت‌شده (کل)
	payableToman: number; // بدهی به تأمین‌کنندگان (خریدهای تسویه‌نشده)
	topCustomer: { name: string; totalToman: number } | null;
	minutesSaved: number;
	shareText: string;
}

/** دقیقه صرفه‌جویی — همان نرخ‌های value-summary (سازگاری کامل) */
const MINUTES_PER = {
	invoice: 4,
	expense: 3,
	product: 2,
	party: 2,
	aiAction: 6,
	aiMessage: 1.5,
} as const;

function isoWeekKey(d: Date): string {
	const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
	const dayNum = date.getUTCDay() || 7;
	date.setUTCDate(date.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
	const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
	return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function toman(rial: bigint | number): number {
	return Math.round(Number(rial) / 10);
}

export async function buildWeeklyDigest(tenantId: string): Promise<WeeklyDigest> {
	const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

	const [
		salesAgg,
		purchaseAgg,
		receivableAgg,
		payableAgg,
		topSalesRows,
		weekInvoices,
		weekExpenses,
		weekProducts,
		weekParties,
		weekAiActions,
		weekAiMessages,
	] = await Promise.all([
		db.invoice.aggregate({
			where: { tenantId, type: "SALE", createdAt: { gte: weekAgo } },
			_sum: { total: true },
			_count: { _all: true },
		}),
		db.invoice.aggregate({
			where: { tenantId, type: "PURCHASE", createdAt: { gte: weekAgo } },
			_sum: { total: true },
			_count: { _all: true },
		}),
		// طلب از مشتریان: فروش‌های ثبت‌شدهٔ تسویه‌نشده (پرداخت < جمع)
		db.invoice.aggregate({
			where: {
				tenantId,
				type: "SALE",
				status: { in: ["SENT", "PAID", "OVERDUE"] },
			},
			_sum: { total: true, paidAmount: true },
		}),
		db.invoice.aggregate({
			where: {
				tenantId,
				type: "PURCHASE",
				status: { in: ["SENT", "PAID", "OVERDUE"] },
			},
			_sum: { total: true, paidAmount: true },
		}),
		// مشتری برتر این هفته
		db.invoice.groupBy({
			by: ["partyId"],
			where: { tenantId, type: "SALE", createdAt: { gte: weekAgo } },
			_sum: { total: true },
			orderBy: { _sum: { total: "desc" } },
			take: 1,
		}),
		db.invoice.count({
			where: { tenantId, type: { in: ["SALE", "PURCHASE"] }, createdAt: { gte: weekAgo } },
		}),
		db.expenseEntry.count({ where: { tenantId, createdAt: { gte: weekAgo } } }),
		db.product.count({ where: { tenantId, createdAt: { gte: weekAgo } } }),
		db.party.count({ where: { tenantId, createdAt: { gte: weekAgo } } }),
		db.auditLog.count({
			where: { tenantId, action: { startsWith: "AI_EXECUTE" }, createdAt: { gte: weekAgo } },
		}),
		db.aIMessage.count({
			where: { role: "USER", createdAt: { gte: weekAgo }, conversation: { tenantId } },
		}),
	]);

	let topCustomer: WeeklyDigest["topCustomer"] = null;
	if (topSalesRows.length > 0) {
		const party = await db.party.findUnique({
			where: { id: topSalesRows[0].partyId },
			select: { name: true },
		});
		if (party) {
			topCustomer = {
				name: party.name,
				totalToman: toman(topSalesRows[0]._sum.total ?? 0n),
			};
		}
	}

	const receivableToman = Math.max(
		0,
		toman(receivableAgg._sum.total ?? 0n) - toman(receivableAgg._sum.paidAmount ?? 0n)
	);
	const payableToman = Math.max(
		0,
		toman(payableAgg._sum.total ?? 0n) - toman(payableAgg._sum.paidAmount ?? 0n)
	);
	const minutesSaved = Math.round(
		weekInvoices * MINUTES_PER.invoice +
			weekExpenses * MINUTES_PER.expense +
			weekProducts * MINUTES_PER.product +
			weekParties * MINUTES_PER.party +
			weekAiActions * MINUTES_PER.aiAction +
			weekAiMessages * MINUTES_PER.aiMessage
	);

	const digest: WeeklyDigest = {
		weekStartISO: weekAgo.toISOString(),
		salesCount: salesAgg._count._all,
		salesTotalToman: toman(salesAgg._sum.total ?? 0n),
		purchaseCount: purchaseAgg._count._all,
		purchaseTotalToman: toman(purchaseAgg._sum.total ?? 0n),
		receivableToman,
		payableToman,
		topCustomer,
		minutesSaved,
		shareText: "",
	};

	digest.shareText = buildShareText(digest);
	return digest;
}

/** متن فارسیِ قابل اشتراک — همان متن برای واتساپ/تلگرام/کپی */
export function buildShareText(d: WeeklyDigest): string {
	const lines: string[] = [];
	lines.push("📊 گزارش هفتگی حسابداری — هوش حساب");
	if (d.salesCount > 0 || d.salesTotalToman > 0) {
		lines.push(
			`🧾 فروش این هفته: ${formatNumber(d.salesCount)} فاکتور — ${formatNumber(d.salesTotalToman)} تومان`
		);
	}
	if (d.purchaseCount > 0 || d.purchaseTotalToman > 0) {
		lines.push(
			`📦 خرید این هفته: ${formatNumber(d.purchaseCount)} فاکتور — ${formatNumber(d.purchaseTotalToman)} تومان`
		);
	}
	if (d.receivableToman > 0) {
		lines.push(`💰 طلبِ باقی‌مانده از مشتریان: ${formatNumber(d.receivableToman)} تومان`);
	}
	if (d.payableToman > 0) {
		lines.push(`📤 بدهی به تأمین‌کنندگان: ${formatNumber(d.payableToman)} تومان`);
	}
	if (d.topCustomer) {
		lines.push(`🏆 مشتری برتر هفته: ${d.topCustomer.name} (${formatNumber(d.topCustomer.totalToman)} تومان)`);
	}
	if (d.minutesSaved > 0) {
		const h = Math.floor(d.minutesSaved / 60);
		const m = d.minutesSaved % 60;
		lines.push(
			`⏱ صرفه‌جویی این هفته: ${h > 0 ? `${formatNumber(h)} ساعت و ` : ""}${formatNumber(m)} دقیقه کار حسابداری`
		);
	}
	if (lines.length <= 1) {
		lines.push("این هفته رخدادی ثبت نشده است.");
	}
	lines.push("— تولیدشده با هوش حساب");
	return lines.join("\n");
}

/** لینک اشتراک‌گذاری واتساپ (wa.me — وب یا اپ، بدون کلید) */
export function whatsappShareUrl(text: string): string {
	return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** لینک اشتراک‌گذاری تلگرام (t.me/share — وب یا اپ) */
export function telegramShareUrl(text: string, siteUrl = "https://hoosh.nobatime.ir"): string {
	return `https://t.me/share/url?url=${encodeURIComponent(siteUrl)}&text=${encodeURIComponent(text)}`;
}

// ============================================================
// کرون هفتگی — اعلان درون‌برنامه‌ای جمعه‌ها (idempotent با AuditLog)
// ============================================================

export interface WeeklyDigestCronResult {
	scanned: number;
	notifications: number;
	skipped: number;
	weekKey: string;
}

async function alreadySentThisWeek(userId: string, weekKey: string): Promise<boolean> {
	const found = await db.auditLog.findFirst({
		where: { entity: "weekly-digest", entityId: `weekly-digest:${userId}:${weekKey}` },
		select: { id: true },
	});
	return !!found;
}

/** فقط جمعه‌ها (به وقت تهران) اعلان می‌فرستد — با دستکاری تست‌پذیر */
export function isFridayTehran(now = new Date()): boolean {
	// UTC+3:30 — جمعه = day 5
	const tehran = new Date(now.getTime() + 3.5 * 60 * 60 * 1000);
	return tehran.getUTCDay() === 5;
}

export async function sendWeeklyDigests(force = false): Promise<WeeklyDigestCronResult> {
	const weekKey = isoWeekKey(new Date());
	const result: WeeklyDigestCronResult = {
		scanned: 0,
		notifications: 0,
		skipped: 0,
		weekKey,
	};

	// فقط جمعه‌ها اجرای واقعی (مگر force برای تست)
	if (!force && !isFridayTehran()) {
		return result;
	}

	const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

	// تِنانت‌های دارای فعالیت این هفته (فاکتور ثبت‌شده)
	const activeTenants = await db.invoice.groupBy({
		by: ["tenantId"],
		where: { createdAt: { gte: weekAgo }, type: { in: ["SALE", "PURCHASE"] } },
		_count: { _all: true },
	});

	for (const t of activeTenants) {
		if (t._count._all < DIGEST_MIN_ACTIVITY) continue;
		result.scanned++;

		// کاربر اصلی تِنانت (مالک)
		const owner = await db.user.findFirst({
			where: { tenantId: t.tenantId, deletedAt: null },
			orderBy: { createdAt: "asc" },
			select: { id: true, name: true },
		});
		if (!owner) continue;

		if (await alreadySentThisWeek(owner.id, weekKey)) {
			result.skipped++;
			continue;
		}

		const digest = await buildWeeklyDigest(t.tenantId);
		const title = "گزارش هفتگی شما آماده است 📊";
		const message = `فروش این هفته: ${formatNumber(digest.salesCount)} فاکتور (${formatNumber(digest.salesTotalToman)} تومان) — گزارش کامل را ببینید و با یک کلیک در واتساپ/تلگرام برای هم‌تیمی بفرستید.`;

		try {
			await db.notification.create({
				data: {
					tenantId: t.tenantId,
					userId: owner.id,
					title,
					message,
					type: "INFO",
					link: "/?view=app",
				},
			});
			result.notifications++;
		} catch {
			/* ادامه */
		}

		try {
			await db.auditLog.create({
				data: {
					tenantId: t.tenantId,
					userId: owner.id,
					action: "WEEKLY_DIGEST_SENT",
					entity: "weekly-digest",
					entityId: `weekly-digest:${owner.id}:${weekKey}`,
					changes: JSON.stringify({ weekKey, salesCount: digest.salesCount }),
				},
			});
		} catch {
			/* نباید جریان را متوقف کند */
		}
	}

	return result;
}
