import { z } from "zod";
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

// ─── Investment Verdict schema ────────────────────────────────────────────────
// The single structured output that analyzeAndDecide must return.
export const VerdictSchema = z.object({
  decision: z
    .enum(["Invest", "Pass"])
    .describe("'Invest' if the company looks attractive, 'Pass' if risks outweigh opportunity"),
  confidence: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Analyst confidence score from 0 (very uncertain) to 100 (very confident)"),
  keyReasons: z
    .array(z.string())
    .describe("3–5 concise bullet-point reasons supporting the decision"),
  risks: z
    .array(z.string())
    .describe("2–4 key risk factors the investor should be aware of"),
});

export type Verdict = z.infer<typeof VerdictSchema>;

// ─── Response schema (kept for generateResponse node in ad-hoc graph) ─────────
export const ResponseSchema = z.object({
  answer: z.string().describe("The complete, formatted answer to the user's question"),
  sources: z
    .array(z.object({ title: z.string(), url: z.string().url() }))
    .optional()
    .describe("Sources used to compose the answer"),
});

export type AgentResponse = z.infer<typeof ResponseSchema>;

// ─── LangGraph state ─────────────────────────────────────────────────────────
export const AgentState = Annotation.Root({
  /** Full chat history */
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  /** Company being researched */
  companyName: Annotation<string>({
    reducer: (prev, next) => (next !== undefined && next !== "" ? next : prev),
    default: () => "",
  }),

  // ── Research buckets (one per fetch node) ────────────────────────────────────

  overviewResults: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  financialsResults: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  newsResults: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // ── Ad-hoc search (used by original dynamic graph) ───────────────────────────

  searchResults: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // ── Outputs ──────────────────────────────────────────────────────────────────

  /** Final investment verdict from analyzeAndDecide */
  verdict: Annotation<Verdict | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  /** Prose answer from generateResponse (ad-hoc graph) */
  finalAnswer: Annotation<AgentResponse | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  iterations: Annotation<number>({
    reducer: (prev, next) => next ?? prev,
    default: () => 0,
  }),
});

export type AgentStateType = typeof AgentState.State;
