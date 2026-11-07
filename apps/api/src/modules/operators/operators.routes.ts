import { Role } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

export const operatorsRouter = Router();

operatorsRouter.get(
  "/",
  requireAuth,
  requireRoles(Role.ADMIN, Role.OWNER, Role.MANAGER),
  async (_req, res) => {
    const operators = await prisma.user.findMany({
      where: { role: Role.MACHINE_OPERATOR, isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" }
    });
    res.json({ operators });
  }
);
