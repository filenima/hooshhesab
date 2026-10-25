import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-middleware";
// v36 (Task 4): سیستم اقساط — مدیریت سوپرادمین
import { settleInstallmentOnVerify, SUSPEND_AFTER_DAYS } from "@/lib/installments";
import { toJalali } from "@/lib/persian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;

// GET /api/platform/installments
// --------------------------------------------------------------
// لیست پلن‌های اقساطی + آمار + نمودار وصولی ماهانه.
// query: status=ACTIVE|COMPLETED|DEFAULTED|CANCELED, q (جستجوی tenant),
//        page, pageSize (حداکثر 50)
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const url = new URL(req.url);
    const statusFilter = (url.searchParams.get("status") || "").trim().toUpperCase();
    const q = (url.searchParams.get("q") || "").trim();
    const page = Math.max(1, Math.round(Number(url.searchParams.get("page")) || 1));
    const pageSize = Math.min(50, Math.max(5, Math.round(Number(url.searchParams.get("pageSize")) || PAGE_SIZE)));

    const where = {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(q
        ? {
            tenant: {
              is: {
                OR: [{ name: { contains: q } }, { contactEmail: { contains: q } }],
              },
            },
          }
        : {}),
    };

    const [total, plans] = await Promise.all([
      db.licensePaymentPlan.count({ where }),
      db.licensePaymentPlan.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          installments: { orderBy: { seq: "asc" } },
          tenant: { select: { id: true, name: true, plan: true, status: true, contactEmail: true } },
        },
      }),
    ]);

    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // ── آمار ──
    const [
      activePlans,
      completedPlans,
      defaultedPlans,
      overdueInstallments,
      dueThisWeek,
      paidThisMonth,
      outstandingToman,
    ] = await Promise.all([
      db.licensePaymentPlan.count({ where: { status: "ACTIVE" } }),
      db.licensePaymentPlan.count({ where: { status: "COMPLETED" } }),
      db.licensePaymentPlan.count({ where: { status: "DEFAULTED" } }),
      db.licenseInstallment.count({
        where: { status: "OVERDUE", paymentPlan: { status: { in: ["ACTIVE", "DEFAULTED"] } } },
      }),
      db.licenseInstallment.count({
        where: {
          status: "PENDING",
          dueDate: { gte: now, lte: weekAhead },
          paymentPlan: { status: { in: ["ACTIVE", "DEFAULTED"] } },
        },
      }),
      db.licenseInstallment.aggregate({
        where: { status: "PAID", paidAt: { gte: monthAgo } },
        _sum: { amountToman: true },
      }),
      db.licenseInstallment.aggregate({
        where: { status: { in: ["PENDING", "OVERDUE"] } },
        _sum: { amountToman: true },
      }),
    ]);

    // ── نمودار وصولی اقساط ۶ ماه اخیر (بر اساس paidAt) ──
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const paidRecent = await db.licenseInstallment.findMany({
      where: { status: "PAID", paidAt: { gte: sixMonthsAgo } },
      select: { paidAt: true, amountToman: true },
    });
    const buckets = new Map<string, { toman: number; count: number }>();
    for (const row of paidRecent) {
      const d = row.paidAt ?? row.paidAt ?? new Date();
      const key = toJalali(d).slice(0, 7); // ۱۴۰۴/۰۸
      const cur = buckets.get(key) ?? { toman: 0, count: 0 };
      cur.toman += row.amountToman;
      cur.count += 1;
      buckets.set(key, cur);
    }
    const chart = Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({ month, toman: v.toman, count: v.count }));

    const planNameMap: Record<string, string> = {
      basic: "پایه",
      pro: "حرفه‌ای",
      enterprise: "سازمانی",
    };

    const items = plans.map((p) => {
      const installments = p.installments.map((i) => ({
        id: i.id,
        seq: i.seq,
        amountToman: i.amountToman,
        dueDate: i.dueDate.toISOString(),
        dueDateJalali: toJalali(i.dueDate),
        status: i.status,
        paidAt: i.paidAt?.toISOString() ?? null,
        paidAtJalali: i.paidAt ? toJalali(i.paidAt) : null,
        refId: i.refId,
        authority: i.authority,
      }));
      const open = installments.filter((i) => i.status !== "PAID");
      const next = open[0] ?? null;
      const hasOverdue = open.some((i) => i.status === "OVERDUE");
      return {
        id: p.id,
        tenantId: p.tenantId,
        tenantName: p.tenant?.name ?? "—",
        tenantEmail: p.tenant?.contactEmail ?? null,
        tenantStatus: p.tenant?.status ?? null,
        planId: p.planId,
        planName: planNameMap[p.planId] ?? p.planId,
        period: p.period,
        status: p.status,
        totalAmountToman: p.totalAmountToman,
        installmentCount: p.installmentCount,
        paidCount: p.paidCount,
        couponCode: p.couponCode,
        priceLockedToman: p.priceLockedToman,
        startsAt: p.startsAt.toISOString(),
        startsAtJalali: toJalali(p.startsAt),
        createdAt: p.createdAt.toISOString(),
        licenseId: p.licenseId,
        installments,
        nextInstallment: next,
        remainingToman: open.reduce((s, i) => s + i.amountToman, 0),
        hasOverdue,
      };
    });

    return NextResponse.json({
      success: true,
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      stats: {
        activePlans,
        completedPlans,
        defaultedPlans,
        overdueInstallments,
        dueThisWeek,
        paidThisMonthToman: paidThisMonth._sum.amountToman ?? 0,
        outstandingToman: outstandingToman._sum.amountToman ?? 0,
        suspendAfterDays: SUSPEND_AFTER_DAYS,
      },
      chart,
    });
  } catch (error) {
    console.error("[platform/installments GET] error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در دریافت پلن‌های اقساطی" },
      { status: 500 }
    );
  }
}

