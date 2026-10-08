import { Router } from "express";

export const healthRouter = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Check whether the API is running.
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: API is healthy.
 */
healthRouter.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "maintenance-report-api",
    timestamp: new Date().toISOString()
  });
});
