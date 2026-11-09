import { MachineStatus, MaintenanceFrequency } from "@prisma/client";
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

const optionalDate = z.union([calendarDate, z.null()]).optional();

const assetCode = requiredText(50).transform((value) => value.toUpperCase());

const machineFields = {
  assetCode,
  name: requiredText(120),
  category: requiredText(100),
  location: requiredText(150),
  manufacturer: optionalText(100),
  model: optionalText(100),
  serialNumber: optionalText(100),
  warrantyStart: optionalDate,
  warrantyEnd: optionalDate,
  status: z.nativeEnum(MachineStatus).optional(),
  operatorId: z.union([z.string().uuid(), z.null()]).optional()
};

export const createMachineSchema = z.object(machineFields).strict();

export const updateMachineSchema = z
  .object({
    assetCode: assetCode.optional(),
    name: machineFields.name.optional(),
    category: machineFields.category.optional(),
    location: machineFields.location.optional(),
    manufacturer: machineFields.manufacturer,
    model: machineFields.model,
    serialNumber: machineFields.serialNumber,
    warrantyStart: machineFields.warrantyStart,
    warrantyEnd: machineFields.warrantyEnd,
    status: machineFields.status,
    operatorId: machineFields.operatorId
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const partFields = {
  name: requiredText(120),
  partNumber: optionalText(100),
  warrantyStart: optionalDate,
  warrantyEnd: optionalDate,
  replacementDue: optionalDate,
  quantity: z.coerce.number().int().min(1).max(100_000).optional()
};

export const createMachinePartSchema = z.object(partFields).strict();

export const updateMachinePartSchema = z
  .object({
    name: partFields.name.optional(),
    partNumber: partFields.partNumber,
    warrantyStart: partFields.warrantyStart,
    warrantyEnd: partFields.warrantyEnd,
    replacementDue: partFields.replacementDue,
    quantity: partFields.quantity
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const planFields = {
  title: requiredText(150),
  description: optionalText(2_000),
  frequency: z.nativeEnum(MaintenanceFrequency),
  intervalDays: z.union([z.coerce.number().int().min(1).max(3_650), z.null()]).optional(),
  nextDueDate: calendarDate,
  thresholdDays: z.coerce.number().int().min(0).max(365).optional(),
  isActive: z.boolean().optional()
};

export const createMaintenancePlanSchema = z
  .object(planFields)
  .strict()
  .refine(
    (value) => value.frequency !== MaintenanceFrequency.CUSTOM || value.intervalDays != null,
    { message: "intervalDays is required for custom frequency", path: ["intervalDays"] }
  );

export const updateMaintenancePlanSchema = z
  .object({
    title: planFields.title.optional(),
    description: planFields.description,
    frequency: planFields.frequency.optional(),
    intervalDays: planFields.intervalDays,
    nextDueDate: planFields.nextDueDate.optional(),
    thresholdDays: planFields.thresholdDays,
    isActive: planFields.isActive
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export type CreateMachineInput = z.infer<typeof createMachineSchema>;
export type UpdateMachineInput = z.infer<typeof updateMachineSchema>;
export type CreateMachinePartInput = z.infer<typeof createMachinePartSchema>;
export type UpdateMachinePartInput = z.infer<typeof updateMachinePartSchema>;
export type CreateMaintenancePlanInput = z.infer<typeof createMaintenancePlanSchema>;
export type UpdateMaintenancePlanInput = z.infer<typeof updateMaintenancePlanSchema>;
