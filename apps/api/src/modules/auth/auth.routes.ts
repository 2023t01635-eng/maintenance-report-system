import { Prisma, Role } from "@prisma/client";
import { Router } from "express";
import { env } from "../../config/env.js";
import { HttpError } from "../../lib/httpError.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { AUTH_COOKIE_MAX_AGE_MS, AUTH_COOKIE_NAME } from "./auth.constants.js";
import { loginSchema, setupAdminSchema } from "./auth.schemas.js";
import {
  authenticateUser,
  createAuthToken,
  hashPassword,
  normalizeEmail,
  publicUserSelect,
  toAuthUser
} from "./auth.service.js";

export const authRouter = Router();

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  maxAge: AUTH_COOKIE_MAX_AGE_MS,
  path: "/"
};

authRouter.get("/setup-status", async (_req, res) => {
  const userCount = await prisma.user.count();
  res.json({ needsSetup: userCount === 0 });
});

authRouter.post("/setup-admin", async (req, res) => {
  const input = setupAdminSchema.parse(req.body);

  if ((await prisma.user.count()) > 0) {
    throw new HttpError(409, "Initial administrator has already been created");
  }

  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: normalizeEmail(input.email),
        passwordHash: await hashPassword(input.password),
        role: Role.ADMIN
      },
      select: publicUserSelect
    });

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "INITIAL_ADMIN_CREATED",
        entityType: "User",
        entityId: user.id
      }
    });

    const token = createAuthToken(user);
    res.cookie(AUTH_COOKIE_NAME, token, cookieOptions);
    res.status(201).json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "A user with this email already exists");
    }

    throw error;
  }
});

authRouter.post("/login", async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await authenticateUser(input.email, input.password);
  const token = createAuthToken(user);

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "USER_LOGGED_IN",
      entityType: "User",
      entityId: user.id,
      ipAddress: req.ip
    }
  });

  res.cookie(AUTH_COOKIE_NAME, token, cookieOptions);
  res.json({ user: toAuthUser(user) });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, { ...cookieOptions, maxAge: undefined });
  res.status(204).send();
});
