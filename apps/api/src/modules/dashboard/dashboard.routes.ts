import { Prisma, Role } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";

export const dashboardRouter = Router();

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
    ...(user.role === Role.MACHINE_OPERATOR ? { machine: { operatorId: user.id } } : {}),
    ...(user.role === Role.SERVICE_PROVIDER ? { id: "__external_users_have_no_alert_scope__" } : {})
  };
  const workOrderWhere: Prisma.WorkOrderWhereInput =
    user.role === Role.SERVICE_PROVIDER
      ? {
          providerId: user.id,
          status: { in: ["APPROVED", "SENT_TO_PROVIDER", "IN_PROGRESS"] }
        }
      : {
          status: { notIn: ["COMPLETED", "CANCELLED"] },
          ...(user.role === Role.MACHINE_OPERATOR ? { machine: { operatorId: user.id } } : {})
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
