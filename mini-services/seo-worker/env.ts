// env.ts — بارگذاری .env ریشهٔ پروژه قبل از هر ماژول دیگری
// WHY: PrismaClient (از طریق @/lib/db) به DATABASE_URL نیاز دارد؛
// این فایل باید «اولین» import باشد تا متغیرها قبل از ساخت کلاینت ست شوند.
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";

function findRootEnv(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

try {
  const envPath = findRootEnv(import.meta.dir);
  if (envPath) {
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let value = m[2];
      // حذف کوتیشن‌ها
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env) || !process.env[key]) {
        process.env[key] = value;
      }
    }
    console.log(`[seo-worker] env loaded from ${envPath}`);
  } else {
    console.warn("[seo-worker] root .env not found — relying on existing env");
  }
} catch (err) {
  console.warn("[seo-worker] env load failed:", err);
}

// 🔒 FIX (v36): DATABASE_URL همیشه به دیتابیس همین پروژه فورس می‌شود.
// WHY: در برخی محیط‌ها (سندباکس/سرور) متغیر DATABASE_URL از بیرون export شده
// و به دیتابیس دیگری اشاره می‌کند → مقالات در دیتابیس نامرئی ذخیره می‌شدند.
// مسیر مطلق از مکان همین فایل محاسبه می‌شود: mini-services/seo-worker/env.ts
// → بالا برو تا ریشه پروژه (پوشه‌ای که package.json + prisma دارد) → db/custom.db
function forceProjectDatabaseUrl(): void {
  let dir = import.meta.dir;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "prisma", "schema.prisma"))) {
      const dbPath = join(dir, "db", "custom.db");
      if (existsSync(dbPath)) {
        process.env.DATABASE_URL = `file:${dbPath}`;
        console.log(`[seo-worker] DATABASE_URL forced to project db: ${dbPath}`);
        return;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  console.warn("[seo-worker] ⚠️ project db not found by walk-up — keeping existing DATABASE_URL");
}
forceProjectDatabaseUrl();

export {};
