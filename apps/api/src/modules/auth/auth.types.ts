import type { Role } from "@prisma/client";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
};

export type AuthTokenPayload = {
  sub: string;
  role: Role;
};
