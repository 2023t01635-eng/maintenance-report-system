import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { app } from "./app.js";
import { startAlertScheduler } from "./modules/alerts/alerts.scheduler.js";

const server = app.listen(env.API_PORT, () => {
  logger.info(`API server running on http://localhost:${env.API_PORT}`);
});
const alertScheduler = startAlertScheduler();
let shuttingDown = false;

const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("Shutting down API server");
  const serverClosed = new Promise<void>((resolve) => server.close(() => resolve()));
  void Promise.all([serverClosed, alertScheduler.stop()])
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error({ error }, "API shutdown failed");
      process.exit(1);
    });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
