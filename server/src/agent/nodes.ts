import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { Runnable } from "@langchain/core/runnables";
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import { tavily as createTavilyClient } from "@tavily/core";
import {
  AgentStateType,
  VerdictSchema,
  Verdict,
  ResponseSchema,
  AgentResponse,
} from "./state";

// ─── Shared: Tavily fetch helper ──────────────────────────────────────────────
/**
 * Runs a Tavily search and returns a compact JSON string
 * (query + synthesised answer + top snippets).
 * Never throws — returns an empty-results payload on failure.
 */
async function tavilyFetch(
  query: string,
  opts: { maxResults?: number; topic?: "general" | "news"; days?: number } = {}
): Promise<string> {
  if (!process.env.TAVILY_API_KEY) {
    throw new Error("TAVILY_API_KEY is not set. Add it to server/.env");
  }
  const client = createTavilyClient({ apiKey: process.env.TAVILY_API_KEY });

  const response = await client.search(query, {
    maxResults: opts.maxResults ?? 5,
    searchDepth: "basic",
    includeAnswer: true,
    topic: opts.topic ?? "general",
    ...(opts.days !== undefined ? { days: opts.days } : {}),
  });

  const payload = {
    query,
    answer: response.answer ?? "",
    results: response.results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content?.slice(0, 400) ?? "",
    })),
  };

  console.log(
    `[tavilyFetch] ${payload.results.length} result(s) for: "${query}"`
  );
  return JSON.stringify(payload, null, 2);
}

