"use client";

// ════════════════════════════════════════════════════════════════
// نوار وضعیت زنده (R13-3) — خوشهٔ فشرده در هدر پنل سوپرادمین:
//  • نقطهٔ سلامت «سرور» → پایش client-side از /api/health (سبز/زرد/قرمز)
//  • ساعت تهران — هر ثانیه به‌روز می‌شود (Intl با timeZone Asia/Tehran)
//  • بج وضعیت دیتابیس + نسخهٔ سرویس (از همان پاسخ health؛ در موبایل مخفی)
// پنل با ssr:false لود می‌شود؛ بنابراین ساعت client-side بدون ناسازگاری hydration است.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import { cn } from "@/lib/utils";
import { toPersianDigits } from "@/lib/persian";

interface HealthShape {
	status?: string;
	version?: string;
	uptime?: number;
	services?: {
		database?: { status?: string };
	};
}

type ServerState = "loading" | "up" | "degraded" | "down";

const SERVER_STATE_META: Record<ServerState, { dot: string; label: string; text: string }> = {
	loading: { dot: "bg-muted-foreground/40", label: "در حال بررسی سرور", text: "text-muted-foreground" },
	up: { dot: "bg-success", label: "سرور سالم", text: "text-success" },
	degraded: { dot: "bg-warning", label: "سرور با هشدار", text: "text-warning" },
	down: { dot: "bg-destructive", label: "سرور در دسترس نیست", text: "text-destructive" },
};

/** ساعت زندهٔ تهران — با Intl و timeZone؛ ارقام فارسی */
function useTehranClock(): string {
	const [time, setTime] = React.useState<string>("");
	React.useEffect(() => {
		const fmt = new Intl.DateTimeFormat("fa-IR", {
			timeZone: "Asia/Tehran",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		});
		const tick = () => setTime(fmt.format(new Date()));
		tick();
		const id = window.setInterval(tick, 1000);
		return () => window.clearInterval(id);
	}, []);
	return time;
}

export function StatusStrip() {
	const [server, setServer] = React.useState<ServerState>("loading");
	const [health, setHealth] = React.useState<HealthShape | null>(null);
	const tehranTime = useTehranClock();

	// پایش /api/health — endpoint عمومی؛ هر ۶۰ ثانیه + هنگام بازگشت به تب
	React.useEffect(() => {
		let cancelled = false;
		const probe = async () => {
			try {
				const res = await fetch("/api/health", { signal: AbortSignal.timeout(6000) });
				const json = (await res.json().catch(() => null)) as HealthShape | null;
				if (cancelled) return;
				if (!res.ok || !json) {
					setServer("down");
					return;
				}
				setHealth(json);
				setServer(json.status === "healthy" ? "up" : "degraded");
			} catch {
				if (!cancelled) setServer("down");
			}
		};
		void probe();
		const id = window.setInterval(probe, 60_000);
		const onVisible = () => {
			if (document.visibilityState === "visible") void probe();
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			cancelled = true;
			window.clearInterval(id);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, []);

	const meta = SERVER_STATE_META[server];
	const dbUp = health?.services?.database?.status === "up";

	return (
		<div
			className="flex items-center gap-2.5 rounded-full border border-border bg-card/70 px-3 h-8 shrink-0"
			role="status"
			aria-label={`وضعیت سرور: ${meta.label}`}
			title={`${meta.label}${health?.version ? ` — نسخهٔ ${toPersianDigits(health.version)}` : ""}`}
		>
			{/* نقطهٔ سلامت سرور */}
			<span className="flex items-center gap-1.5">
				<span className={cn("h-2 w-2 rounded-full", meta.dot, server === "up" && "animate-pulse")} aria-hidden="true" />
				<span className={cn("hidden lg:inline text-[10px] font-bold", meta.text)}>سرور</span>
			</span>

			{/* ساعت تهران — هر ثانیه */}
			<span className="text-[11px] font-bold tnum tabular-nums text-foreground/90" dir="ltr" aria-label={`ساعت تهران: ${tehranTime}`}>
				{tehranTime}
			</span>

			{/* بج دیتابیس + نسخه — فقط دسکتاپ (در موبایل: فقط نقطه + ساعت) */}
			{(dbUp != null || health?.version) && (
				<span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] text-muted-foreground border-s border-border ps-2.5">
					{dbUp != null && (
						<span className={cn("font-bold", dbUp ? "text-success" : "text-destructive")}>
							{dbUp ? "دیتابیس سالم" : "دیتابیس قطع"}
						</span>
					)}
					{health?.version && <span className="tnum">نسخهٔ {toPersianDigits(health.version)}</span>}
				</span>
			)}
		</div>
	);
}
