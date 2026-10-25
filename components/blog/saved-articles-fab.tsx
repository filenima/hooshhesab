"use client";

/**
 * ============ SavedArticlesFab — فهرست «ذخیره‌شده‌ها» (v35.6) ============
 * ----------------------------------------------------------------------
 * مکمل دکمهٔ «ذخیره برای بعد» در مقاله (نقشهٔ راه ۳-۳): فهرست مقالات
 * ذخیره‌شدهٔ کاربر (localStorage — آفلاین) به‌صورت دکمهٔ شناور در بلاگ.
 * با صفر بودن ذخیره‌ها کاملاً مخفی است؛ حذف تک‌به‌تک + لینک مستقیم.
 * ======================================================================
 */

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Bookmark, X, Trash2, BookOpen } from "lucide-react";

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

function faTimeAgo(at: number): string {
        const days = Math.floor((Date.now() - at) / 86400000);
        if (days <= 0) return "امروز";
        if (days === 1) return "دیروز";
        if (days < 30) return `${toFa(days)} روز پیش`;
        return `${toFa(Math.floor(days / 30))} ماه پیش`;
}

function toFa(n: number): string {
        return n.toString().replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

export function SavedArticlesFab() {
        const reduceMotion = useReducedMotion();
        const [items, setItems] = React.useState<SavedItem[]>([]);
        const [open, setOpen] = React.useState(false);

        // همگام‌سازی با localStorage (از جمله تغییر از تب دیگر/مقاله)
        React.useEffect(() => {
                const sync = () => setItems(readSaved());
                sync();
                const t = window.setInterval(sync, 4000);
                window.addEventListener("storage", sync);
                window.addEventListener("focus", sync);
                return () => {
                        window.clearInterval(t);
                        window.removeEventListener("storage", sync);
                        window.removeEventListener("focus", sync);
                };
        }, []);

        const remove = (slug: string) => {
                const next = readSaved().filter((x) => x.slug !== slug);
                localStorage.setItem(SAVED_KEY, JSON.stringify(next));
                setItems(next);
        };

        if (items.length === 0) return null;

        return (
                <>
                        {/* پنل فهرست */}
                        <AnimatePresence>
                                {open && (
                                        <>
                                                <motion.div
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        className="fixed inset-0 z-[70] bg-black/25"
                                                        onClick={() => setOpen(false)}
                                                        aria-hidden="true"
                                                />
                                                <motion.aside
                                                        initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.96 }}
                                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
                                                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                                        className="fixed bottom-20 left-4 z-[75] w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl shadow-black/20"
                                                        role="dialog"
                                                        aria-label="مقالات ذخیره‌شده"
                                                >
                                                        <div className="flex items-center justify-between border-b border-border/50 bg-gradient-to-l from-primary/[0.06] to-transparent px-4 py-3">
                                                                <div className="flex items-center gap-2">
                                                                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
                                                                                <Bookmark className="h-3.5 w-3.5" />
                                                                        </span>
                                                                        <h3 className="text-sm font-bold text-foreground">
                                                                                ذخیره‌شده‌ها
                                                                                <span className="mr-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary tabular-nums">
                                                                                        {toFa(items.length)}
                                                                                </span>
                                                                        </h3>
                                                                </div>
                                                                <button
                                                                        type="button"
                                                                        onClick={() => setOpen(false)}
                                                                        aria-label="بستن"
                                                                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:text-foreground"
                                                                >
                                                                        <X className="h-3.5 w-3.5" />
                                                                </button>
                                                        </div>
                                                        <ul className="max-h-72 overflow-y-auto p-2">
                                                                {items.map((it) => (
                                                                        <li
                                                                                key={it.slug}
                                                                                className="group flex items-center gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-muted/50"
                                                                        >
                                                                                <a
                                                                                        href={`/blog/${it.slug}`}
                                                                                        className="min-w-0 flex-1"
                                                                                        onClick={() => setOpen(false)}
                                                                                >
                                                                                        <p className="truncate text-xs font-medium leading-5 text-foreground group-hover:text-primary">
                                                                                                {it.title}
                                                                                        </p>
                                                                                        <p className="text-[10px] text-muted-foreground">{faTimeAgo(it.at)} ذخیره شد</p>
                                                                                </a>
                                                                                <button
                                                                                        type="button"
                                                                                        onClick={() => remove(it.slug)}
                                                                                        aria-label={`حذف «${it.title}» از ذخیره‌شده‌ها`}
                                                                                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                                                                                >
                                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                                </button>
                                                                        </li>
                                                                ))}
                                                        </ul>
                                                        <div className="border-t border-border/50 px-4 py-2.5 text-[10px] text-muted-foreground/70">
                                                                ذخیره‌سازی محلی مرورگر — بدون حساب کاربری هم کار می‌کند
                                                        </div>
                                                </motion.aside>
                                        </>
                                )}
                        </AnimatePresence>

                        {/* دکمهٔ شناور */}
                        <motion.button
                                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.6, duration: 0.35 }}
                                type="button"
                                onClick={() => setOpen((o) => !o)}
                                aria-expanded={open}
                                aria-label={`مقالات ذخیره‌شده (${items.length} مورد)`}
                                className="fixed bottom-4 left-4 z-[65] flex h-12 items-center gap-2 rounded-2xl border border-border/60 bg-card/95 px-4 shadow-xl shadow-black/15 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-2xl"
                        >
                                <span className="relative flex h-5 w-5 items-center justify-center text-primary">
                                        <BookOpen className="h-5 w-5" />
                                        <span className="absolute -top-1.5 -left-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground tabular-nums">
                                                {toFa(items.length)}
                                        </span>
                                </span>
                                <span className="text-xs font-bold text-foreground">ذخیره‌شده‌های من</span>
                        </motion.button>
                </>
        );
}
