import type { RequestHandler } from "express";
import type { Role } from "@prisma/client";
import { HttpError } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { AUTH_COOKIE_NAME } from "../modules/auth/auth.constants.js";
import { toAuthUser, verifyAuthToken } from "../modules/auth/auth.service.js";

function readCookie(header: string | undefined, name: string) {
  const item = header
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));

  return item ? decodeURIComponent(item.slice(name.length + 1)) : undefined;
}

function getRequestToken(authorization: string | undefined, cookie: string | undefined) {
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice(7);
  }

  return readCookie(cookie, AUTH_COOKIE_NAME);
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = getRequestToken(req.header("authorization"), req.header("cookie"));

  if (!token) {
    throw new HttpError(401, "Authentication required");
  }

  const payload = verifyAuthToken(token);
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });

  if (!user || !user.isActive) {
    throw new HttpError(401, "Authentication required");
  }

  req.user = toAuthUser(user);
  next();
};

export function requireRoles(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      throw new HttpError(401, "Authentication required");
    }

    if (!roles.includes(req.user.role)) {
      throw new HttpError(403, "You do not have permission to perform this action");
    }

    next();
  };
}
