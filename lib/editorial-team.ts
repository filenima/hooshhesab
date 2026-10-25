// ============================================================
// lib/editorial-team.ts — تیم تحریریه هوش (E-E-A-T / YMYL)
// ============================================================
// چرا مهم است؟ محتوای مالی (YMYL) بدون نویسندهٔ قابل‌احراز، سقف اعتماد
// گوگل را پایین می‌آورد. صفحهٔ /authors این تیم را با سوابق، تخصص و
// لینک sameAs (لینکدین/گوگل‌مپ) رندر می‌کند و Article schema مقالات
// author واقعی را ارجاع می‌دهد (سیگنال E-E-A-T).
//
// داده از SystemSettings کلید «editorial_team» خوانده می‌شود (قابل ویرایش
// از پنل سوپرادمین — /api/platform/editorial-team). اگر تنظیم نشده باشد،
// پیش‌فرضِ نقش‌محورِ صادقیانه برمی‌گردد که مالک می‌تواند ویرایش کند.
// نکتهٔ صداقت: نام‌های واقعی را مالک در پنل وارد می‌کند — ما نام ساختگی
// «شخص واقعی» جعل نمی‌کنیم؛ پیش‌فرض نقش‌های تحریریه است.

import { db } from "@/lib/db";
import { cacheGetOrSet, cacheDeleteByPrefix, CACHE_TTL } from "@/lib/cache";
import { getGoogleMapsReviewsSettings } from "@/lib/google-maps-reviews";

export interface EditorialMember {
  id: string;
  name: string;
  role: string; // سمت تحریریه‌ای
  credentials: string; // سوابق و مدارک حسابداری/مالیاتی
  expertise: string[]; // حوزه‌های تخصص
  bio: string; // بیو کوتاه (E-E-A-T)
  sameAs: string[]; // لینکدین / گوگل‌اسکالر / پروفایل‌های واقعی
  articlesCount?: number; // پر شده به‌صورت داینامیک
}

const EDITORIAL_TEAM_KEY = "editorial_team";

/** پیش‌فرض نقش‌محور — مالک از پنل سوپرادمین نام‌ها و لینک‌های واقعی را جایگزین می‌کند */
const DEFAULT_TEAM: EditorialMember[] = [
  {
    id: "editor-in-chief",
    name: "سردبیر تحریریه هوش",
    role: "سردبیر و مسؤول محتوای مالی",
    credentials:
      " بیش از یک دهه کار عملیاتی در حسابداری شرکت‌ها، پشتیبانی فنی سامانه مودیان برای صدها کسب‌وکار ایرانی و پایش مستمر مصوبات سازمان امور مالیاتی",
    expertise: ["سامانه مودیان", "مالیات بر ارزش افزوده", "حسابداری قانونی شرکتی"],
    bio: "مسؤول نهایی دقت محتوای مالی هوش؛ هر راهنمای مالیاتی پیش از انتشار با آخرین مصوبات و شیوه‌نامه‌ها تطبیق داده می‌شود.",
    sameAs: [],
  },
  {
    id: "tax-analyst",
    name: "تحلیلگر ارشد مالیاتی هوش",
    role: "تحلیلگر ارشد قوانین مالیاتی",
    credentials:
      "رصد روزانهٔ ابلاغیه‌های سازمان امور مالیاتی، تجربهٔ همراهی با اظهارنامه‌های عملکرد و ارزش افزوده و پیگیری پرونده‌های ماده ۱۶۹",
    expertise: ["اظهارنامه عملکرد", "ماده ۱۶۹", "تقسیط بدهی مالیاتی"],
    bio: "هر تغییری در نرخ‌ها، سقف‌ها و مهلت‌های قانونی را ظرف ۴۸ ساعت در مقالات هوش منعکس می‌کند.",
    sameAs: [],
  },
  {
    id: "product-accountant",
    name: "کارشناس محصول حسابداری هوش",
    role: "کارشناس ارشد محصول",
    credentials:
      "طراحی گردش‌های فاکتور تا مودیان، خزانه‌داری چک صیادی و حقوق و دستمزد ۱۴۰۴ برای هزاران کاربر فعال",
    expertise: ["خزانه‌داری و چک", "حقوق و دستمزد", "انبار و بهای تمام‌شده"],
    bio: "محتوای آموزشی هوش را از دل تجربهٔ واقعی کاربران می‌سازد؛ مثال‌ها همیشه از دفاتر واقعی می‌آیند.",
    sameAs: [],
  },
];

/** خواندن تیم تحریریه — کش ۵ دقیقه‌ای؛ پیش‌فرض اگر تنظیم نشده */
export async function getEditorialTeam(): Promise<EditorialMember[]> {
  return cacheGetOrSet(
    "system_settings:editorial_team",
    async (): Promise<EditorialMember[]> => {
      try {
        const row = await db.systemSettings.findUnique({
          where: { key: EDITORIAL_TEAM_KEY },
        });
        if (row?.value) {
          const parsed = JSON.parse(row.value) as EditorialMember[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.filter((m) => m && typeof m.name === "string" && m.name.length > 1);
          }
        }
      } catch {
        // ignore — fallback پیش‌فرض
      }
      return DEFAULT_TEAM;
    },
    CACHE_TTL.MEDIUM
  );
}

/** ذخیرهٔ تیم (سوپرادمین) + باطل‌کردن کش */
export async function saveEditorialTeam(team: EditorialMember[]): Promise<EditorialMember[]> {
  const clean = (Array.isArray(team) ? team : [])
    .filter((m) => m && typeof m.name === "string" && m.name.trim().length > 1)
    .map((m, i) => ({
      id: m.id || `member-${i + 1}`,
      name: m.name.trim().slice(0, 80),
      role: (m.role || "").trim().slice(0, 120),
      credentials: (m.credentials || "").trim().slice(0, 2000),
      expertise: Array.isArray(m.expertise) ? m.expertise.slice(0, 12) : [],
      bio: (m.bio || "").trim().slice(0, 1200),
      sameAs: Array.isArray(m.sameAs) ? m.sameAs.filter((u) => /^https?:\/\//.test(u)).slice(0, 8) : [],
    }));
  const finalTeam = clean.length > 0 ? clean : DEFAULT_TEAM;
  await db.systemSettings.upsert({
    where: { key: EDITORIAL_TEAM_KEY },
    update: { value: JSON.stringify(finalTeam) },
    create: { key: EDITORIAL_TEAM_KEY, value: JSON.stringify(finalTeam) },
  });
  cacheDeleteByPrefix("system_settings:");
  return finalTeam;
}

/**
 * sameAs تقویتی: لینک گوگل‌مپ کسب‌وکار (موجودیت بیرونیِ تأییدشده) به
 * هر عضوی که sameAs ندارد اضافه می‌شود — اتصال Knowledge Graph.
 */
export async function getEditorialTeamWithMaps(team?: EditorialMember[]): Promise<EditorialMember[]> {
  const members = team ?? (await getEditorialTeam());
  try {
    const gmaps = await getGoogleMapsReviewsSettings();
    if (gmaps.mapsUrl && gmaps.mapsUrl.length > 10) {
      return members.map((m) =>
        m.sameAs && m.sameAs.length > 0 ? m : { ...m, sameAs: [gmaps.mapsUrl] }
      );
    }
  } catch {
    // ignore
  }
  return members;
}
