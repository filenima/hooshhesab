"use client";

/**
 * ============ RelatedArticleCard — بلاگ‌لینک از داشبورد (v35.7) ============
 * -------------------------------------------------------------------------
 * پیاده‌سازی نقشهٔ راه ۴-۵ سند پیشنهادهای-ارتقا-v35.md:
 * «کاربر در داشبورد خود، مقالهٔ مرتبط با کارِ در حال انجامش را ببیند —
 * رفتار درون‌محصولی = engagement + سئو».
 *
 * مقاله از /api/dashboard/related-article?module=<فعلی> می‌آید —
 * انتخابِ روز-قطعی (در طول روز ثابت). با تغییر ماژول (رویداد
 * hoshhesab:module-changed) تازه می‌شود. بدون مقاله → کارت غیب.
 * =========================================================================
 */

import * as React from "react";
import { BookOpen, Clock, ExternalLink, Sparkles, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { authFetch } from "@/lib/auth-fetch";
import { toPersianDigits } from "@/lib/persian";

interface RelatedArticleData {
	slug: string;
	title: string;
	excerpt: string | null;
	category: string;
	readingTime: number;
	moduleId: string;
}

const CATEGORY_LABELS: Record<string, string> = {
	ACCOUNTING: "حسابداری",
	MODIAN: "سامانهٔ مودیان",
	TAX: "مالیات",
	PAYROLL: "حقوق و دستمزد",
	TUTORIAL: "آموزش",
	NEWS: "خبر",
	COMPARISON: "مقایسه",
};

export function RelatedArticleCard() {
	const [data, setData] = React.useState<RelatedArticleData | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [module, setModule] = React.useState<string>("dashboard");

	const load = React.useCallback(async (mod: string) => {
		try {
			const res = await authFetch(
				`/api/dashboard/related-article?module=${encodeURIComponent(mod)}`,
				{ cache: "no-store" }
			);
			if (!res.ok) return;
			const json = await res.json();
			if (json?.success) setData(json.data ?? null);
		} catch {
			/* کارت غیب می‌شود */
		}
	}, []);

	// واکشی اولیه + گوش‌دادن به تغییر ماژول فعال
	React.useEffect(() => {
		let cancelled = false;
		const detect = () => {
			try {
				const m = sessionStorage.getItem("hoshhesab_last_module");
				if (m && /^[a-z0-9-]{2,40}$/.test(m) && m !== module) {
					setModule(m);
				}
			} catch {
				/* ignore */
			}
		};
		detect();
		(async () => {
			const delays = [0, 4000];
			for (const d of delays) {
				if (d > 0) await new Promise((r) => setTimeout(r, d));
				if (cancelled) return;
				await load(module);
				if (cancelled) return;
				setLoading(false);
				// اگر داده آمد، توقف
				if (data) return;
			}
		})();
		const onModuleChange = () => {
			detect();
		};
		window.addEventListener("hoshhesab:module-changed", onModuleChange);
		return () => {
			cancelled = true;
			window.removeEventListener("hoshhesab:module-changed", onModuleChange);
		};
	}, [module]);

	// تازه‌سازی وقتی ماژول عوض شد
	React.useEffect(() => {
		if (module === "dashboard" && loading) return; // اولین بار را دوباره نگیرد
		void load(module);
	}, [module]);

	if (loading) return null; // سبک: بدون اسکلتون
	if (!data) return null; // مقاله‌ای نیست → کارت غیب

	const catLabel = CATEGORY_LABELS[data.category] ?? "مقاله";

	return (
		<Card className="group relative overflow-hidden border-border/60 bg-card/70 shadow-md shadow-black/5 transition-all hover:border-primary/30 hover:shadow-lg">
			{/* بافت نقطه‌ای */}
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
					backgroundSize: "16px 16px",
					color: "var(--primary)",
					opacity: 0.05,
					maskImage: "radial-gradient(ellipse 60% 80% at 90% 20%, black, transparent 75%)",
					WebkitMaskImage: "radial-gradient(ellipse 60% 80% at 90% 20%, black, transparent 75%)",
				}}
				aria-hidden="true"
			/>
			{/* نوار لهجه */}
			<div
				className="absolute inset-y-0 right-0 w-1 bg-gradient-to-b from-emerald-500 via-primary to-amber-500 opacity-70"
				aria-hidden="true"
			/>

			<a
				href={`/blog/${data.slug}`}
				target="_blank"
				rel="noopener noreferrer"
				className="relative flex items-center gap-4 p-4 sm:p-5"
				aria-label={`مقالهٔ مرتبط: ${data.title}`}
			>
				{/* آیکون */}
				<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-amber-500/10 text-primary transition-transform group-hover:scale-105">
					<BookOpen className="h-6 w-6" />
				</span>

				<span className="min-w-0 flex-1">
					<span className="flex flex-wrap items-center gap-2">
						<span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
							<Sparkles className="h-3 w-3" aria-hidden="true" />
							یادگیری حین کار
						</span>
						<span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
							{catLabel}
						</span>
					</span>
					<span className="mt-1.5 block truncate text-sm font-bold text-foreground transition-colors group-hover:text-primary">
						{data.title}
					</span>
					{data.excerpt && (
						<span className="mt-1 block truncate text-[11px] text-muted-foreground">
							{data.excerpt}
						</span>
					)}
					<span className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground/70">
						<Clock className="h-3 w-3" aria-hidden="true" />
						<span className="tabular-nums">
							{toPersianDigits(data.readingTime)} دقیقه مطالعه
						</span>
					</span>
				</span>

				{/* آیکون خروج */}
				<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/60 text-muted-foreground/60 transition-all group-hover:border-primary/40 group-hover:text-primary">
					<ExternalLink className="h-4 w-4" aria-hidden="true" />
				</span>
			</a>
		</Card>
	);
}
