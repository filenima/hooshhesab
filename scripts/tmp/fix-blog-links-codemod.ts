// یک‌بار مصرف: اصلاح ماژول‌های a01-a11 —
// ۱) نگه‌داشتن حداکثر ۷ لینک داخلی inline (به‌علاوهٔ ۳ لینک related در اسکریپت اصلی = ۱۰)
// ۲) بازکردن (unwrap) لینک‌های اضافه به متن ساده — محتوا دست‌نخورده می‌ماند
// ۳) تعمیر لینک‌های غیر PUBLISHED: href تازه یا unwrap
import { readFileSync, writeFileSync } from "fs";
import { Database } from "bun:sqlite";

const db = new Database("db/custom.db", { readonly: true });
const published = new Set(
  (db.query("SELECT slug FROM BlogPost WHERE status='PUBLISHED'").all() as any[]).map((r) => r.slug)
);

const FILES = [
  "a01-fruit-shop", "a02-butcher-shop", "a03-fast-food", "a04-ice-cream-shop",
  "a05-nuts-shop", "a06-honey-beekeeping", "a07-car-wash", "a08-dry-cleaning",
  "a09-printing-shop", "a10-photo-studio", "a11-flower-shop",
];
const KEEP = 7;
// لینک‌های href غیرمنتشر → متن جایگزین href (سلبک منتشرشده) یا null یعنی unwrap
const REPLACE: Record<string, string | null> = {
  "customer-credit-scoring-guide": null,
  "accounting-software-security-checklist": null,
};

const base = "/home/z/work/src-v36/hooshhesab/scripts/new-blogs-content/";
for (const f of FILES) {
  const p = base + f + ".ts";
  let src = readFileSync(p, "utf8");
  // فرم source با quoteهای escape شده: <a href=\"/blog/xxx\">TEXT</a>
  const re = /<a href=\\"\/blog\/([a-z0-9-]+)\\">([^<]*)<\/a>/g;
  const matches = [...src.matchAll(re)];
  let kept = 0;
  let out = "";
  let last = 0;
  const removed: string[] = [];
  for (const m of matches) {
    const [full, slug, text] = [m[0], m[1], m[2] as unknown as string];
    const idx = m.index ?? 0;
    out += src.slice(last, idx);
    last = idx + full.length;
    let keep: boolean;
    if (!published.has(slug)) {
      if (REPLACE[slug] === undefined) {
        console.error(`${f}: لینک غیرمنتشر بدون سیاست: ${slug}`);
        keep = false;
      } else if (REPLACE[slug] === null) {
        keep = false; // unwrap
      } else {
        keep = kept < KEEP;
        if (keep) {
          out += `<a href=\\"/blog/${REPLACE[slug]}\\">${text}</a>`;
          kept++;
          continue;
        }
      }
    } else {
      keep = kept < KEEP;
    }
    if (keep) {
      out += full;
      kept++;
    } else {
      out += text; // unwrap → متن ساده
      removed.push(slug);
    }
  }
  out += src.slice(last);
  writeFileSync(p, out);
  console.log(`${f}: کل=${matches.length} نگه=${kept} unwrap=${removed.length}`);
}
console.log("done");
