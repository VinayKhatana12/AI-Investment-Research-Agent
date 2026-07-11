/**
 * test-agent.ts  —  Research graph + investment verdict smoke-test
 *
 * Runs the full linear pipeline on "Tata Motors" and verifies that
 * state.verdict matches the exact schema:
 *   { decision: "Invest" | "Pass", confidence: 0-100, keyReasons: string[], risks: string[] }
 *
 * Usage:
 *   npm run test:agent          (from /server)
 *   npx tsx src/scripts/test-agent.ts
 *
 * Requires: TAVILY_API_KEY + GOOGLE_API_KEY in server/.env
 */

import "dotenv/config";
import { researchGraph } from "../agent/researchGraph";
import type { Verdict } from "../agent/state";

// ─── Display helpers ──────────────────────────────────────────────────────────
const D = "═".repeat(72);
const d = "─".repeat(72);

const section  = (t: string) => console.log(`\n${D}\n  ${t}\n${D}`);
const subSection = (t: string) => console.log(`\n${d}\n  ${t}\n${d}`);

/** Parse a Tavily JSON payload and print a readable preview */
function printBucket(label: string, raw: string | null) {
  subSection(label);
  if (!raw) { console.log("  (empty)"); return; }
  try {
    const p = JSON.parse(raw) as {
      answer?: string;
      results: Array<{ title: string; url: string }>;
    };
    if (p.answer) console.log(`\n  Summary: ${p.answer}\n`);
    p.results.slice(0, 3).forEach((r) =>
      console.log(`    • ${r.title}\n      ${r.url}`)
    );
  } catch {
    console.log(raw.slice(0, 400));
  }
}

/** Validate verdict shape at runtime and list any violations */
function validateVerdict(v: unknown): v is Verdict {
  const errs: string[] = [];
  if (typeof v !== "object" || v === null) { errs.push("not an object"); }
  else {
    const o = v as Record<string, unknown>;
    if (o.decision !== "Invest" && o.decision !== "Pass")
      errs.push(`decision must be "Invest"|"Pass", got: ${JSON.stringify(o.decision)}`);
    if (typeof o.confidence !== "number" || !Number.isInteger(o.confidence) || o.confidence < 0 || o.confidence > 100)
      errs.push(`confidence must be integer 0-100, got: ${JSON.stringify(o.confidence)}`);
    if (!Array.isArray(o.keyReasons) || o.keyReasons.length === 0)
      errs.push(`keyReasons must be a non-empty array, got: ${JSON.stringify(o.keyReasons)}`);
    if (!Array.isArray(o.risks) || o.risks.length === 0)
      errs.push(`risks must be a non-empty array, got: ${JSON.stringify(o.risks)}`);
  }
  if (errs.length > 0) {
    console.error("\n  ❌  Schema violations:");
    errs.forEach((e) => console.error(`       • ${e}`));
    return false;
  }
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const COMPANY = "Tata Motors";

  section(`🔍  Research Graph — "${COMPANY}"`);
  console.log("\n  fetchOverview → fetchFinancials → fetchNews → analyzeAndDecide\n");

  const t0 = Date.now();

  const result = await researchGraph.invoke({
    companyName: COMPANY,
    messages: [],
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // ── Research bucket previews ─────────────────────────────────────────────────
  section("📄  Fetched Research");
  printBucket("fetchOverview   →  state.overviewResults",    result.overviewResults as string | null);
  printBucket("fetchFinancials →  state.financialsResults",  result.financialsResults as string | null);
  printBucket("fetchNews       →  state.newsResults",        result.newsResults as string | null);

  // ── Investment Verdict ────────────────────────────────────────────────────────
  section("💼  Investment Verdict  (state.verdict)");

  const verdict = result.verdict as Verdict | null;

  if (!verdict) {
    console.error("\n  ❌  state.verdict is null — check GOOGLE_API_KEY and model availability.");
    process.exit(1);
  }

  // Raw JSON (exact shape the frontend will consume)
  console.log("\n  Raw JSON:\n");
  console.log(JSON.stringify(verdict, null, 4));

  // Human-readable breakdown
  console.log(`\n  ┌─ decision  : ${verdict.decision === "Invest" ? "✅  INVEST" : "🚫  PASS"}`);
  console.log(`  ├─ confidence: ${verdict.confidence}%`);
  console.log(`  ├─ keyReasons:`);
  verdict.keyReasons.forEach((r, i) => console.log(`  │    ${i + 1}. ${r}`));
  console.log(`  └─ risks:`);
  verdict.risks.forEach((r, i) => console.log(`       ${i + 1}. ${r}`));

  // ── Schema validation ─────────────────────────────────────────────────────────
  section("🧪  Schema Validation");

  const valid = validateVerdict(verdict);
  if (valid) {
    console.log("\n  ✅  Shape matches { decision, confidence, keyReasons, risks } exactly.");
  } else {
    process.exit(1);
  }

  // ── Summary ────────────────────────────────────────────────────────────────────
  section(`✅  Done  (${elapsed}s total)`);
  console.log(`\n  Buckets: overview=${!!result.overviewResults}  financials=${!!result.financialsResults}  news=${!!result.newsResults}`);
  console.log(`  Verdict: ${verdict.decision} @ ${verdict.confidence}% confidence`);
  console.log(`  Iterations: ${result.iterations}\n`);
}

main().catch((err) => {
  console.error("\n❌  Fatal:", err);
  process.exit(1);
});
