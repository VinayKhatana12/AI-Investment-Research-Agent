import { useState, useEffect, useRef, FormEvent } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Verdict {
  decision: "Invest" | "Pass";
  confidence: number;   // 0–100
  keyReasons: string[];
  risks: string[];
}

interface ApiSuccess {
  companyName: string;
  verdict: Verdict;
  debug: { iterations: number; elapsedMs: number };
}

interface ApiError {
  error: string;
}

type AppState =
  | { phase: "idle" }
  | { phase: "loading"; company: string }
  | { phase: "success"; data: ApiSuccess }
  | { phase: "error"; message: string; code?: number };

// ── Loader steps ───────────────────────────────────────────────────────────────
const STEPS = [
  { id: "overview",   icon: "🏢", label: "Researching company…"   },
  { id: "financials", icon: "📊", label: "Checking financials…"   },
  { id: "news",       icon: "📰", label: "Scanning recent news…"  },
  { id: "verdict",    icon: "🧠", label: "Forming a verdict…"     },
] as const;

// Advance one step every 2.2 s so all 4 steps are visible during the ~9 s call
const STEP_INTERVAL_MS = 2200;

// ── useLoadingStep hook ────────────────────────────────────────────────────────
function useLoadingStep(active: boolean) {
  const [step, setStep] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) { setStep(0); return; }
    setStep(0);
    ref.current = setInterval(() => {
      setStep((s) => (s < STEPS.length - 1 ? s + 1 : s));
    }, STEP_INTERVAL_MS);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [active]);

  return step;
}

