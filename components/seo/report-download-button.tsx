"use client";

// دکمهٔ «دانلود PDF» گزارش — بدون نیاز به کتابخانهٔ PDF:
// محتوای مقاله از API عمومی گرفته می‌شود، در پنجرهٔ چاپ تمیز باز و
// print dialog مرورگر (ذخیره به‌صورت PDF) صدا زده می‌شود.
// لیدمگنت نرم: بدون ایمیل‌گیری — سیگنال برند + بازدید برگشتی.

import * as React from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";

interface ReportDownloadButtonProps {
  slug: string;
  title: string;
  brandName?: string;
  className?: string;
  label?: string;
}

export function ReportDownloadButton({
  slug,
  title,
  brandName = "هوش",
  className,
  label = "دانلود PDF رایگان",
}: ReportDownloadButtonProps) {
  const [state, setState] = React.useState<"idle" | "loading">("idle");

  async function download() {
    setState("loading");
    try {
      const res = await fetch(`/api/blog/${slug}`);
      const json = (await res.json().catch(() => null)) as { success?: boolean; data?: { content?: string; title?: string } } | null;
      const content = json?.data?.content;
      if (!res.ok || !content) {
        setState("idle");
        return;
      }
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        setState("idle");
        return;
      }
      const doc = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<title>${title} — گزارش ${brandName}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "IRANSans", "Vazirmatn", "Segoe UI", Tahoma, sans-serif; line-height: 2; color: #1a202c; font-size: 12pt; margin: 0; padding: 0; }
  .report-header { border-bottom: 3px solid #10b981; padding-bottom: 12px; margin-bottom: 20px; }
  .report-brand { color: #10b981; font-weight: 800; font-size: 14pt; }
  .report-meta { color: #64748b; font-size: 9pt; margin-top: 4px; }
  h1 { font-size: 18pt; line-height: 1.6; margin: 6px 0 10px; }
  h2 { font-size: 14pt; margin-top: 26px; color: #065f46; border-right: 4px solid #10b981; padding-right: 10px; page-break-after: avoid; }
  h3 { font-size: 12.5pt; margin-top: 20px; page-break-after: avoid; }
  p { margin: 10px 0; text-align: justify; }
  table { width: 100%; border-collapse: collapse; margin: 14px 0; page-break-inside: avoid; }
  th, td { border: 1px solid #cbd5e1; padding: 7px 9px; font-size: 10pt; text-align: right; }
  th { background: #f0fdf4; }
  blockquote { background: #f0fdf4; border-right: 4px solid #10b981; margin: 12px 0; padding: 10px 14px; border-radius: 8px; }
  img { max-width: 100%; height: auto; }
  .voice-answer { background: #f0fdf4; border-right: 4px solid #10b981; border-radius: 8px; padding: 10px 14px; margin: 12px 0; }
  .report-footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #cbd5e1; color: #64748b; font-size: 9pt; text-align: center; }
  a { color: #059669; text-decoration: none; }
</style>
</head>
<body>
  <div class="report-header">
    <div class="report-brand">${brandName} — نرم‌افزار حسابداری ابری</div>
    <div class="report-meta">گزارش رایگان قابل‌چاپ · منبع: hoosh.nobatime.ir/blog/${slug}</div>
  </div>
  ${content}
  <div class="report-footer">
    این گزارش توسط ${brandName} تهیه شده و مرجع کامل آن به‌صورت به‌روز در hoosh.nobatime.ir در دسترس است.
  </div>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 400); };</script>
</body>
</html>`;
      printWindow.document.write(doc);
      printWindow.document.close();
    } catch {
      // بی‌صدا — دکمه به حالت اولیه برمی‌گردد
    } finally {
      setState("idle");
    }
  }

  return (
    <Button onClick={download} disabled={state === "loading"} className={className}>
      {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      {state === "loading" ? "در حال آماده‌سازی…" : label}
    </Button>
  );
}
