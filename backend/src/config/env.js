import dotenv from "dotenv";
import { z } from "zod";

// Load environment variables from .env if present
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z
    .string()
    .default("8000")
    .transform((val) => parseInt(val, 10)),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  MONGODB_URI: z
    .string()
    .default("mongodb://localhost:27017"),
  JWT_SECRET: z
    .string()
    .min(16, "JWT_SECRET must be at least 16 characters long")
    .default("supersecretjwtkeyforlocaldevelopmentonlychangeinprod_min32chars"),
  JWT_EXPIRY: z.string().default("7d"),
  ACCESS_TOKEN_SECRET: z
    .string()
    .min(16)
    .default(process.env.JWT_SECRET || "supersecretjwtkeyforlocaldevelopmentonlychangeinprod_min32chars"),
  ACCESS_TOKEN_EXPIRY: z.string().default("1d"),
  REFRESH_TOKEN_SECRET: z
    .string()
    .min(16)
    .default(process.env.JWT_SECRET || "supersecretjwtkeyforlocaldevelopmentonlychangeinprod_min32chars"),
  REFRESH_TOKEN_EXPIRY: z.string().default("10d"),
  REDIS_URL: z.string().optional(),
  POOL_DURATION_HOURS: z
    .string()
    .default("72")
    .transform((val) => parseInt(val, 10)),
  UNDER_MOQ_DECISION_HOURS: z
    .string()
    .default("24")
    .transform((val) => parseInt(val, 10)),
  DEFAULT_RETAILER_MOQ_PERCENT: z
    .string()
    .default("20")
    .transform((val) => parseFloat(val)),
  DEFAULT_RETAILER_STEP_PERCENT: z
    .string()
    .default("1")
    .transform((val) => parseFloat(val)),
  PAYMENT_MODE: z
    .enum(["sandbox", "mock"])
    .default("mock"),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  MAX_UPLOAD_SIZE_MB: z
    .string()
    .default("10")
    .transform((val) => parseInt(val, 10)),
  AI_API_KEY: z.string().optional().default("mock_ai_api_key"),
  AI_PROVIDER: z.enum(["gemini", "openai", "mock"]).default("mock"),
  AI_MODEL: z.string().default("gemini-1.5-flash"),
  AI_TIMEOUT_MS: z
    .string()
    .default("15000")
    .transform((val) => parseInt(val, 10)),
});

export const validateEnv = (customEnv = process.env) => {
  const parsed = envSchema.safeParse(customEnv);
  if (!parsed.success) {
    const formattedErrors = parsed.error.format();
    console.error("FATAL: Environment variable validation failed:", JSON.stringify(formattedErrors, null, 2));
    throw new Error(`Environment validation failed: ${parsed.error.message}`);
  }
  return parsed.data;
};

export const env = validateEnv();
export default env;

