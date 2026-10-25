"use client";

import * as React from "react";
import {
  Store,
  Save,
  Copy,
  Trash2,
  Link2,
  CalendarDays,
  Loader2,
  RefreshCw,
  Info,
  Newspaper,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toPersianDigits } from "@/lib/persian";
import { useToast } from "@/hooks/use-toast";

// ============================================================
// GbpPostsTab (11-D) — «پست گوگل بیزینس (GBP)»
// ------------------------------------------------------------
// درخواست مالک: کامپوزر پست هفتگی + فهرست پست‌های قبلی + کپی برای
// انتشار در Google Business Profile. ذخیره در SystemSettings (gbp_posts)
// از /api/platform/gbp-posts. ارسال خودکار انجام نمی‌شود (API عمومی GBP
// نیاز به تأییدیه دارد) — متن آمادهٔ کپی در دسترس است.
// ============================================================

interface GbpPost {
  id: string;
  title: string;
  body: string;
  link: string;
  createdAt: string;
}

interface LatestPost {
  title: string;
  path: string;
}

const MAX_TITLE_LEN = 80;
const MAX_BODY_LEN = 1200;

function faDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "full", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return "—";
  }
}

/** متن کامل پست برای کپی در GBP */
function buildPostText(p: { title: string; body: string; link: string }): string {
  return [p.title, "", p.body, p.link ? `\n${p.link}` : ""].join("\n").trim();
}

