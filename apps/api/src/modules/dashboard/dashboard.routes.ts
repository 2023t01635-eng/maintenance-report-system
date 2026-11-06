import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";

export const dashboardRouter = Router();

dashboardRouter.get("/summary", requireAuth, async (req, res) => {
  const [machines, openAlerts, activeWorkOrders, users] = await Promise.all([
    prisma.machine.count(),
    prisma.alert.count({ where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } } }),
    prisma.workOrder.count({ where: { status: { notIn: ["COMPLETED", "CANCELLED"] } } }),
    prisma.user.count({ where: { isActive: true } })
  ]);

  res.json({
    role: req.user!.role,
    totals: { machines, openAlerts, activeWorkOrders, activeUsers: users }
  });
});
