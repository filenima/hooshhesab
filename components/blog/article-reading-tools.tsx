"use client";

/**
 * ============ ArticleReadingTools — ابزار مطالعهٔ مقاله (v35.6) ============
 * ----------------------------------------------------------------------
 * پیاده‌سازی نقشهٔ راه ۳-۳ سند پیشنهادهای-ارتقا-v35.md:
 * «نوار پیشرفت مطالعه + دکمهٔ ذخیره برای بعد (localStorage)»
 *
 * ۱) نوار پیشرفت مطالعه — بالای صفحه، گرادیان سبز→کهربایی، RTL (از راست پر
 *    می‌شود)، rAF-throttled، aria-hidden (صرفاً تزئینی-اطلاعاتی)
 * ۲) دکمهٔ «ذخیره برای بعد» — localStorage (آفلاین)، انیمیشن pop هنگام ذخیره
 * ۳) چیپ وضعیت مطالعه — پایین-چپ شناور: درصد خوانده‌شده + تخمین دقیقهٔ
 *    باقی‌مانده؛ در ۱۰۰٪ محو می‌شود
 * ======================================================================
 */

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Bookmark, BookmarkCheck, Check } from "lucide-react";

const SAVED_KEY = "hoshhesab:saved-articles";

interface SavedItem {
	slug: string;
	title: string;
	at: number;
}

function readSaved(): SavedItem[] {
	try {
		const raw = localStorage.getItem(SAVED_KEY);
		if (!raw) return [];
		const arr = JSON.parse(raw);
		if (!Array.isArray(arr)) return [];
		return arr.filter(
			(x) => x && typeof x.slug === "string" && typeof x.title === "string"
		);
	} catch {
		return [];
	}
}

function writeSaved(items: SavedItem[]) {
	try {
		localStorage.setItem(SAVED_KEY, JSON.stringify(items.slice(0, 200)));
	} catch {
		/* localStorage پر/مسدود — بی‌صدا */
	}
}

export function ArticleReadingTools({
	slug,
	title,
	readingMinutes,
}: {
	slug: string;
	title: string;
	readingMinutes: number;
}) {
	const reduceMotion = useReducedMotion();
	const [progress, setProgress] = React.useState(0);
	const [saved, setSaved] = React.useState(false);
	const [justSaved, setJustSaved] = React.useState(false);

	// وضعیت ذخیره اولیه
	React.useEffect(() => {
		setSaved(readSaved().some((x) => x.slug === slug));
	}, [slug]);

	// نوار پیشرفت — scroll → درصد (rAF-throttled)
	React.useEffect(() => {
		let raf = 0;
		const onScroll = () => {
			if (raf) return;
			raf = requestAnimationFrame(() => {
				raf = 0;
				const doc = document.documentElement;
				const max = doc.scrollHeight - window.innerHeight;
				const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
				setProgress(p);
			});
		};
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", onScroll);
		return () => {
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", onScroll);
			if (raf) cancelAnimationFrame(raf);
		};
	}, []);

	const toggleSave = () => {
		const items = readSaved();
		if (saved) {
			writeSaved(items.filter((x) => x.slug !== slug));
			setSaved(false);
		} else {
			writeSaved([
				{ slug, title, at: Date.now() },
				...items.filter((x) => x.slug !== slug),
			]);
			setSaved(true);
			setJustSaved(true);
			window.setTimeout(() => setJustSaved(false), 2200);
		}
	};

	const pct = Math.round(progress * 100);
	const remainMin = Math.max(1, Math.ceil(readingMinutes * (1 - progress)));
	const showStatusPill = progress > 0.04 && progress < 0.985;

	return (
		<>
			{/* ۱) نوار پیشرفت مطالعه — RTL: از راست پر می‌شود */}
			<div
				aria-hidden="true"
				className="fixed inset-x-0 top-0 z-[60] h-1 bg-border/40"
			>
				<div
					className="h-full origin-right bg-gradient-to-l from-emerald-500 via-primary to-amber-500 shadow-[0_0_8px_rgba(16,185,129,0.55)]"
					style={{
						transform: `scaleX(${progress})`,
						transition: reduceMotion ? "none" : "transform 120ms linear",
					}}
				/>
			</div>

			{/* ۲) دکمهٔ ذخیره برای بعد */}
			<div className="flex items-center gap-3">
				<button
					type="button"
					onClick={toggleSave}
					aria-pressed={saved}
					className={`group inline-flex h-9 items-center gap-2 rounded-full border px-4 text-xs font-bold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
						saved
							? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
							: "border-border/60 bg-background/60 text-muted-foreground hover:border-primary/40 hover:text-primary"
					}`}
				>
					<span className="relative">
						{saved ? (
							<BookmarkCheck className="h-4 w-4" />
						) : (
							<Bookmark className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
						)}
						{/* پاپ تأیید */}
						<AnimatePresence>
							{justSaved && (
								<motion.span
									initial={reduceMotion ? false : { scale: 0.4, opacity: 0, y: 6 }}
									animate={{ scale: 1, opacity: 1, y: 0 }}
									exit={{ opacity: 0, scale: 0.8 }}
									transition={{ type: "spring", stiffness: 500, damping: 22 }}
									className="absolute -top-1 -left-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md"
								>
									<Check className="h-2.5 w-2.5" strokeWidth={3.5} />
								</motion.span>
							)}
						</AnimatePresence>
					</span>
					{saved ? "ذخیره شد" : "ذخیره برای بعد"}
				</button>
				<span className="text-[11px] text-muted-foreground/70">
					{saved ? "در فهرست مطالعهٔ شما" : "آفلاین ذخیره می‌شود"}
				</span>
			</div>

			{/* ۳) چیپ وضعیت مطالعه — شناور پایین-چپ */}
			<AnimatePresence>
				{showStatusPill && (
					<motion.div
						initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.9 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.9 }}
						transition={{ duration: 0.3, ease: "easeOut" }}
						className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 rounded-full border border-border/60 bg-card/90 px-4 py-2.5 shadow-xl shadow-black/10 backdrop-blur-md"
						aria-live="polite"
					>
						{/* حلقهٔ کوچک پیشرفت */}
						<span className="relative inline-flex h-7 w-7 items-center justify-center">
							<svg viewBox="0 0 36 36" className="h-7 w-7 -rotate-90">
								<circle
									cx="18" cy="18" r="15.5" fill="none"
									stroke="currentColor" strokeWidth="3.5"
									className="text-border"
								/>
								<circle
									cx="18" cy="18" r="15.5" fill="none"
									stroke="url(#readGrad)" strokeWidth="3.5"
									strokeLinecap="round"
									strokeDasharray={`${(progress * 97.4).toFixed(1)} 97.4`}
								/>
								<defs>
									<linearGradient id="readGrad" x1="0" y1="0" x2="1" y2="1">
										<stop offset="0%" stopColor="#10b981" />
										<stop offset="100%" stopColor="#f59e0b" />
									</linearGradient>
								</defs>
							</svg>
							<span className="absolute text-[8px] font-bold tabular-nums text-foreground">
								{toFa(pct)}
							</span>
						</span>
						<span className="flex flex-col leading-tight">
							<span className="text-[11px] font-bold text-foreground">
								{toFa(pct)}٪ خوانده‌شده
							</span>
							<span className="text-[9px] text-muted-foreground tabular-nums">
								حدود {toFa(remainMin)} دقیقه دیگر
							</span>
						</span>
					</motion.div>
				)}
			</AnimatePresence>
		</>
	);
}

function toFa(n: number): string {
	return n
		.toString()
		.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}
