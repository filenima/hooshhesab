import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// GET /api/dashboard/related-article?module=<id> — بلاگ‌لینک از
// داشبورد (نقشهٔ راه ۴-۵ سند پیشنهادها)
// ============================================================
// «کاربر تریال در داشبورد خود، مقالهٔ مرتبط با کارِ در حال انجامش
// را ببیند» — رفتار درون‌محصولی = engagement + سئو.
//
// انتخاب مقاله: دستهٔ مرتبط با ماژول فعال → فقط منتشرشده‌ها →
// انتخاب قطعی بر اساس روز (day-index % count) تا در طول روز ثابت
// باشد و بین رفرش‌ها «نپرد».
// ============================================================

/** نگاشت ماژول فعال → دسته‌های مرتبط بلاگ (به‌ترتیب اولویت) */
const MODULE_CATEGORY_MAP: Record<string, string[]> = {
	// فروش و فاکتور
	"invoices": ["MODIAN", "ACCOUNTING"],
	"quick-invoice": ["MODIAN", "ACCOUNTING"],
	"quick-invoice-list": ["MODIAN", "ACCOUNTING"],
	"pos": ["MODIAN", "ACCOUNTING"],
	"end-of-day": ["ACCOUNTING", "TUTORIAL"],
	"ecommerce": ["ACCOUNTING", "TUTORIAL"],
	// مالیات و مودیان
	"tax": ["TAX", "MODIAN"],
	"tax-filing": ["TAX", "MODIAN"],
	"modian": ["MODIAN", "TAX"],
	// انبار و کالا
	"inventory": ["ACCOUNTING", "TUTORIAL"],
	// خزانه و چک
	"treasury": ["ACCOUNTING", "TUTORIAL"],
	"bank-reconciliation": ["ACCOUNTING", "TUTORIAL"],
	"invoice-aging": ["ACCOUNTING", "MODIAN"],
	"financial-ratios": ["ACCOUNTING", "TUTORIAL"],
	// حقوق
	"payroll": ["PAYROLL", "ACCOUNTING"],
	"annual-bonus": ["PAYROLL", "ACCOUNTING"],
	"leave-management": ["PAYROLL", "ACCOUNTING"],
	// بقیه / پیش‌فرض
	"core": ["ACCOUNTING", "TUTORIAL"],
	"fiscal-year": ["ACCOUNTING", "TUTORIAL"],
	"fixed-assets": ["ACCOUNTING", "TUTORIAL"],
	"budget": ["ACCOUNTING", "TUTORIAL"],
	"expense-tracker": ["ACCOUNTING", "TUTORIAL"],
	"multi-currency": ["ACCOUNTING", "TUTORIAL"],
	"crm": ["TUTORIAL", "ACCOUNTING"],
	"dashboard": ["TUTORIAL", "ACCOUNTING"],
};

const FALLBACK_CATEGORIES = ["TUTORIAL", "ACCOUNTING", "MODIAN", "TAX", "PAYROLL"];

const MODULE_LABEL = "ماژول فعال";

export async function GET(req: NextRequest) {
	try {
		const auth = await getAuthContext(req);
		if (!auth) {
			return NextResponse.json(
				{ success: false, error: "احراز هویت الزامی است" },
				{ status: 401 }
			);
		}

		const moduleId =
			new URL(req.url).searchParams.get("module")?.toLowerCase()?.trim() || "dashboard";
		const categories =
			MODULE_CATEGORY_MAP[moduleId] ?? FALLBACK_CATEGORIES.slice(0, 2);

		// انتخاب قطعیِ روزانه: تا کاربر در طول روز یک مقالهٔ ثابت ببیند
		const dayIndex = Math.floor(Date.now() / 86_400_000);

		let post: {
			slug: string;
			title: string;
			excerpt: string | null;
			category: string;
			readingTime: number;
			publishedAt: Date;
		} | null = null;

		// به‌ترتیب اولویت دسته‌ها، اولین دسته‌ای که مقالهٔ منتشرشده دارد
		for (const cat of categories) {
			const posts = await db.blogPost.findMany({
				where: { status: "PUBLISHED", category: cat },
				select: {
					slug: true,
					title: true,
					excerpt: true,
					category: true,
					readingTime: true,
					publishedAt: true,
				},
				orderBy: { publishedAt: "desc" },
				take: 8,
			});
			if (posts.length > 0) {
				post = posts[dayIndex % posts.length];
				break;
			}
		}

		// fallback: هر مقالهٔ منتشرشده‌ای
		if (!post) {
			const posts = await db.blogPost.findMany({
				where: { status: "PUBLISHED" },
				select: {
					slug: true,
					title: true,
					excerpt: true,
					category: true,
					readingTime: true,
					publishedAt: true,
				},
				orderBy: { publishedAt: "desc" },
				take: 8,
			});
			if (posts.length > 0) post = posts[dayIndex % posts.length];
		}

		if (!post) {
			// بلاگ هنوز مقالهٔ منتشرشده ندارد → کارت نمایش داده نمی‌شود
			return NextResponse.json({ success: true, data: null });
		}

		return NextResponse.json({
			success: true,
			data: {
				slug: post.slug,
				title: post.title,
				excerpt: post.excerpt,
				category: post.category,
				readingTime: post.readingTime ?? 5,
				publishedAt: post.publishedAt,
				moduleId,
			},
		});
	} catch (error) {
		console.error("related-article error:", error);
		return NextResponse.json(
			{ success: false, error: "خطا در دریافت مقالهٔ مرتبط" },
			{ status: 500 }
		);
	}
}
