import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1).default("postgresql://maintenance_user:maintenance_password@localhost:5432/maintenance_db?schema=public"),
  JWT_SECRET: z.string().min(32).default("dev-only-secret-change-before-final-demo-123456"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  LOG_LEVEL: z.string().default("info")
});

export const env = envSchema.parse(process.env);
