import { Prisma, Role } from "@prisma/client";
import { Router } from "express";
import { HttpError } from "../../lib/httpError.js";
import { prisma } from "../../lib/prisma.js";
import { withSerializableTransaction } from "../../lib/transactions.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";
import { createUserSchema, updateUserSchema } from "../auth/auth.schemas.js";
import { hashPassword, normalizeEmail, publicUserSelect } from "../auth/auth.service.js";

export const usersRouter = Router();

usersRouter.use(requireAuth, requireRoles(Role.ADMIN));

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    select: publicUserSelect,
    orderBy: [{ isActive: "desc" }, { name: "asc" }]
  });

  res.json({ users });
});

usersRouter.post("/", async (req, res) => {
  const input = createUserSchema.parse(req.body);
  const passwordHash = await hashPassword(input.password);

  try {
    const user = await withSerializableTransaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: input.name,
          email: normalizeEmail(input.email),
          passwordHash,
          role: input.role
        },
        select: publicUserSelect
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user!.id,
          action: "USER_CREATED",
          entityType: "User",
          entityId: created.id,
          details: { role: created.role }
        }
      });
      return created;
    });

    res.status(201).json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "A user with this email already exists");
    }

    throw error;
  }
});

usersRouter.patch("/:id", async (req, res) => {
  const input = updateUserSchema.parse(req.body);
  const passwordHash = input.password ? await hashPassword(input.password) : undefined;

  try {
    const user = await withSerializableTransaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id: req.params.id } });

      if (!current) {
        throw new HttpError(404, "User not found");
      }

      if (current.id === req.user!.id && input.isActive === false) {
        throw new HttpError(400, "You cannot deactivate your own account");
      }

      const invalidatesOperator =
        current.role === Role.MACHINE_OPERATOR &&
        (input.isActive === false || (input.role !== undefined && input.role !== Role.MACHINE_OPERATOR));
      const unassigned = invalidatesOperator
        ? await tx.machine.updateMany({ where: { operatorId: current.id }, data: { operatorId: null } })
        : { count: 0 };

      const updated = await tx.user.update({
        where: { id: current.id },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.email ? { email: normalizeEmail(input.email) } : {}),
          ...(input.role ? { role: input.role } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(passwordHash ? { passwordHash } : {})
        },
        select: publicUserSelect
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user!.id,
          action: "USER_UPDATED",
          entityType: "User",
          entityId: updated.id,
          details: { changedFields: Object.keys(input), unassignedMachineCount: unassigned.count }
        }
      });

      return updated;
    });

    res.json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "A user with this email already exists");
    }

    throw error;
  }
});
