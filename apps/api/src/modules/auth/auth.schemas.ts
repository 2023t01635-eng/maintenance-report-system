import { Role } from "@prisma/client";
import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must contain at least 8 characters")
  .max(72, "Password must contain at most 72 characters");

export const setupAdminSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  password: passwordSchema
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(72)
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  password: passwordSchema,
  role: z.nativeEnum(Role)
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    email: z.string().trim().email().max(200).optional(),
    password: passwordSchema.optional(),
    role: z.nativeEnum(Role).optional(),
    isActive: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");
