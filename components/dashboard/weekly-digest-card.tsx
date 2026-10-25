"use client";

/**
 * ============ WeeklyDigestCard — «گزارش هفتگی مدیر» (v35.5) ============
 * -----------------------------------------------------------------------
 * پیاده‌سازی نقشهٔ راه ۶-۱ سند پیشنهادهای-ارتقا-v35.md:
 * «گزارش خودکار هفتگی واتساپ/تلگرام برای مدیر: خلاصهٔ سود/طلب/بدهی
 * بدون باز کردن اپ — وابستگی‌سازی».
 *
 * خلاصهٔ این هفته (فروش/خرید/طلب/بدهی/مشتری برتر/صرفه‌جویی) +
 * دکمه‌های اشتراک: واتساپ (wa.me) و تلگرام (t.me) — deep-link رسمی،
 * بدون کلید بیرونی — + کپی متن + پیش‌نمایش متن کامل.
 *
 * داده از /api/dashboard/weekly-digest (شمارش واقعی رخدادهای DB).
 * تازه‌سازی روی رخدادهای موتاسیون — الگوی weekly-value-banner.
 * =======================================================================
 */

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
	BarChart3,
	Send,
	Copy,
	Check,
	Users,
	Wallet,
	ArrowDownUp,
	Trophy,
	Clock,
	Loader2,
	Share2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { authFetch } from "@/lib/auth-fetch";
import { toPersianDigits, formatNumber } from "@/lib/persian";

interface DigestData {
	salesCount: number;
	salesTotalToman: number;
	purchaseCount: number;
	purchaseTotalToman: number;
	receivableToman: number;
	payableToman: number;
	topCustomer: { name: string; totalToman: number } | null;
	minutesSaved: number;
	shareText: string;
	whatsappUrl: string;
	telegramUrl: string;
}

const WA_GREEN = "#25D366";
const TG_BLUE = "#229ED9";

