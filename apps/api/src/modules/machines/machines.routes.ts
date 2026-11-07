import { Role } from "@prisma/client";
import { Router } from "express";
import { HttpError } from "../../lib/httpError.js";
import { routeParam } from "../../lib/routeParam.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";
import { createMachineSchema, updateMachineSchema } from "./machines.schemas.js";
import {
  createMachine,
  deleteMachine,
  getMachine,
  isUniqueConstraintError,
  listMachines,
  machineReadRoles,
  machineWriteRoles,
  updateMachine
} from "./machines.service.js";

export const machinesRouter = Router();

machinesRouter.use(requireAuth);

machinesRouter.get("/", requireRoles(...machineReadRoles), async (req, res) => {
  res.json({ machines: await listMachines(req.user!) });
});

machinesRouter.get("/:id", requireRoles(...machineReadRoles), async (req, res) => {
  res.json({ machine: await getMachine(req.user!, routeParam(req.params.id)) });
});

machinesRouter.post("/", requireRoles(...machineWriteRoles), async (req, res) => {
  const input = createMachineSchema.parse(req.body);
  try {
    const machine = await createMachine(input, req.user!, req.ip);
    res.status(201).json({ machine });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new HttpError(409, "A machine with this asset code already exists");
    }
    throw error;
  }
});

machinesRouter.patch("/:id", requireRoles(...machineWriteRoles), async (req, res) => {
  const input = updateMachineSchema.parse(req.body);
  try {
    res.json({ machine: await updateMachine(routeParam(req.params.id), input, req.user!, req.ip) });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new HttpError(409, "A machine with this asset code already exists");
    }
    throw error;
  }
});

machinesRouter.delete("/:id", requireRoles(Role.ADMIN), async (req, res) => {
  await deleteMachine(routeParam(req.params.id), req.user!, req.ip);
  res.status(204).send();
});
