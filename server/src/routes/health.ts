import { Router } from "express";

const router = Router();

/**
 * GET /api/health
 * Basic health-check endpoint — used by the client to confirm
 * the server is reachable before any agent logic is added.
 */
router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "ai-agent-server",
  });
});

export default router;