export function WeeklyDigestCard() {
	const [data, setData] = React.useState<DigestData | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [copied, setCopied] = React.useState(false);
	const [showText, setShowText] = React.useState(false);
	const reduceMotion = useReducedMotion();

	const load = React.useCallback(async () => {
		try {
			const res = await authFetch("/api/dashboard/weekly-digest", { cache: "no-store" });
			if (!res.ok) return;
			const json = await res.json();
			if (json?.success && json?.data) setData(json.data);
		} catch {
			/* retry در افکت */
		}
	}, []);

	// واکشی با سه تلاش (۰/۳/۸ ثانیه — الگوی مقاوم پروژه)
	React.useEffect(() => {
		let cancelled = false;
		(async () => {
			const delays = [0, 3_000, 8_000];
			for (let attempt = 0; attempt < delays.length; attempt++) {
				if (delays[attempt] > 0) await new Promise((r) => setTimeout(r, delays[attempt]));
				if (cancelled) return;
				try {
					const res = await authFetch("/api/dashboard/weekly-digest", { cache: "no-store" });
					if (!res.ok) continue;
					const json = await res.json();
					if (json?.success && json?.data) {
						if (!cancelled) setData(json.data);
						break;
					}
				} catch {
					/* تلاش بعدی */
				}
			}
			if (!cancelled) setLoading(false);
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	// تازه‌سازی روی رخدادهای موتاسیون
	React.useEffect(() => {
		const events = [
			"hoshhesab:invoices-changed",
			"hoshhesab:parties-changed",
			"hoshhesab:products-changed",
			"hoshhesab:expenses-changed",
		];
		events.forEach((e) => window.addEventListener(e, load));
		return () => events.forEach((e) => window.removeEventListener(e, load));
	}, [load]);

	const onCopy = async () => {
		if (!data) return;
		try {
			await navigator.clipboard.writeText(data.shareText);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2000);
		} catch {
			/* clipboard مسدود است */
		}
	};

	if (loading) {
		return (
			<Card className="relative overflow-hidden border-border/60 bg-card/60 p-5">
				<div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
					<Loader2 className="h-4 w-4 animate-spin" />
					در حال آماده‌سازی گزارش هفتگی…
				</div>
			</Card>
		);
	}

	if (!data) return null; // API در دسترس نیست → کارت غیب می‌شود (گرسنگی UI نه)

	const hasActivity =
		data.salesCount > 0 || data.purchaseCount > 0 || data.minutesSaved > 0;
	if (!hasActivity) return null; // هفتهٔ بدون رخداد → نمایش نداریم

	const stats: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }[] = [
		{
			icon: ArrowDownUp,
			label: `فروش این هفته (${toPersianDigits(data.salesCount)} فاکتور)`,
			value: `${formatNumber(data.salesTotalToman)} تومان`,
		},
	];
	if (data.purchaseCount > 0) {
		stats.push({
			icon: Wallet,
			label: `خرید (${toPersianDigits(data.purchaseCount)} فاکتور)`,
			value: `${formatNumber(data.purchaseTotalToman)} تومان`,
		});
	}
	if (data.receivableToman > 0) {
		stats.push({ icon: Users, label: "طلبِ باقی‌مانده", value: `${formatNumber(data.receivableToman)} تومان` });
	}
	if (data.topCustomer) {
		stats.push({ icon: Trophy, label: `مشتری برتر: ${data.topCustomer.name}`, value: `${formatNumber(data.topCustomer.totalToman)} تومان` });
	}
	if (data.minutesSaved >= 60) {
		const h = Math.floor(data.minutesSaved / 60);
		const m = data.minutesSaved % 60;
		stats.push({
			icon: Clock,
			label: "صرفه‌جویی این هفته",
			value: `${toPersianDigits(h)} ساعت${m > 0 ? ` و ${toPersianDigits(m)} دقیقه` : ""}`,
		});
	}

	return (
		<motion.div
			initial={reduceMotion ? false : { opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4, ease: "easeOut" }}
		>
			<Card className="relative overflow-hidden border-border/60 bg-card/70 shadow-lg shadow-black/5">
				{/* بافت نقطه‌ای mask شده — امضای بصری v35 */}
				<div
					className="pointer-events-none absolute inset-0 opacity-[0.35]"
					style={{
						backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
						backgroundSize: "18px 18px",
						color: "var(--primary)",
						opacity: 0.06,
						maskImage: "radial-gradient(ellipse 70% 60% at 85% 10%, black, transparent 70%)",
						WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 85% 10%, black, transparent 70%)",
					}}
					aria-hidden="true"
				/>

				{/* هدر */}
				<div className="relative flex items-center justify-between gap-3 border-b border-border/50 bg-gradient-to-l from-primary/[0.05] to-transparent px-5 py-4">
					<div className="flex items-center gap-2.5">
						<span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
							<BarChart3 className="h-4.5 w-4.5" />
						</span>
						<div>
							<h3 className="text-sm font-bold text-foreground">گزارش هفتگی شما</h3>
							<p className="text-[11px] text-muted-foreground">
								خلاصهٔ فروش، طلب و بدهی — آمادهٔ اشتراک با تیم
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={() => setShowText((s) => !s)}
						className="hidden sm:inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
					>
						<Share2 className="h-3 w-3" />
						{showText ? "بستن متن" : "متن گزارش"}
					</button>
				</div>

				{/* آمار */}
				<div className="relative grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-5">
					{stats.map((s) => (
						<div
							key={s.label}
							className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/50 px-3.5 py-3 transition-colors hover:border-primary/30"
						>
							<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
								<s.icon className="h-4 w-4" />
							</span>
							<div className="min-w-0">
								<p className="truncate text-[11px] text-muted-foreground">{s.label}</p>
								<p className="truncate text-sm font-bold text-foreground tabular-nums">{s.value}</p>
							</div>
						</div>
					))}
				</div>

				{/* متن کامل (قابل باز/بسته) */}
				{showText && (
					<div className="relative mx-5 mb-4 rounded-xl border border-border/50 bg-muted/40 p-3.5">
						<pre className="whitespace-pre-wrap font-sans text-[11px] leading-6 text-foreground/80">
							{data.shareText}
						</pre>
					</div>
				)}

				{/* دکمه‌های اشتراک */}
				<div className="relative flex flex-wrap items-center gap-2 border-t border-border/50 px-5 py-4">
					<span className="text-[11px] font-medium text-muted-foreground ml-1">
						ارسال به:
					</span>
					<a
						href={data.whatsappUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
						style={{ backgroundColor: WA_GREEN, boxShadow: `0 4px 14px ${WA_GREEN}55` }}
						aria-label="اشتراک گزارش در واتساپ"
					>
						<svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
							<path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.9-4.44 9.9-9.9S17.5 2 12.04 2Zm0 18.02c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.81.83-3.04-.2-.31a8.1 8.1 0 0 1-1.24-4.31c0-4.48 3.65-8.13 8.13-8.13 4.48 0 8.13 3.65 8.13 8.13s-3.65 8.13-8.13 8.13Zm4.47-6.09c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.17.24-.64.8-.78.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.24-.02-.38.11-.5.11-.11.29-.29.43-.43.14-.14.19-.24.29-.4.09-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.24-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.6.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.28Z" />
						</svg>
						واتساپ
					</a>
					<a
						href={data.telegramUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
						style={{ backgroundColor: TG_BLUE, boxShadow: `0 4px 14px ${TG_BLUE}55` }}
						aria-label="اشتراک گزارش در تلگرام"
					>
						<svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
							<path d="M21.94 4.6 19.02 19.2c-.22 1.07-.8 1.34-1.62.84l-4.47-3.3-2.16 2.08c-.24.24-.44.44-.9.44l.32-4.53 8.28-7.48c.36-.32-.08-.5-.56-.18L7.68 13.14l-4.4-1.37c-.96-.3-.97-.96.2-1.42l17.2-6.63c.8-.29 1.5.19 1.26 1.5Z" />
						</svg>
						تلگرام
					</a>
					<button
						type="button"
						onClick={onCopy}
						className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border/60 px-3.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
						aria-label="کپی متن گزارش"
					>
						{copied ? (
							<>
								<Check className="h-3.5 w-3.5 text-emerald-600" />
								کپی شد
							</>
						) : (
							<>
								<Copy className="h-3.5 w-3.5" />
								کپی متن
							</>
						)}
					</button>
					<span className="mr-auto hidden md:flex items-center gap-1 text-[10px] text-muted-foreground/70">
						<Send className="h-3 w-3" />
						هر جمعه هم به‌صورت اعلان یادآوری می‌شود
					</span>
				</div>
			</Card>
		</motion.div>
	);
}
