import type { Role, User } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { HttpError } from "../../lib/httpError.js";
import { prisma } from "../../lib/prisma.js";
import { AUTH_TOKEN_LIFETIME } from "./auth.constants.js";
import type { AuthTokenPayload, AuthUser } from "./auth.types.js";

export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true
} as const;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function toAuthUser(user: Pick<User, "id" | "name" | "email" | "role" | "isActive">): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive
  };
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function authenticateUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });

  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, "Invalid email or password");
  }

  return user;
}

export function createAuthToken(user: { id: string; role: Role }) {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: AUTH_TOKEN_LIFETIME
  });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);

    if (typeof payload === "string" || !payload.sub || typeof payload.role !== "string") {
      throw new Error("Invalid token payload");
    }

    return { sub: payload.sub, role: payload.role as Role };
  } catch {
    throw new HttpError(401, "Authentication required");
  }
}
