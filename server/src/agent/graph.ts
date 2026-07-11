/**
 * graph.ts — primary graph export used by /api/agent route.
 *
 * Now delegates to the linear research graph so both the Express route
 * and direct graph imports share the same pipeline:
 *   fetchOverview → fetchFinancials → fetchNews → analyzeAndDecide → END
 */
export { researchGraph as graph } from "./researchGraph";
export type { AgentStateType } from "./state";
