import { Router } from "express";
import { routeParam } from "../../lib/routeParam.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";
import { createMachinePartSchema, updateMachinePartSchema } from "./machines.schemas.js";
import {
  createMachinePart,
  deleteMachinePart,
  listMachineParts,
  machineReadRoles,
  machineWriteRoles,
  nestedDeleteRoles,
  updateMachinePart
} from "./machines.service.js";

export const machinePartsRouter = Router({ mergeParams: true });

machinePartsRouter.use(requireAuth);

machinePartsRouter.get("/", requireRoles(...machineReadRoles), async (req, res) => {
  res.json({ parts: await listMachineParts(routeParam(req.params.machineId), req.user!) });
});

machinePartsRouter.post("/", requireRoles(...machineWriteRoles), async (req, res) => {
  const part = await createMachinePart(
    routeParam(req.params.machineId),
    createMachinePartSchema.parse(req.body),
    req.user!,
    req.ip
  );
  res.status(201).json({ part });
});

machinePartsRouter.patch("/:partId", requireRoles(...machineWriteRoles), async (req, res) => {
  const part = await updateMachinePart(
    routeParam(req.params.machineId),
    routeParam(req.params.partId),
    updateMachinePartSchema.parse(req.body),
    req.user!,
    req.ip
  );
  res.json({ part });
});

machinePartsRouter.delete("/:partId", requireRoles(...nestedDeleteRoles), async (req, res) => {
  await deleteMachinePart(
    routeParam(req.params.machineId),
    routeParam(req.params.partId),
    req.user!,
    req.ip
  );
  res.status(204).send();
});
