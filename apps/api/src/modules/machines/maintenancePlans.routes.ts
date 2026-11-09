import { Router } from "express";
import { routeParam } from "../../lib/routeParam.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";
import { createMaintenancePlanSchema, updateMaintenancePlanSchema } from "./machines.schemas.js";
import {
  createMaintenancePlan,
  deleteMaintenancePlan,
  listMaintenancePlans,
  machineReadRoles,
  maintenancePlanWriteRoles,
  nestedDeleteRoles,
  updateMaintenancePlan
} from "./machines.service.js";

export const maintenancePlansRouter = Router({ mergeParams: true });

maintenancePlansRouter.use(requireAuth);

maintenancePlansRouter.get("/", requireRoles(...machineReadRoles), async (req, res) => {
  res.json({ plans: await listMaintenancePlans(routeParam(req.params.machineId), req.user!) });
});

maintenancePlansRouter.post("/", requireRoles(...maintenancePlanWriteRoles), async (req, res) => {
  const plan = await createMaintenancePlan(
    routeParam(req.params.machineId),
    createMaintenancePlanSchema.parse(req.body),
    req.user!,
    req.ip
  );
  res.status(201).json({ plan });
});

maintenancePlansRouter.patch("/:planId", requireRoles(...maintenancePlanWriteRoles), async (req, res) => {
  const plan = await updateMaintenancePlan(
    routeParam(req.params.machineId),
    routeParam(req.params.planId),
    updateMaintenancePlanSchema.parse(req.body),
    req.user!,
    req.ip
  );
  res.json({ plan });
});

maintenancePlansRouter.delete("/:planId", requireRoles(...nestedDeleteRoles), async (req, res) => {
  await deleteMaintenancePlan(
    routeParam(req.params.machineId),
    routeParam(req.params.planId),
    req.user!,
    req.ip
  );
  res.status(204).send();
});
