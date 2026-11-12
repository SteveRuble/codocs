import { z } from "zod";

// Environment variables are untyped strings from outside the process: parse them
// once, at startup, into a typed immutable object. Nothing else reads process.env.
//
// There are deliberately no defaults for WEB_ORIGIN or DATABASE_URL: a missing value
// in production should stop the process, not silently point at a dev database.
// For local dev, copy .env.example to .env.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  WEB_ORIGIN: z.url(),
  DATABASE_URL: z.string().min(1),
  // Shared HS256 key: the Next.js app signs tokens with it and we verify them. Anyone who
  // knows it can mint a token for any user, so it is required, never defaulted, and must be
  // long enough to resist guessing. Generate one with:
  //   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  API_JWT_SECRET: z.string().min(32, "must be at least 32 characters"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

// A pure function of its input (the env object is a parameter), so tests can call
// loadConfig({...}) with whatever they want instead of mutating process.env.
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  const e = result.data;
  return Object.freeze({
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    webOrigin: e.WEB_ORIGIN,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.API_JWT_SECRET,
    logLevel: e.LOG_LEVEL,
  });
}

export type Config = ReturnType<typeof loadConfig>;
