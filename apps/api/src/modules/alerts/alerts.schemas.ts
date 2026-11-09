import { AlertStatus, AlertType } from "@prisma/client";
import { z } from "zod";

export const listAlertsQuerySchema = z.object({
  status: z.union([z.nativeEnum(AlertStatus), z.literal("ALL")]).default("ALL"),
  type: z.union([z.nativeEnum(AlertType), z.literal("ALL")]).default("ALL")
});

