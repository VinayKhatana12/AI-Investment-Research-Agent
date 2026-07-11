import { Router, Request, Response } from "express";
import { graph } from "../agent/graph";

const router = Router();

// ─── POST /api/agent ──────────────────────────────────────────────────────────
/**
 * Accepts:  POST  { "companyName": "Tata Motors" }
 *           Content-Type: application/json
 *
 * Returns:  200  { companyName, verdict: { decision, confidence, keyReasons, risks }, debug }
 *           400  companyName missing / empty / too long
 *           415  non-JSON Content-Type
 *           500  graph threw or produced no verdict
 */
router.post("/agent", async (req: Request, res: Response) => {
  // ── 415 guard: body must be JSON ─────────────────────────────────────────────
  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.includes("application/json")) {
    res.status(415).json({
      error: "Content-Type must be application/json.",
    });
    return;
  }

  // ── 400 guard: companyName validation ────────────────────────────────────────
  const { companyName } = req.body as { companyName?: unknown };

  if (!companyName || typeof companyName !== "string") {
    res.status(400).json({
      error: "Request body must include a 'companyName' string field.",
    });
    return;
  }

  const trimmed = companyName.trim();

  if (trimmed.length === 0) {
    res.status(400).json({ error: "'companyName' must not be empty." });
    return;
  }

  if (trimmed.length > 120) {
    res.status(400).json({
      error: "'companyName' must be 120 characters or fewer.",
    });
    return;
  }

  // ── Run graph ─────────────────────────────────────────────────────────────────
  try {
    console.log(`[/api/agent] Starting research for: "${trimmed}"`);
    const t0 = Date.now();

    const result = await graph.invoke({
      companyName: trimmed,
      messages: [],
    });

    const elapsed = Date.now() - t0;
    const { verdict, iterations } = result;

    if (!verdict) {
      console.error("[/api/agent] Graph returned no verdict");
      res.status(500).json({ error: "Agent did not produce a verdict." });
      return;
    }

    console.log(
      `[/api/agent] Done in ${elapsed}ms — ${verdict.decision} @ ${verdict.confidence}%`
    );

    res.json({
      companyName: trimmed,
      verdict,                   // { decision, confidence, keyReasons, risks }
      debug: { iterations, elapsedMs: elapsed },
    });
  } catch (err) {
    console.error("[/api/agent] Graph error:", err);
    const msg =
      err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: msg });
  }
});

// ─── 405 for any other verb on /api/agent ────────────────────────────────────
router.all("/agent", (_req: Request, res: Response) => {
  res.set("Allow", "POST").status(405).json({
    error: "Method not allowed. Use POST /api/agent.",
  });
});

export default router;
