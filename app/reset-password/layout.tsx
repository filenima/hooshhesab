import type { Metadata } from "next";

// FIX (v36 — Task 7-هـ-۳): این صفحه خصوصی/گذراست و نباید ایندکس شود.
// قبلاً canonical ارثی "/" داشت و noindex نداشت → ریسک «Indexed, though blocked».
export const metadata: Metadata = {
  title: "تنظیم رمز عبور جدید", // FIX(v37)
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  alternates: {
    canonical: "/reset-password",
  },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
