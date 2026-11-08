import { Router } from "express";
import type { AppDeps } from "../../deps.js";

// A router is a mini-app: a group of routes mounted under a path prefix by app.ts.
// Each feature module exports a factory that receives only the dependencies it needs
// (Pick<AppDeps, ...>), so its real requirements are visible in the signature and a
// test only has to supply those.
//
// Two probes, because orchestrators (Kubernetes etc.) ask two different questions:
//   live  - "is the process running?"  Failing => restart it. Must not touch dependencies,
//           or a database blip would restart every healthy instance.
//   ready - "can it serve traffic?"    Failing => stop routing requests to it, don't restart.
export function createHealthRouter({ prisma }: Pick<AppDeps, "prisma">): Router {
  const router = Router();

  router.get("/live", (_req, res) => {
    res.json({ status: "ok" });
  });

  router.get("/ready", async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok", checks: { database: "ok" } });
    } catch (err) {
      req.log.error({ err }, "readiness check failed");
      res.status(503).json({ status: "unavailable", checks: { database: "failing" } });
    }
  });

  return router;
}