// ─── Model factory ────────────────────────────────────────────────────────────
function getBaseModel() {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY is not set. Add it to server/.env");
  }
  return new ChatGoogleGenerativeAI({
    model: "gemini-3.1-flash-lite",      // confirmed working for this API key
    apiKey: process.env.GOOGLE_API_KEY,
    temperature: 0,                       // deterministic structured output
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FETCH NODES  (fetchOverview → fetchFinancials → fetchNews)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Searches for the company's business model, industry, and recent highlights.
 * Writes to state.overviewResults.
 */
export async function fetchOverview(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const company = state.companyName || extractCompany(state);
  const query = `${company} business overview industry sector model`;
  const overviewResults = await tavilyFetch(query, { maxResults: 5 });
  return { overviewResults, companyName: company };
}

/**
 * Searches for revenue, profit/loss, valuation, and growth trend.
 * Writes to state.financialsResults.
 */
export async function fetchFinancials(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const query = `${state.companyName} revenue profit financials 2024 2025 valuation market cap`;
  const financialsResults = await tavilyFetch(query, { maxResults: 5 });
  return { financialsResults };
}

/**
 * Searches for recent news, controversies, and risk factors (last 90 days).
 * Writes to state.newsResults.
 */
export async function fetchNews(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const query = `${state.companyName} recent news controversy risk 2025`;
  const newsResults = await tavilyFetch(query, {
    maxResults: 6,
    topic: "news",
    days: 90,
  });
  return { newsResults };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ANALYZE & DECIDE — Investment Verdict
//  Reads all three research buckets; returns { decision, confidence, keyReasons, risks }
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Investment analyst node.
 *
 * Takes the pre-fetched overview, financials, and news from state, calls
 * Gemini once with a structured-output schema, and writes the final
 * investment verdict directly to state.verdict.
 *
 * The frontend renders state.verdict directly — no prose generation step needed.
 *
 * Schema enforced via .withStructuredOutput(VerdictSchema):
 *   {
 *     decision:   "Invest" | "Pass"
 *     confidence: 0–100  (integer)
 *     keyReasons: string[]   (3–5 bullets)
 *     risks:      string[]   (2–4 bullets)
 *   }
 */
export async function analyzeAndDecide(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  // TS2589 workaround: cast to any before .withStructuredOutput() so tsc
  // doesn't traverse the full Zod→Runnable generic chain.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model: Runnable<BaseLanguageModelInput, Verdict> =
    (getBaseModel() as any).withStructuredOutput(VerdictSchema, {
      name: "investment_verdict",
    });

  // ── Build research context ────────────────────────────────────────────────
  const context = buildResearchContext(state);

  const systemPrompt = new SystemMessage(
    `You are a senior equity research analyst. You have been given pre-fetched research data
about ${state.companyName || "the company"} covering its business overview, financials, and
recent news. Your task is to produce a concise, structured investment verdict.

Guidelines:
• decision   — "Invest" if the risk/reward looks favourable; "Pass" otherwise.
• confidence — integer 0–100 reflecting how certain you are given the available data.
  Use 70+ only when financials are clearly strong AND risks are manageable.
• keyReasons — 3 to 5 specific, evidence-backed bullets explaining the decision.
• risks      — 2 to 4 distinct risk factors the investor must monitor.

Be concise and data-driven. Do not speculate beyond what the research data shows.
Do not add caveats like "I am an AI" — respond only with the JSON verdict.

${context}`
  );

  // Gemini requires at least one human-role message in the contents array.
  const userMsg = new HumanMessage(
    `Analyze ${state.companyName || "the company"} and return your investment verdict.`
  );

  const verdict: Verdict = await model.invoke([systemPrompt, userMsg]);

  console.log("[analyzeAndDecide] verdict:", JSON.stringify(verdict, null, 2));

  return {
    verdict,
    iterations: state.iterations + 1,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AD-HOC SEARCH NODE  (kept for original dynamic graph)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ad-hoc single search — reads state.searchQuery, calls Tavily,
 * writes to state.searchResults. Used by the original dynamic graph only.
 */
export async function searchWeb(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const query = (state as AgentStateType & { searchQuery?: string }).searchQuery;
  if (!query) {
    throw new Error("searchWeb called but no searchQuery in state");
  }
  const searchResults = await tavilyFetch(query);
  return { searchResults };
}

/**
 * Prose response node — kept for the original dynamic graph.
 */
export async function generateResponse(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model: Runnable<BaseLanguageModelInput, AgentResponse> =
    (getBaseModel() as any).withStructuredOutput(ResponseSchema, {
      name: "generate_final_answer",
    });

  const context = buildResearchContext(state);
  const systemPrompt = new SystemMessage(
    `You are a helpful assistant. Answer the user's question.
${context ? `Use the research data below:\n\n${context}` : "Answer from general knowledge."}

Be concise and well-structured. Use markdown if it aids clarity.`
  );

  const userMessages =
    state.messages.length > 0
      ? state.messages
      : [new HumanMessage("Summarise the available information.")];

  const finalAnswer: AgentResponse = await model.invoke([
    systemPrompt,
    ...userMessages,
  ]);

  console.log("[generateResponse] answer length:", finalAnswer.answer.length);
  return { finalAnswer };
}

// ─── Internal: assemble research context block ────────────────────────────────
function buildResearchContext(state: AgentStateType): string {
  const sections: string[] = [];

  if (state.overviewResults) {
    sections.push(`<overview>\n${state.overviewResults}\n</overview>`);
  }
  if (state.financialsResults) {
    sections.push(`<financials>\n${state.financialsResults}\n</financials>`);
  }
  if (state.newsResults) {
    sections.push(`<news>\n${state.newsResults}\n</news>`);
  }
  if (state.searchResults && sections.length === 0) {
    sections.push(
      `<search_results>\n${state.searchResults}\n</search_results>`
    );
  }

  return sections.length > 0
    ? `<research_data>\n${sections.join("\n\n")}\n</research_data>`
    : "";
}

// ─── Internal: extract company from first human message ───────────────────────
function extractCompany(state: AgentStateType): string {
  for (const msg of state.messages) {
    if (msg instanceof HumanMessage && typeof msg.content === "string") {
      return msg.content.trim();
    }
  }
  return "the company";
}
