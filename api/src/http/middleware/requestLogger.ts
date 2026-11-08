import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import type { Logger } from "../../infra/logger.js";

// Accept a caller-supplied correlation id (e.g. from a gateway) only if it is a
// short, harmless token; otherwise mint our own.
const SAFE_REQUEST_ID = /^[\w-]{1,128}$/;

// Adds req.log, a child logger that stamps every line with the request id, and logs one
// line per completed request. Mount first so every later middleware and the error
// handler can use it.
export function requestLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId(req, res) {
      const incoming = req.headers["x-request-id"];
      const id = typeof incoming === "string" && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
      res.setHeader("x-request-id", id);
      return id;
    },
    // Allowlist what gets logged. The default serializers dump every header, which is
    // noisy and one forgotten header away from leaking a secret. The redact list in
    // infra/logger.ts remains as a second line of defence.
    serializers: {
      req: (req: { id: unknown; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    // Health probes fire every few seconds; don't drown the logs in them.
    autoLogging: { ignore: (req) => req.url?.startsWith("/health") ?? false },
    customLogLevel(_req, res, err) {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
  });
}
