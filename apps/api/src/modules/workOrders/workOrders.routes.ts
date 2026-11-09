import { Role } from "@prisma/client";
import { Router } from "express";
import { routeParam } from "../../lib/routeParam.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";
import {
  createEvidenceSchema,
  createWorkOrderSchema,
  sendToProviderSchema,
  updateServiceDetailsSchema,
  updateWorkOrderSchema
} from "./workOrders.schemas.js";
import {
  addServiceEvidence,
  approveWorkOrder,
  cancelWorkOrder,
  completeWorkOrder,
  createWorkOrder,
  getWorkOrder,
  listActiveProviders,
  listWorkOrders,
  sendWorkOrderToProvider,
  startWorkOrder,
  submitWorkOrder,
  updateServiceDetails,
  updateWorkOrder,
  workOrderManagementRoles,
  workOrderReadRoles
} from "./workOrders.service.js";

export const workOrdersRouter = Router();

workOrdersRouter.use(requireAuth);

workOrdersRouter.get("/", requireRoles(...workOrderReadRoles), async (req, res) => {
  res.json({ workOrders: await listWorkOrders(req.user!) });
});

workOrdersRouter.get("/providers", requireRoles(...workOrderManagementRoles), async (_req, res) => {
  res.json({ providers: await listActiveProviders() });
});

workOrdersRouter.get("/:id", requireRoles(...workOrderReadRoles), async (req, res) => {
  res.json({ workOrder: await getWorkOrder(routeParam(req.params.id), req.user!) });
});

workOrdersRouter.post("/", requireRoles(...workOrderManagementRoles), async (req, res) => {
  const input = createWorkOrderSchema.parse(req.body);
  const workOrder = await createWorkOrder(input, req.user!, req.ip);
  res.status(201).json({ workOrder });
});

workOrdersRouter.patch("/:id", requireRoles(...workOrderManagementRoles), async (req, res) => {
  const input = updateWorkOrderSchema.parse(req.body);
  res.json({ workOrder: await updateWorkOrder(routeParam(req.params.id), input, req.user!, req.ip) });
});

workOrdersRouter.patch(
  "/:id/service-details",
  requireRoles(Role.SERVICE_PROVIDER),
  async (req, res) => {
    const input = updateServiceDetailsSchema.parse(req.body);
    res.json({ workOrder: await updateServiceDetails(routeParam(req.params.id), input, req.user!, req.ip) });
  }
);

workOrdersRouter.post("/:id/submit", requireRoles(...workOrderManagementRoles), async (req, res) => {
  res.json({ workOrder: await submitWorkOrder(routeParam(req.params.id), req.user!, req.ip) });
});

workOrdersRouter.post("/:id/approve", requireRoles(Role.MACHINE_OPERATOR), async (req, res) => {
  res.json({ workOrder: await approveWorkOrder(routeParam(req.params.id), req.user!, req.ip) });
});

workOrdersRouter.post("/:id/send-to-provider", requireRoles(...workOrderManagementRoles), async (req, res) => {
  const input = sendToProviderSchema.parse(req.body);
  res.json({
    workOrder: await sendWorkOrderToProvider(routeParam(req.params.id), input.providerId, req.user!, req.ip)
  });
});

workOrdersRouter.post("/:id/start", requireRoles(Role.SERVICE_PROVIDER), async (req, res) => {
  res.json({ workOrder: await startWorkOrder(routeParam(req.params.id), req.user!, req.ip) });
});

workOrdersRouter.post("/:id/complete", requireRoles(Role.SERVICE_PROVIDER), async (req, res) => {
  res.json({ workOrder: await completeWorkOrder(routeParam(req.params.id), req.user!, req.ip) });
});

workOrdersRouter.post("/:id/cancel", requireRoles(...workOrderManagementRoles), async (req, res) => {
  res.json({ workOrder: await cancelWorkOrder(routeParam(req.params.id), req.user!, req.ip) });
});

workOrdersRouter.post("/:id/evidence", requireRoles(Role.SERVICE_PROVIDER), async (req, res) => {
  const input = createEvidenceSchema.parse(req.body);
  const evidence = await addServiceEvidence(routeParam(req.params.id), input, req.user!, req.ip);
  res.status(201).json({ evidence });
});
