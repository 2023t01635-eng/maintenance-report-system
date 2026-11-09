import { EvidenceType } from "@prisma/client";
import { z } from "zod";

const requiredText = (max: number) => z.string().trim().min(1).max(max);

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .transform((value) => (value === "" ? null : value))
    .optional();

const calendarDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Invalid calendar date")
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

const nullableUuid = z.union([z.string().uuid(), z.null()]).optional();
const nullableDate = z.union([calendarDate, z.null()]).optional();
const nullableCost = z.union([z.null(), z.coerce.number().finite().min(0).max(9_999_999_999.99)]).optional();
const optionalFileUrl = z
  .union([
    z
      .string()
      .trim()
      .max(2_048)
      .refine((value) => {
        if (value === "" || /^\/(?!\/)/.test(value)) return true;
        try {
          const url = new URL(value);
          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      }, "Use an HTTP, HTTPS, or root-relative URL"),
    z.null()
  ])
  .transform((value) => (value === "" ? null : value))
  .optional();

const draftFields = {
  machineId: z.string().uuid(),
  providerId: nullableUuid,
  title: requiredText(150),
  description: optionalText(5_000),
  scheduledDate: nullableDate,
  cost: nullableCost,
  replacedParts: optionalText(5_000),
  notes: optionalText(5_000)
};

export const createWorkOrderSchema = z.object(draftFields).strict();

export const updateWorkOrderSchema = z
  .object({
    machineId: draftFields.machineId.optional(),
    providerId: draftFields.providerId,
    title: draftFields.title.optional(),
    description: draftFields.description,
    scheduledDate: draftFields.scheduledDate,
    cost: draftFields.cost,
    replacedParts: draftFields.replacedParts,
    notes: draftFields.notes
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const createEvidenceSchema = z
  .object({
    type: z.nativeEnum(EvidenceType),
    fileName: requiredText(255),
    fileUrl: optionalFileUrl,
    notes: optionalText(5_000)
  })
  .strict();

export const sendToProviderSchema = z.object({ providerId: z.string().uuid() }).strict();

export const updateServiceDetailsSchema = z
  .object({
    completedDate: nullableDate,
    cost: nullableCost,
    replacedParts: optionalText(5_000),
    notes: optionalText(5_000)
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;
export type CreateEvidenceInput = z.infer<typeof createEvidenceSchema>;
export type SendToProviderInput = z.infer<typeof sendToProviderSchema>;
export type UpdateServiceDetailsInput = z.infer<typeof updateServiceDetailsSchema>;
