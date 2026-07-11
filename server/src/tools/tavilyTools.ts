import { tavily as createTavilyClient, TavilyClient } from "@tavily/core";

// ─── Client singleton ─────────────────────────────────────────────────────────
let _client: TavilyClient | null = null;

function getClient(): TavilyClient {
  if (!process.env.TAVILY_API_KEY) {
    throw new Error("TAVILY_API_KEY is not set. Add it to server/.env");
  }
  if (!_client) {
    _client = createTavilyClient({ apiKey: process.env.TAVILY_API_KEY });
  }
  return _client;
}

// ─── Shared helper ────────────────────────────────────────────────────────────
/**
 * Runs a Tavily search and distils the result into a single readable text block.
 * - Uses Tavily's own `answer` field when present (already synthesised by the API).
 * - Falls back to concatenating the top snippet from each result.
 * - Returns "No data found." on any error so callers never have to try/catch.
 */
async function tavilySearch(
  query: string,
  options: {
    maxResults?: number;
    topic?: "general" | "news";
    days?: number;        // how far back to look (news topic only)
  } = {}
): Promise<string> {
  try {
    const client = getClient();
    const response = await client.search(query, {
      maxResults: options.maxResults ?? 5,
      searchDepth: "advanced",
      includeAnswer: true,
      topic: options.topic ?? "general",
      ...(options.days !== undefined ? { days: options.days } : {}),
    });

    // Prefer the synthesised answer Tavily returns
    if (response.answer && response.answer.trim().length > 0) {
      const sources = response.results
        .slice(0, 3)
        .map((r) => `  • ${r.title} — ${r.url}`)
        .join("\n");
      return `${response.answer.trim()}\n\nSources:\n${sources}`;
    }

    // Fallback: stitch together top snippets
    if (response.results.length === 0) {
      return "No data found.";
    }

    const snippets = response.results
      .slice(0, 5)
      .map((r) => `[${r.title}]\n${r.content?.slice(0, 300) ?? ""}`)
      .join("\n\n");

    return snippets;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[tavilySearch] Error for query "${query}":`, msg);
    return "No data found.";
  }
}

// ─── Tool 1: Company Overview ─────────────────────────────────────────────────
/**
 * Searches for what the company does, its industry, and recent business highlights.
 * @param companyName  e.g. "Zomato"
 * @returns            Clean text summary, or "No data found." on failure.
 */
export async function searchCompanyOverview(companyName: string): Promise<string> {
  const query = `${companyName} company overview: what does it do, industry sector, business model, recent highlights`;
  return tavilySearch(query, { maxResults: 5 });
}

// ─── Tool 2: Financials ───────────────────────────────────────────────────────
/**
 * Searches for recent revenue, profit/loss, valuation, and growth trend.
 * @param companyName  e.g. "Zomato"
 * @returns            Clean text summary, or "No data found." on failure.
 */
export async function searchFinancials(companyName: string): Promise<string> {
  const query = `${companyName} financials 2024 2025: revenue profit loss valuation market cap growth`;
  return tavilySearch(query, { maxResults: 5 });
}

// ─── Tool 3: News & Risks ─────────────────────────────────────────────────────
/**
 * Searches for recent news, controversies, or risk factors from the last few months.
 * @param companyName  e.g. "Zomato"
 * @returns            Clean text summary, or "No data found." on failure.
 */
export async function searchNews(companyName: string): Promise<string> {
  const query = `${companyName} latest news controversies risks 2025`;
  return tavilySearch(query, {
    maxResults: 6,
    topic: "news",
    days: 90,            // last 3 months
  });
}
