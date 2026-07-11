import { StateGraph, END } from "@langchain/langgraph";
import { AgentState, AgentStateType } from "./state";
import {
  fetchOverview,
  fetchFinancials,
  fetchNews,
  analyzeAndDecide,
} from "./nodes";

/**
 * Linear research → verdict graph:
 *
 *   START
 *     │
 *     ▼
 *   fetchOverview        — "{company} business overview industry sector model"
 *     │
 *     ▼
 *   fetchFinancials      — "{company} revenue profit financials 2024 2025 …"
 *     │
 *     ▼
 *   fetchNews            — "{company} recent news controversy risk 2025" (news, 90d)
 *     │
 *     ▼
 *   analyzeAndDecide     — reads all three buckets, writes state.verdict
 *     │
 *     ▼
 *    END
 *
 * Invoke:
 *   const result = await researchGraph.invoke({ companyName: "Tata Motors" });
 *   // result.verdict: { decision, confidence, keyReasons, risks }
 */
const workflow = new StateGraph(AgentState)
  .addNode("fetchOverview", fetchOverview)
  .addNode("fetchFinancials", fetchFinancials)
  .addNode("fetchNews", fetchNews)
  .addNode("analyzeAndDecide", analyzeAndDecide)

  .addEdge("__start__", "fetchOverview")
  .addEdge("fetchOverview", "fetchFinancials")
  .addEdge("fetchFinancials", "fetchNews")
  .addEdge("fetchNews", "analyzeAndDecide")
  .addEdge("analyzeAndDecide", END);

export const researchGraph = workflow.compile();

export type { AgentStateType };
