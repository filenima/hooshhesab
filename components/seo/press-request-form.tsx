"use client";

// فرم اتاق خبر — درخواست بسته رسانه‌ای/مصاحبه/داده/مشارکت در پژوهش
import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2, Megaphone, Mic2, Database, ClipboardList } from "lucide-react";

const REQUEST_KINDS = [
  { id: "media-kit", label: "بستهٔ رسانه‌ای", icon: Megaphone, desc: "PDF + اینفوگرافیک + CSV" },
  { id: "interview", label: "مصاحبه با کارشناس", icon: Mic2, desc: "تلفنی / متنی / پادکستی" },
  { id: "data", label: "دادهٔ تفکیکی", icon: Database, desc: "تفکیک شهری/صنفی" },
  { id: "survey", label: "مشارکت در پژوهش", icon: ClipboardList, desc: "پرسش‌نامهٔ نبض مالی" },
] as const;

export function PressRequestForm() {
  const [kind, setKind] = React.useState<string>("media-kit");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [org, setOrg] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [state, setState] = React.useState<"idle" | "sending" | "done" | "error">("idle");
  const [feedback, setFeedback] = React.useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setFeedback("");
    try {
      const res = await fetch("/api/press/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, org, type: kind, message }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; error?: string };
      if (res.ok && data.success) {
        setState("done");
        setFeedback(data.message || "درخواست ثبت شد.");
        setName(""); setEmail(""); setOrg(""); setMessage("");
      } else {
        setState("error");
        setFeedback(data.error || "ارسال ناموفق بود؛ دوباره تلاش کنید.");
      }
    } catch {
      setState("error");
      setFeedback("ارتباط برقرار نشد؛ اینترنت خود را بررسی کنید.");
    }
  }

  return (
    <Card id="press-form" className="mb-12 overflow-hidden border-primary/20">
      <CardHeader className="border-b border-border bg-primary/5">
        <CardTitle className="flex items-center gap-2 text-base font-bold">
          <Megaphone className="h-4 w-4 text-primary" />
          فرم اتاق خبر — درخواست شما
        </CardTitle>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          رسانه‌ها و کسب‌وکارها؛ ظرف یک روز کاری پاسخ می‌گیرید. هیچ هزینه‌ای در کار نیست.
        </p>
      </CardHeader>
      <CardContent className="pt-5">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="mb-2 block text-xs font-medium">نوع درخواست</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {REQUEST_KINDS.map((k) => {
                const Icon = k.icon;
                const active = kind === k.id;
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setKind(k.id)}
                    aria-pressed={active}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[11px] font-bold leading-tight">{k.label}</span>
                    <span className="text-[10px] leading-tight opacity-75">{k.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="press-name" className="text-xs">نام و نام خانوادگی *</Label>
              <Input id="press-name" value={name} onChange={(e) => setName(e.target.value)} required className="mt-1" placeholder="مثلاً: سارا محمدی" />
            </div>
            <div>
              <Label htmlFor="press-email" className="text-xs">ایمیل *</Label>
              <Input id="press-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1 text-left" placeholder="you@media.ir" />
            </div>
          </div>
          <div>
            <Label htmlFor="press-org" className="text-xs">رسانه / سازمان (اختیاری)</Label>
            <Input id="press-org" value={org} onChange={(e) => setOrg(e.target.value)} className="mt-1" placeholder="مثلاً: خبرگزاری اقتصادی ..." />
          </div>
          <div>
            <Label htmlFor="press-message" className="text-xs">توضیح درخواست (اختیاری)</Label>
            <Textarea id="press-message" value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1 min-h-20" placeholder="موضوع مصاحبه، دادهٔ موردنیاز یا هر نکته‌ای که کمک می‌کند دقیق‌تر پاسخ بدهیم" />
          </div>
          <Button type="submit" disabled={state === "sending"} className="w-full sm:w-auto">
            {state === "sending" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> در حال ارسال…
              </>
            ) : (
              "ارسال درخواست"
            )}
          </Button>
          {state === "done" && (
            <p className="flex items-center gap-1.5 rounded-lg bg-primary/10 p-3 text-xs font-medium text-primary">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {feedback}
            </p>
          )}
          {state === "error" && (
            <p className="rounded-lg bg-destructive/10 p-3 text-xs font-medium text-destructive">{feedback}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