// POST /api/platform/installments
// --------------------------------------------------------------
// عملیات سوپرادمین روی اقساط:
//  { action: "mark-paid", installmentId, refId?, note? }
//     → ثبت دستی پرداخت (واریز بانکی) — همان منطق تسویهٔ verify (اتمیک)
//  { action: "edit-due", installmentId, dueDate }
//     → ویرایش سررسید (ISO)
//  { action: "stop-plan", installmentPlanId, note? }
//     → توقف پلن اقساطی (CANCELED)
//  { action: "reactivate-plan", installmentPlanId }
//     → فعال‌سازی مجدد پلن
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      installmentId?: string;
      installmentPlanId?: string;
      refId?: string;
      note?: string;
      dueDate?: string;
    };

    // ============ ۱) ثبت دستی پرداخت (واریز بانکی) ============
    if (body.action === "mark-paid") {
      if (!body.installmentId) {
        return NextResponse.json(
          { success: false, error: "شناسهٔ قسط الزامی است" },
          { status: 400 }
        );
      }
      const inst = await db.licenseInstallment.findUnique({
        where: { id: body.installmentId },
        include: { paymentPlan: true },
      });
      if (!inst || !inst.paymentPlan) {
        return NextResponse.json(
          { success: false, error: "قسط یافت نشد" },
          { status: 404 }
        );
      }
      if (inst.status === "PAID") {
        return NextResponse.json(
          { success: false, error: "این قسط قبلاً پرداخت شده است" },
          { status: 409 }
        );
      }
      const manualRef = (body.refId || "").trim() || `MANUAL-${Date.now().toString(36).toUpperCase()}`;
      // همان مسیر اتمیک verify — صدور لایسنس در قسط اول، فعال‌شدن لایسنس معلق،
      // ریست تریال و تکمیل پلن در قسط آخر همه خودکار انجام می‌شود.
      const result = await settleInstallmentOnVerify({
        installmentId: inst.id,
        tenantId: inst.paymentPlan.tenantId,
        refId: manualRef,
        amountToman: inst.amountToman, // DB = حقیقت واحد
      });
      if (!result.settled && !result.alreadyPaid) {
        return NextResponse.json(
          { success: false, error: result.message },
          { status: 400 }
        );
      }

      await db.platformAuditLog.create({
        data: {
          superAdminId: auth.admin.id,
          action: "INSTALLMENT_MARK_PAID",
          entity: "LicenseInstallment",
          entityId: inst.id,
          details: JSON.stringify({
            tenantId: inst.paymentPlan.tenantId,
            seq: inst.seq,
            amountToman: inst.amountToman,
            manualRef,
            note: body.note || null,
          }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      }).catch(() => undefined);

      return NextResponse.json({
        success: true,
        message: `قسط ${inst.seq} به‌صورت دستی «پرداخت‌شده» ثبت شد${result.planCompleted ? " و پلن اقساطی تکمیل شد" : ""}${result.licenseReactivated ? "؛ لایسنس معلق دوباره فعال شد" : ""}`,
        result,
      });
    }

    // ============ ۲) ویرایش سررسید ============
    if (body.action === "edit-due") {
      if (!body.installmentId) {
        return NextResponse.json(
          { success: false, error: "شناسهٔ قسط الزامی است" },
          { status: 400 }
        );
      }
      const dueDateRaw = body.dueDate;
      const due = dueDateRaw ? new Date(dueDateRaw) : null;
      if (!due || Number.isNaN(due.getTime())) {
        return NextResponse.json(
          { success: false, error: "تاریخ سررسید معتبر نیست" },
          { status: 400 }
        );
      }
      const inst = await db.licenseInstallment.findUnique({
        where: { id: body.installmentId },
      });
      if (!inst) {
        return NextResponse.json(
          { success: false, error: "قسط یافت نشد" },
          { status: 404 }
        );
      }
      if (inst.status === "PAID") {
        return NextResponse.json(
          { success: false, error: "سررسید قسط پرداخت‌شده قابل تغییر نیست" },
          { status: 409 }
        );
      }
      await db.licenseInstallment.update({
        where: { id: inst.id },
        data: { dueDate: due },
      });
      await db.platformAuditLog.create({
        data: {
          superAdminId: auth.admin.id,
          action: "INSTALLMENT_EDIT_DUE",
          entity: "LicenseInstallment",
          entityId: inst.id,
          details: JSON.stringify({
            from: inst.dueDate.toISOString(),
            to: due.toISOString(),
            note: body.note || null,
          }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      }).catch(() => undefined);
      return NextResponse.json({
        success: true,
        message: `سررسید قسط ${inst.seq} به ${toJalali(due)} تغییر کرد`,
      });
    }

    // ============ ۳) توقف پلن اقساطی ============
    if (body.action === "stop-plan") {
      if (!body.installmentPlanId) {
        return NextResponse.json(
          { success: false, error: "شناسهٔ پلن اقساطی الزامی است" },
          { status: 400 }
        );
      }
      const plan = await db.licensePaymentPlan.findUnique({
        where: { id: body.installmentPlanId },
      });
      if (!plan) {
        return NextResponse.json(
          { success: false, error: "پلن اقساطی یافت نشد" },
          { status: 404 }
        );
      }
      if (plan.status === "COMPLETED") {
        return NextResponse.json(
          { success: false, error: "پلن تکمیل‌شده قابل توقف نیست" },
          { status: 409 }
        );
      }
      await db.licensePaymentPlan.update({
        where: { id: plan.id },
        data: { status: "CANCELED" },
      });
      await db.platformAuditLog.create({
        data: {
          superAdminId: auth.admin.id,
          action: "INSTALLMENT_PLAN_STOP",
          entity: "LicensePaymentPlan",
          entityId: plan.id,
          details: JSON.stringify({
            tenantId: plan.tenantId,
            note: body.note || null,
          }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      }).catch(() => undefined);
      return NextResponse.json({
        success: true,
        message: "پلن اقساطی متوقف شد — اقساط باقیمانده دیگر یادآوری نمی‌شوند",
      });
    }

    // ============ ۴) فعال‌سازی مجدد پلن ============
    if (body.action === "reactivate-plan") {
      if (!body.installmentPlanId) {
        return NextResponse.json(
          { success: false, error: "شناسهٔ پلن اقساطی الزامی است" },
          { status: 400 }
        );
      }
      const plan = await db.licensePaymentPlan.findUnique({
        where: { id: body.installmentPlanId },
      });
      if (!plan) {
        return NextResponse.json(
          { success: false, error: "پلن اقساطی یافت نشد" },
          { status: 404 }
        );
      }
      if (plan.status !== "CANCELED") {
        return NextResponse.json(
          { success: false, error: "فقط پلن متوقف‌شده قابل فعال‌سازی مجدد است" },
          { status: 409 }
        );
      }
      await db.licensePaymentPlan.update({
        where: { id: plan.id },
        data: { status: "ACTIVE" },
      });
      await db.platformAuditLog.create({
        data: {
          superAdminId: auth.admin.id,
          action: "INSTALLMENT_PLAN_REACTIVATE",
          entity: "LicensePaymentPlan",
          entityId: plan.id,
          details: JSON.stringify({ tenantId: plan.tenantId }),
          ipAddress: req.headers.get("x-forwarded-for") || null,
        },
      }).catch(() => undefined);
      return NextResponse.json({
        success: true,
        message: "پلن اقساطی دوباره فعال شد",
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: "action نامعتبر است (mark-paid | edit-due | stop-plan | reactivate-plan)",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("[platform/installments POST] error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در عملیات مدیریت اقساط" },
      { status: 500 }
    );
  }
}
