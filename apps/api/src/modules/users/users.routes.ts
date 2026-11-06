import { Prisma, Role } from "@prisma/client";
import { Router } from "express";
import { HttpError } from "../../lib/httpError.js";
import { prisma } from "../../lib/prisma.js";
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

  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: normalizeEmail(input.email),
        passwordHash: await hashPassword(input.password),
        role: input.role
      },
      select: publicUserSelect
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: "USER_CREATED",
        entityType: "User",
        entityId: user.id,
        details: { role: user.role }
      }
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
  const current = await prisma.user.findUnique({ where: { id: req.params.id } });

  if (!current) {
    throw new HttpError(404, "User not found");
  }

  if (current.id === req.user!.id && input.isActive === false) {
    throw new HttpError(400, "You cannot deactivate your own account");
  }

  try {
    const user = await prisma.user.update({
      where: { id: current.id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.email ? { email: normalizeEmail(input.email) } : {}),
        ...(input.role ? { role: input.role } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.password ? { passwordHash: await hashPassword(input.password) } : {})
      },
      select: publicUserSelect
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: "USER_UPDATED",
        entityType: "User",
        entityId: user.id,
        details: { changedFields: Object.keys(input) }
      }
    });

    res.json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "A user with this email already exists");
    }

    throw error;
  }
});