// ── fetch helper ───────────────────────────────────────────────────────────────
async function analyzeCompany(companyName: string): Promise<ApiSuccess> {
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyName }),
  });

  const json: ApiSuccess | ApiError = await res.json();

  if (!res.ok) {
    const msg = (json as ApiError).error ?? `HTTP ${res.status}`;
    const err = new Error(msg) as Error & { code: number };
    err.code = res.status;
    throw err;
  }

  return json as ApiSuccess;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepLoader({ activeStep }: { activeStep: number }) {
  return (
    <div className="loader-wrap">
      <div className="loader-dots">
        <span /><span /><span />
      </div>

      <div className="loader-steps">
        {STEPS.map((s, i) => {
          const status =
            i < activeStep ? "done" : i === activeStep ? "active" : "pending";
          return (
            <div key={s.id} className={`loader-step ${status}`}>
              {status === "active" ? (
                <div className="step-spinner" />
              ) : (
                <div className="step-icon">
                  {status === "done" ? "✓" : s.icon}
                </div>
              )}
              <span>{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConfidenceBar({
  value,
  decision,
}: {
  value: number;
  decision: "Invest" | "Pass";
}) {
  const cls = decision === "Invest" ? "invest" : "pass";
  return (
    <div className="confidence-section">
      <div className="conf-label">
        <span className="conf-heading">Analyst Confidence</span>
        <span className="conf-value">{value}%</span>
      </div>
      <div className="conf-track">
        <div
          className={`conf-fill ${cls}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function BulletList({
  items,
  type,
}: {
  items: string[];
  type: "reasons" | "risks";
}) {
  return (
    <ul className={`bullet-list ${type}-list`}>
      {items.map((item, i) => (
        <li key={i} className="bullet-item">
          <span className="bullet-dot" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function VerdictCard({ data }: { data: ApiSuccess }) {
  const { companyName, verdict, debug } = data;
  const isInvest = verdict.decision === "Invest";
  const cls = isInvest ? "invest" : "pass";

  return (
    <div className="verdict-card">
      {/* Company label */}
      <div className="verdict-header">
        <span className="verdict-company">{companyName}</span>
        <div className={`decision-pill ${cls}`}>
          {isInvest ? "✅" : "🚫"} {verdict.decision}
        </div>
      </div>

      {/* Hero block */}
      <div className={`verdict-hero ${cls}`}>
        <div className="verdict-icon">{isInvest ? "📈" : "📉"}</div>
        <div className="verdict-label">{verdict.decision}</div>
        <div className="verdict-tag">
          {isInvest
            ? "Risk/reward looks favourable"
            : "Risks outweigh the opportunity"}
        </div>
      </div>

      {/* Confidence */}
      <ConfidenceBar value={verdict.confidence} decision={verdict.decision} />

      {/* Key reasons */}
      <div className="info-section">
        <div className="section-heading reasons">
          <span className="section-dot" />
          Key Reasons
        </div>
        <BulletList items={verdict.keyReasons} type="reasons" />
      </div>

      {/* Risks */}
      <div className="info-section">
        <div className="section-heading risks">
          <span className="section-dot" />
          Risk Factors
        </div>
        <BulletList items={verdict.risks} type="risks" />
      </div>

      {/* Meta footer */}
      <div className="verdict-meta">
        Analysed in {(debug.elapsedMs / 1000).toFixed(1)}s
        &nbsp;·&nbsp;
        {debug.iterations} iteration{debug.iterations !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

function ErrorBanner({ message, code }: { message: string; code?: number }) {
  const label =
    code === 400 ? "Invalid Request" :
    code === 415 ? "Wrong Content Type" :
    code === 405 ? "Method Not Allowed" :
    code === 500 ? "Server Error" :
    "Something went wrong";

  return (
    <div className="error-banner" role="alert">
      <span className="error-icon">⚠️</span>
      <div className="error-body">
        <div className="error-title">{label}{code ? ` (${code})` : ""}</div>
        <div className="error-msg">{message}</div>
      </div>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const [state, setState] = useState<AppState>({ phase: "idle" });
  const [input, setInput]   = useState("");

  const isLoading = state.phase === "loading";
  const activeStep = useLoadingStep(isLoading);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const company = input.trim();
    if (!company) return;

    setState({ phase: "loading", company });

    try {
      const data = await analyzeCompany(company);
      setState({ phase: "success", data });
    } catch (err) {
      const e = err as Error & { code?: number };
      setState({
        phase: "error",
        message: e.message ?? "Unexpected error",
        code: e.code,
      });
    }
  }

  function handleReset() {
    setState({ phase: "idle" });
    setInput("");
  }

  const showDivider = state.phase !== "idle";

  return (
    <body>
      {/* Page header */}
      <header className="page-header">
        <h1 className="page-title">AI Investment Analyst</h1>
        <p className="page-sub">
          Powered by LangGraph · Gemini · Tavily &nbsp;·&nbsp; Enter any publicly listed company
        </p>
      </header>

      {/* Main card */}
      <main className="card" id="main-card">
        {/* Search form */}
        <form
          className="search-form"
          onSubmit={handleSubmit}
          id="analyze-form"
          aria-label="Company analysis form"
        >
          <input
            id="company-input"
            className="search-input"
            type="text"
            placeholder="e.g. Tata Motors, Infosys, Zomato…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            autoComplete="off"
            autoFocus
            maxLength={120}
            aria-label="Company name"
          />
          <button
            id="analyze-btn"
            type="submit"
            className="analyze-btn"
            disabled={isLoading || input.trim() === ""}
            aria-busy={isLoading}
          >
            {isLoading ? "Analysing…" : "Analyse"}
          </button>
        </form>

        {/* Divider — only when something is shown below */}
        {showDivider && <div className="divider" />}

        {/* Loading state */}
        {state.phase === "loading" && (
          <StepLoader activeStep={activeStep} />
        )}

        {/* Error state */}
        {state.phase === "error" && (
          <>
            <ErrorBanner message={state.message} code={state.code} />
            <button
              id="try-again-btn"
              className="analyze-btn"
              style={{ alignSelf: "flex-start", marginTop: "0.25rem" }}
              onClick={handleReset}
            >
              Try again
            </button>
          </>
        )}

        {/* Success: verdict card */}
        {state.phase === "success" && (
          <>
            <VerdictCard data={state.data} />
            <div className="divider" />
            <button
              id="analyze-another-btn"
              className="analyze-btn"
              style={{ alignSelf: "center", background: "var(--surface-3)", boxShadow: "none" }}
              onClick={handleReset}
            >
              Analyse another company
            </button>
          </>
        )}
      </main>
    </body>
  );
}
