import "dotenv/config";
import express from "express";
import cors from "cors";
import healthRouter from "./routes/health";
import agentRouter from "./routes/agent";

const app = express();
const PORT = process.env.PORT ?? 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api", healthRouter);
app.use("/api", agentRouter);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`   Accepting requests from: ${CLIENT_ORIGIN}`);
});

export default app;
