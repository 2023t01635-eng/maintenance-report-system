import { Prisma, Role } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";
import type { AuthUser } from "../auth/auth.types.js";

export const dashboardRouter = Router();

async function activityWhere(user: AuthUser): Promise<Prisma.AuditLogWhereInput> {
  if (user.role === Role.ADMIN) return {};
  if (user.role === Role.OWNER) {
    return { actor: { role: { in: [Role.OWNER, Role.MANAGER, Role.MACHINE_OPERATOR] } } };
  }
  if (user.role === Role.MANAGER) {
    return { actor: { role: { in: [Role.MANAGER, Role.MACHINE_OPERATOR] } } };
  }
  return { actorId: user.id };
}

dashboardRouter.get("/summary", requireAuth, async (req, res) => {
  const user = req.user!;
  const machineWhere: Prisma.MachineWhereInput =
    user.role === Role.MACHINE_OPERATOR
      ? { operatorId: user.id }
      : user.role === Role.SERVICE_PROVIDER
        ? { id: "__external_users_have_no_machine_scope__" }
        : {};
  const alertWhere: Prisma.AlertWhereInput = {
    status: { in: ["OPEN", "ACKNOWLEDGED"] },
    ...(user.role === Role.MACHINE_OPERATOR
      ? { machine: { operatorId: user.id }, NOT: { type: "PAYMENT_APPROVAL" } }
      : {}),
    ...(user.role === Role.SERVICE_PROVIDER ? { id: "__external_users_have_no_alert_scope__" } : {})
  };
  const workOrderWhere: Prisma.WorkOrderWhereInput =
    user.role === Role.SERVICE_PROVIDER
      ? {
          providerId: user.id,
          status: {
            in: ["SENT_TO_PROVIDER", "PROVIDER_ACCEPTED", "IN_PROGRESS", "PRICE_REVISION_REQUESTED", "AWAITING_PAYMENT_APPROVAL"]
          }
        }
      : {
          status: { notIn: ["COMPLETED", "CLOSED", "REJECTED", "CANCELLED"] },
          ...(user.role === Role.MACHINE_OPERATOR
            ? { OR: [{ machine: { operatorId: user.id } }, { createdById: user.id }] }
            : {})
        };
  const [machines, openAlerts, activeWorkOrders, users] = await Promise.all([
    prisma.machine.count({ where: machineWhere }),
    prisma.alert.count({ where: alertWhere }),
    prisma.workOrder.count({ where: workOrderWhere }),
    user.role === Role.ADMIN ? prisma.user.count({ where: { isActive: true } }) : Promise.resolve(1)
  ]);

  res.json({
    role: user.role,
    totals: { machines, openAlerts, activeWorkOrders, activeUsers: users }
  });
});

dashboardRouter.get("/activity", requireAuth, async (req, res) => {
  const events = await prisma.auditLog.findMany({
    where: await activityWhere(req.user!),
    include: {
      actor: { select: { id: true, name: true, role: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 25
  });
  res.json({ events });
});

dashboardRouter.get(
  "/payments",
  requireAuth,
  requireRoles(Role.ADMIN, Role.OWNER, Role.MANAGER, Role.SERVICE_PROVIDER),
  async (req, res) => {
    const user = req.user!;
    const isProvider = user.role === Role.SERVICE_PROVIDER;
    const workOrders = await prisma.workOrder.findMany({
      where: {
        status: "CLOSED",
        paymentApprovedAt: { not: null },
        ...(isProvider ? { providerId: user.id } : {})
      },
      select: {
        id: true,
        title: true,
        proposedBudget: true,
        serviceCost: true,
        completedDate: true,
        paymentApprovedAt: true,
        paymentReference: true,
        machine: { select: { id: true, assetCode: true, name: true } },
        provider: { select: { id: true, name: true, email: true } },
        paymentApprovedBy: { select: { id: true, name: true, role: true } },
        replacements: {
          select: { id: true, partName: true, partNumber: true, quantity: true, unitCost: true }
        }
      },
      orderBy: { paymentApprovedAt: "desc" }
    });

    const payments = workOrders.map((workOrder) => {
      const parts = workOrder.replacements.map((part) => ({
        ...part,
        unitCost: Number(part.unitCost ?? 0),
        lineTotal: Math.round(part.quantity * Number(part.unitCost ?? 0) * 100) / 100
      }));
      const partsTotal = Math.round(parts.reduce((total, part) => total + part.lineTotal, 0) * 100) / 100;
      const serviceCost = Number(workOrder.serviceCost ?? 0);
      const paymentValue = Math.round((serviceCost + partsTotal) * 100) / 100;
      const budget = Number(workOrder.proposedBudget ?? 0);
      return {
        id: workOrder.id,
        title: workOrder.title,
        direction: isProvider ? "INFLOW" : "OUTFLOW",
        machine: workOrder.machine,
        provider: workOrder.provider,
        approvedBy: workOrder.paymentApprovedBy,
        paymentApprovedAt: workOrder.paymentApprovedAt,
        completedDate: workOrder.completedDate,
        paymentReference: workOrder.paymentReference,
        proposedBudget: budget,
        serviceCost,
        partsTotal,
        paymentValue,
        variance: Math.round((paymentValue - budget) * 100) / 100,
        parts
      };
    });

    const summary = payments.reduce(
      (totals, payment) => {
        totals.paymentTotal += payment.paymentValue;
        totals.budgetTotal += payment.proposedBudget;
        if (payment.variance > 0) totals.overBudgetAmount += payment.variance;
        if (payment.variance < 0) totals.underBudgetAmount += Math.abs(payment.variance);
        return totals;
      },
      { paymentTotal: 0, budgetTotal: 0, overBudgetAmount: 0, underBudgetAmount: 0 }
    );
    const monthlyMap = new Map<string, { month: string; paymentTotal: number; budgetTotal: number; count: number }>();
    for (const payment of payments) {
      const date = payment.paymentApprovedAt ?? payment.completedDate;
      if (!date) continue;
      const month = date.toISOString().slice(0, 7);
      const current = monthlyMap.get(month) ?? { month, paymentTotal: 0, budgetTotal: 0, count: 0 };
      current.paymentTotal += payment.paymentValue;
      current.budgetTotal += payment.proposedBudget;
      current.count += 1;
      monthlyMap.set(month, current);
    }

    res.json({
      role: user.role,
      direction: isProvider ? "INFLOW" : "OUTFLOW",
      summary: {
        ...summary,
        paymentTotal: Math.round(summary.paymentTotal * 100) / 100,
        budgetTotal: Math.round(summary.budgetTotal * 100) / 100,
        overBudgetAmount: Math.round(summary.overBudgetAmount * 100) / 100,
        underBudgetAmount: Math.round(summary.underBudgetAmount * 100) / 100,
        netVariance: Math.round((summary.paymentTotal - summary.budgetTotal) * 100) / 100,
        paymentCount: payments.length
      },
      monthly: [...monthlyMap.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12),
      payments
    });
  }
);
