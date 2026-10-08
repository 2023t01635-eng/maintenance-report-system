import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { app } from "./app.js";

const server = app.listen(env.API_PORT, () => {
  logger.info(`API server running on http://localhost:${env.API_PORT}`);
});

const shutdown = async () => {
  logger.info("Shutting down API server");
  await prisma.$disconnect();
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
