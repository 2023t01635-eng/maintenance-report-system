import { Role } from "@prisma/client";
import { Router } from "express";
import { routeParam } from "../../lib/routeParam.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";
import { listAlertsQuerySchema } from "./alerts.schemas.js";
import { acknowledgeAlert, listAlerts, runAlertScheduler } from "./alerts.service.js";

export const alertsRouter = Router();
const alertReadRoles = [Role.ADMIN, Role.OWNER, Role.MANAGER, Role.MACHINE_OPERATOR] as const;

alertsRouter.use(requireAuth, requireRoles(...alertReadRoles));
alertsRouter.get("/", async (req, res) => {
  res.json(await listAlerts(req.user!, listAlertsQuerySchema.parse(req.query)));
});
alertsRouter.patch("/:alertId/acknowledge", async (req, res) => {
  res.json({ alert: await acknowledgeAlert(routeParam(req.params.alertId), req.user!, req.ip) });
});
alertsRouter.post("/run-scheduler", requireRoles(Role.ADMIN, Role.MANAGER), async (req, res) => {
  res.json({ result: await runAlertScheduler(new Date(), req.user!, req.ip) });
});

