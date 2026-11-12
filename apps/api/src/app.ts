import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { swaggerSpec, swaggerUi } from "./docs/swagger.js";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { alertsRouter } from "./modules/alerts/alerts.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { machinePartsRouter } from "./modules/machines/machineParts.routes.js";
import { machinesRouter } from "./modules/machines/machines.routes.js";
import { maintenancePlansRouter } from "./modules/machines/maintenancePlans.routes.js";
import { operatorsRouter } from "./modules/operators/operators.routes.js";
import { organizationRouter } from "./modules/organization/organization.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { workOrdersRouter } from "./modules/workOrders/workOrders.routes.js";

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(pinoHttp({ logger }));

app.get("/api", (_req, res) => {
  res.json({
    name: "Maintenance Request Reporting System API",
    version: "0.1.0",
    docs: "/api/docs",
    health: "/api/health"
  });
});

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/users", usersRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/operators", operatorsRouter);
app.use("/api/organization-profile", organizationRouter);
app.use("/api/machines/:machineId/parts", machinePartsRouter);
app.use("/api/machines/:machineId/plans", maintenancePlansRouter);
app.use("/api/machines", machinesRouter);
app.use("/api/work-orders", workOrdersRouter);
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(notFound);
app.use(errorHandler);
