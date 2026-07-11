/**
 * test-tools.ts  —  searchWeb node smoke-test
 *
 * Directly exercises the `searchWeb` agent node from nodes.ts with three
 * mocked AgentState objects, each carrying a different searchQuery.
 * This confirms real Tavily results flow through before wiring into the graph.
 *
 * Usage:
 *   npm run test:tools          (from /server)
 *   npx tsx src/scripts/test-tools.ts
 *
 * Requires: TAVILY_API_KEY in server/.env
 */

import "dotenv/config";
import { searchWeb } from "../agent/nodes";
import type { AgentStateType } from "../agent/state";

// ─── Minimal state factory ────────────────────────────────────────────────────
// searchWeb reads (state as any).searchQuery — pass it alongside the required fields.
function makeState(query: string): AgentStateType & { searchQuery: string } {
  return {
    messages: [],
    companyName: "",
    overviewResults: null,
    financialsResults: null,
    newsResults: null,
    searchQuery: query,        // consumed by searchWeb
    searchResults: null,
    verdict: null,
    finalAnswer: null,
    iterations: 0,
  };
}

// ─── Display helpers ──────────────────────────────────────────────────────────
const DIVIDER = "─".repeat(72);

function header(n: number, label: string, query: string) {
  console.log(`\n${DIVIDER}`);
  console.log(`  Test ${n} — ${label}`);
  console.log(`  Query: "${query}"`);
  console.log(DIVIDER);
}

function printResult(patch: Partial<AgentStateType>, ms: number) {
  const raw = patch.searchResults ?? "(no results returned)";

  // Pretty-print: if it's valid JSON, parse and re-format a readable preview
  try {
    const parsed = JSON.parse(raw) as {
      query: string;
      answer?: string;
      results: Array<{ title: string; url: string; snippet?: string }>;
    };

    console.log(`\n  Tavily answer:\n  ${parsed.answer ?? "(none)"}\n`);
    console.log(`  Top results (${parsed.results.length}):`);
    for (const r of parsed.results.slice(0, 3)) {
      console.log(`    • ${r.title}`);
      console.log(`      ${r.url}`);
      if (r.snippet) {
        console.log(`      ${r.snippet.slice(0, 120).replace(/\n/g, " ")}…`);
      }
    }
  } catch {
    // Fallback: print raw string
    console.log("\n" + raw);
  }

  console.log(`\n  ⏱  ${ms}ms`);
}

// ─── Test cases ───────────────────────────────────────────────────────────────
const TEST_CASES: Array<{ label: string; query: string }> = [
  {
    label: "Company Overview",
    query:
      "Zomato company overview: what does it do, industry sector, business model, recent highlights",
  },
  {
    label: "Financials",
    query:
      "Zomato financials 2024 2025: revenue profit loss valuation market cap growth",
  },
  {
    label: "Recent News & Risks",
    query: "Zomato latest news controversies risks 2025",
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🔍  searchWeb node test — company: Zomato\n");

  let allPassed = true;

  for (let i = 0; i < TEST_CASES.length; i++) {
    const { label, query } = TEST_CASES[i];
    header(i + 1, label, query);

    const t0 = Date.now();
    try {
      const state = makeState(query);
      const patch = await searchWeb(state);
      printResult(patch, Date.now() - t0);

      if (!patch.searchResults || patch.searchResults === "null") {
        console.warn("  ⚠️  searchResults is empty — check TAVILY_API_KEY");
        allPassed = false;
      } else {
        console.log("  ✅  Got results");
      }
    } catch (err) {
      console.error(`  ❌  Error: ${err instanceof Error ? err.message : err}`);
      allPassed = false;
    }
  }

  console.log(`\n${DIVIDER}`);
  if (allPassed) {
    console.log("  ✅  All three searchWeb calls succeeded — ready to wire into graph.");
  } else {
    console.log("  ⚠️  One or more tests had issues. Check output above.");
    process.exit(1);
  }
  console.log(DIVIDER + "\n");
}

main().catch((err) => {
  console.error("\n❌  Fatal:", err);
  process.exit(1);
});
