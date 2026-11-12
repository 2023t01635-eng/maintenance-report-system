import { Role } from "@prisma/client";
import { Router } from "express";
import { routeParam } from "../../lib/routeParam.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";
import {
  approveAndDispatchSchema,
  approvePaymentSchema,
  counterPaymentSchema,
  createReplacementSchema,
  createEvidenceSchema,
  createWorkOrderSchema,
  rejectWorkOrderSchema,
  sendToProviderSchema,
  updateServiceDetailsSchema,
  updateReplacementSchema,
  updateWorkOrderSchema
} from "./workOrders.schemas.js";
import {
  acceptWorkOrder,
  addReplacement,
  addServiceEvidence,
  approveAndDispatchWorkOrder,
  approvePayment,
  approveWorkOrder,
  cancelWorkOrder,
  counterPayment,
  completeWorkOrder,
  createWorkOrder,
  deleteReplacement,
  getWorkOrder,
  listActiveProviders,
  listWorkOrders,
  rejectWorkOrder,
  sendWorkOrderToProvider,
  startWorkOrder,
  submitCompletion,
  submitWorkOrder,
  updateServiceDetails,
  updateReplacement,
  updateWorkOrder,
  workOrderCreateRoles,
  workOrderManagementRoles,
  workOrderCounterRoles,
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

workOrdersRouter.post("/", requireRoles(...workOrderCreateRoles), async (req, res) => {
  const input = createWorkOrderSchema.parse(req.body);
  res.status(201).json({ workOrder: await createWorkOrder(input, req.user!, req.ip) });
});

workOrdersRouter.patch("/:id", requireRoles(...workOrderCreateRoles), async (req, res) => {
  const input = updateWorkOrderSchema.parse(req.body);
  res.json({ workOrder: await updateWorkOrder(routeParam(req.params.id), input, req.user!, req.ip) });
});

workOrdersRouter.patch("/:id/service-details", requireRoles(Role.SERVICE_PROVIDER), async (req, res) => {
  const input = updateServiceDetailsSchema.parse(req.body);
  res.json({ workOrder: await updateServiceDetails(routeParam(req.params.id), input, req.user!, req.ip) });
});

workOrdersRouter.post("/:id/submit", requireRoles(...workOrderCreateRoles), async (req, res) => {
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

workOrdersRouter.post("/:id/approve-and-dispatch", requireRoles(...workOrderManagementRoles), async (req, res) => {
  const input = approveAndDispatchSchema.parse(req.body);
  res.json({
    workOrder: await approveAndDispatchWorkOrder(routeParam(req.params.id), input, req.user!, req.ip)
  });
});

workOrdersRouter.post("/:id/reject", requireRoles(...workOrderManagementRoles), async (req, res) => {
  const input = rejectWorkOrderSchema.parse(req.body);
  res.json({ workOrder: await rejectWorkOrder(routeParam(req.params.id), input, req.user!, req.ip) });
});

workOrdersRouter.post("/:id/accept", requireRoles(Role.SERVICE_PROVIDER), async (req, res) => {
  res.json({ workOrder: await acceptWorkOrder(routeParam(req.params.id), req.user!, req.ip) });
});

workOrdersRouter.post("/:id/start", requireRoles(Role.SERVICE_PROVIDER), async (req, res) => {
  res.json({ workOrder: await startWorkOrder(routeParam(req.params.id), req.user!, req.ip) });
});

workOrdersRouter.post("/:id/complete", requireRoles(Role.SERVICE_PROVIDER), async (req, res) => {
  res.json({ workOrder: await completeWorkOrder(routeParam(req.params.id), req.user!, req.ip) });
});

workOrdersRouter.post("/:id/submit-completion", requireRoles(Role.SERVICE_PROVIDER), async (req, res) => {
  res.json({ workOrder: await submitCompletion(routeParam(req.params.id), req.user!, req.ip) });
});

workOrdersRouter.post("/:id/replacements", requireRoles(Role.SERVICE_PROVIDER), async (req, res) => {
  const input = createReplacementSchema.parse(req.body);
  const replacement = await addReplacement(routeParam(req.params.id), input, req.user!, req.ip);
  res.status(201).json({ replacement });
});

workOrdersRouter.delete(
  "/:id/replacements/:replacementId",
  requireRoles(Role.SERVICE_PROVIDER),
  async (req, res) => {
    await deleteReplacement(
      routeParam(req.params.id),
      routeParam(req.params.replacementId),
      req.user!,
      req.ip
    );
    res.status(204).send();
  }
);

workOrdersRouter.patch(
  "/:id/replacements/:replacementId",
  requireRoles(Role.SERVICE_PROVIDER),
  async (req, res) => {
    const input = updateReplacementSchema.parse(req.body);
    const replacement = await updateReplacement(
      routeParam(req.params.id),
      routeParam(req.params.replacementId),
      input,
      req.user!,
      req.ip
    );
    res.json({ replacement });
  }
);

workOrdersRouter.post("/:id/counter-payment", requireRoles(...workOrderCounterRoles), async (req, res) => {
  const input = counterPaymentSchema.parse(req.body);
  res.json({ workOrder: await counterPayment(routeParam(req.params.id), input, req.user!, req.ip) });
});

workOrdersRouter.post("/:id/approve-payment", requireRoles(...workOrderManagementRoles), async (req, res) => {
  const input = approvePaymentSchema.parse(req.body);
  res.json({ workOrder: await approvePayment(routeParam(req.params.id), input, req.user!, req.ip) });
});

workOrdersRouter.post("/:id/cancel", requireRoles(...workOrderManagementRoles), async (req, res) => {
  res.json({ workOrder: await cancelWorkOrder(routeParam(req.params.id), req.user!, req.ip) });
});

workOrdersRouter.post("/:id/evidence", requireRoles(Role.SERVICE_PROVIDER), async (req, res) => {
  const input = createEvidenceSchema.parse(req.body);
  const evidence = await addServiceEvidence(routeParam(req.params.id), input, req.user!, req.ip);
  res.status(201).json({ evidence });
});
