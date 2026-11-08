import { pino, type Logger } from "pino";
import type { Config } from "../config.js";

export type { Logger };

export function createLogger(config: Pick<Config, "nodeEnv" | "logLevel">): Logger {
  return pino({
    level: config.logLevel,
    // Never log credentials. Paths are relative to the serialized request object.
    redact: ["req.headers.authorization", "req.headers.cookie"],
    // Human-readable output only in development; production emits one JSON object per
    // line, which log aggregators parse natively.
    transport: config.nodeEnv === "development" ? { target: "pino-pretty" } : undefined,
  });
}
