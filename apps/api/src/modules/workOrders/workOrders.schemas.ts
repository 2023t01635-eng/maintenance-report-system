import { EvidenceType, WorkOrderCategory, WorkOrderPriority } from "@prisma/client";
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
  sourceAlertId: nullableUuid,
  title: requiredText(150),
  description: optionalText(5_000),
  category: z.nativeEnum(WorkOrderCategory).optional(),
  priority: z.nativeEnum(WorkOrderPriority).optional(),
  scheduledDate: nullableDate,
  replacedParts: optionalText(5_000),
  notes: optionalText(5_000)
};

export const createWorkOrderSchema = z.object(draftFields).strict();

export const updateWorkOrderSchema = z
  .object({
    machineId: draftFields.machineId.optional(),
    providerId: draftFields.providerId,
    sourceAlertId: draftFields.sourceAlertId,
    title: draftFields.title.optional(),
    description: draftFields.description,
    category: draftFields.category,
    priority: draftFields.priority,
    scheduledDate: draftFields.scheduledDate,
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
export const approveAndDispatchSchema = z
  .object({
    providerId: z.string().uuid(),
    proposedBudget: z.coerce.number().finite().min(0).max(9_999_999_999.99)
  })
  .strict();
export const rejectWorkOrderSchema = z.object({ reason: optionalText(2_000) }).strict();
export const approvePaymentSchema = z.object({ paymentReference: optionalText(150) }).strict();
export const counterPaymentSchema = z
  .object({
    counterBudget: z.coerce.number().finite().min(0).max(9_999_999_999.99),
    reason: requiredText(2_000)
  })
  .strict();

export const updateServiceDetailsSchema = z
  .object({
    completedDate: nullableDate,
    serviceCost: nullableCost,
    replacedParts: optionalText(5_000),
    notes: optionalText(5_000),
    providerBusinessName: optionalText(180),
    providerAddress: optionalText(500),
    providerRegistrationNumber: optionalText(120),
    providerContact: optionalText(180),
    invoiceNumber: optionalText(120)
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const createReplacementSchema = z
  .object({
    machinePartId: nullableUuid,
    partName: requiredText(120),
    partNumber: optionalText(100),
    quantity: z.coerce.number().int().min(1).max(100_000),
    unitCost: nullableCost,
    warrantyStart: nullableDate,
    warrantyEnd: nullableDate,
    nextReplacementDate: nullableDate,
    notes: optionalText(2_000)
  })
  .strict()
  .refine(
    (value) => !value.warrantyStart || !value.warrantyEnd || value.warrantyEnd >= value.warrantyStart,
    { message: "Warranty end date must be on or after the start date", path: ["warrantyEnd"] }
  );

export const updateReplacementSchema = createReplacementSchema;

export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;
export type CreateEvidenceInput = z.infer<typeof createEvidenceSchema>;
export type SendToProviderInput = z.infer<typeof sendToProviderSchema>;
export type ApproveAndDispatchInput = z.infer<typeof approveAndDispatchSchema>;
export type UpdateServiceDetailsInput = z.infer<typeof updateServiceDetailsSchema>;
export type RejectWorkOrderInput = z.infer<typeof rejectWorkOrderSchema>;
export type ApprovePaymentInput = z.infer<typeof approvePaymentSchema>;
export type CounterPaymentInput = z.infer<typeof counterPaymentSchema>;
export type CreateReplacementInput = z.infer<typeof createReplacementSchema>;
export type UpdateReplacementInput = z.infer<typeof updateReplacementSchema>;
