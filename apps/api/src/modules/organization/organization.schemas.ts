import { z } from "zod";

const optionalText = (maximum: number) =>
  z.union([z.string().trim().max(maximum), z.null()]).transform((value) => value || null);

export const updateOrganizationProfileSchema = z
  .object({
    companyName: z.string().trim().min(2).max(180),
    address: optionalText(500),
    registrationNumber: optionalText(120),
    phone: optionalText(80),
    email: z
      .union([z.string().trim().email().max(180), z.literal(""), z.null()])
      .transform((value) => value || null)
  })
  .strict();

export type UpdateOrganizationProfileInput = z.infer<typeof updateOrganizationProfileSchema>;