export function GbpPostsTab({ token }: { token: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [posts, setPosts] = React.useState<GbpPost[]>([]);
  const [latestPost, setLatestPost] = React.useState<LatestPost | null>(null);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [link, setLink] = React.useState("");
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const authHeaders = React.useMemo<Record<string, string>>(
    () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }),
    [token]
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/gbp-posts", { cache: "no-store", headers: authHeaders });
      const j = (await res.json().catch(() => null)) as {
        success?: boolean; error?: string;
        data?: { posts?: GbpPost[]; latestPost?: LatestPost | null };
      } | null;
      if (j?.success && j.data) {
        setPosts(j.data.posts ?? []);
        setLatestPost(j.data.latestPost ?? null);
      } else {
        toast({ title: "خطا", description: j?.error || "دریافت پست‌ها ناموفق بود", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [authHeaders, toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const copyText = async (text: string, postId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(postId);
      setTimeout(() => setCopiedId(null), 2500);
      return true;
    } catch {
      toast({ title: "کپی ناموفق", description: "مرورگر اجازهٔ دسترسی به کلیپ‌بورد نداد — متن را دستی انتخاب و کپی کنید", variant: "destructive" });
      return false;
    }
  };

  const savePost = async () => {
    if (!title.trim() || !body.trim()) {
      toast({ title: "فیلدهای الزامی", description: "عنوان و متن پست را وارد کنید", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/platform/gbp-posts", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ title: title.trim(), body: body.trim(), link: link.trim() }),
      });
      const j = (await res.json().catch(() => null)) as { success?: boolean; message?: string; error?: string } | null;
      if (j?.success) {
        const ok = await copyText(buildPostText({ title: title.trim(), body: body.trim(), link: link.trim() }), "new");
        toast({
          title: "پست ذخیره شد",
          description: ok ? "متن پست در کلیپ‌بورد کپی شد — در پروفایل گوگل بیزینس جای‌گذاری کنید" : (j.message || ""),
        });
        setTitle("");
        setBody("");
        setLink("");
        await load();
      } else {
        toast({ title: "خطا در ذخیره", description: j?.error || "عملیات ناموفق بود", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deletePost = async (id: string) => {
    try {
      const res = await fetch(`/api/platform/gbp-posts?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      const j = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (j?.success) {
        toast({ title: "پست حذف شد" });
        await load();
      } else {
        toast({ title: "خطا در حذف", description: j?.error || "عملیات ناموفق بود", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطا", description: "ارتباط با سرور برقرار نشد", variant: "destructive" });
    }
  };

  /** درج لینک آخرین مقالهٔ منتشرشده + پیش‌نویس متن */
  const useLatestPost = () => {
    if (!latestPost) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    setLink(`${origin}${latestPost.path}`);
    setBody((prev) =>
      prev.trim() ||
      `مقالهٔ تازهٔ «هوش» را از دست ندهید:\n«${latestPost.title}»\nراهنمای کامل و کاربردی برای کسب‌وکارهای ایرانی — همین حالا بخوانید.`
    );
    toast({ title: "لینک آخرین مقاله درج شد", description: "متن را ویرایش و ذخیره کنید" });
  };

  return (
    <div className="space-y-6">
      {/* هدر */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Store className="h-5 w-5 text-primary" />
            پست گوگل بیزینس (GBP)
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            کامپوزر پست هفتگی برای پروفایل Google Business — متن آمادهٔ کپی با لینک آخرین مقاله
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load} disabled={loading || saving} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            بازخوانی
          </Button>
        </div>
      </div>

      {/* یادآور هفتگی */}
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardContent className="flex flex-wrap items-center gap-3 p-4 text-xs">
          <CalendarDays className="h-4 w-4 text-primary" />
          <span>هدف: <strong>هر هفته یک پست</strong> در پروفایل گوگل بیزینس — پست‌های منظم، اعتبار و دیده‌شدن پروفایل را بالا می‌برد.</span>
          <Badge variant="outline" className="text-[10px]">
            {loading ? "…" : `${toPersianDigits(posts.length)} پست ثبت‌شده`}
          </Badge>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* کامپوزر */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Newspaper className="h-4 w-4 text-primary" />
              پست جدید
            </CardTitle>
            <CardDescription className="text-xs">
              ذخیره + کپی خودکار — سپس در GBP جای‌گذاری کنید
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>عنوان پست</span>
                <span className="tnum">{toPersianDigits(title.length)}/{toPersianDigits(MAX_TITLE_LEN)}</span>
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={MAX_TITLE_LEN}
                placeholder="مثلاً: نکتهٔ هفته: فاکتور الکترونیکی چکه هزینه را کم می‌کند"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>متن پست</span>
                <span className="tnum">{toPersianDigits(body.length)}/{toPersianDigits(MAX_BODY_LEN)}</span>
              </Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={MAX_BODY_LEN}
                className="min-h-[120px]"
                placeholder="متن کوتاه و مفید برای مشتریان؛ پایان با دعوت به اقدام…"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">لینک (دکمهٔ «بیشتر بدانید» در GBP)</Label>
              <div className="flex gap-2">
                <Input
                  dir="ltr"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://hoosh.nobatime.ir/blog/..."
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={useLatestPost}
                  disabled={!latestPost}
                  aria-label="درج لینک آخرین مقاله"
                  title="درج لینک آخرین مقالهٔ منتشرشده"
                >
                  <Link2 className="h-4 w-4" />
                </Button>
              </div>
              {latestPost ? (
                <p className="text-[10px] text-muted-foreground">
                  آخرین مقاله: {latestPost.title} — با دکمهٔ لینک، خودکار درج می‌شود
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground">مقالهٔ منتشرشده‌ای برای لینک وجود ندارد</p>
              )}
            </div>
            <Button onClick={savePost} disabled={saving || loading} className="w-full gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "در حال ذخیره…" : "ذخیره و کپی متن پست"}
            </Button>
          </CardContent>
        </Card>

        {/* فهرست پست‌ها */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">پست‌های ثبت‌شده</CardTitle>
            <CardDescription className="text-xs">آخرین پست‌ها — برای انتشار مجدد کپی کنید</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Store className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">هنوز پستی ثبت نشده است</p>
                <p className="text-xs text-muted-foreground/70">اولین پست هفتگی را از فرم روبه‌رو بسازید</p>
              </div>
            ) : (
              posts.map((p) => (
                <div key={p.id} className="rounded-xl border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold leading-5">{p.title}</p>
                    <Badge variant="outline" className="shrink-0 text-[9px] tnum">
                      {faDateTime(p.createdAt)}
                    </Badge>
                  </div>
                  <p className="line-clamp-3 text-[11px] leading-5 text-muted-foreground whitespace-pre-line">{p.body}</p>
                  {p.link && (
                    <p className="truncate text-[10px] text-muted-foreground" dir="ltr">
                      {p.link}
                    </p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-[11px]"
                      onClick={() => void copyText(buildPostText(p), p.id)}
                    >
                      {copiedId === p.id ? <ClipboardCheck className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedId === p.id ? "کپی شد" : "کپی متن"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-[11px] text-destructive hover:text-destructive"
                      onClick={() => void deletePost(p.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      حذف
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* راهنما */}
      <Card>
        <CardContent className="p-4 text-xs leading-6 text-muted-foreground">
          <p className="mb-2 flex items-center gap-1.5 font-bold text-foreground">
            <Info className="h-4 w-4 text-primary" />
            چطور پست را در گوگل بیزینس منتشر کنم؟
          </p>
          <ul className="list-inside list-disc space-y-1.5">
            <li>پست را با دکمهٔ «ذخیره و کپی» آماده کنید — متن کامل در کلیپ‌بورد است.</li>
            <li>در <strong>business.google.com</strong> وارد شوید → پروفایل کسب‌وکار → بخش «به‌روزرسانی» (Posts) → «نوشتن».</li>
            <li>عنوان را در فیلد عنوان و متن را در بدنهٔ پست جای‌گذاری کنید؛ لینک را در دکمهٔ «بیشتر بدانید» بگذارید.</li>
            <li>پست‌های GBP معمولاً <strong>۷ تا ۱۴ روز</strong> نمایش داده می‌شوند — انتشار هفتگی، حضور مداوم ایجاد می‌کند.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default GbpPostsTab;
