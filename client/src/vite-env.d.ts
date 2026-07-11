/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Backend API origin.
   * - Local dev: leave empty ("") — Vite proxy rewrites /api → localhost:3001
   * - Production: set to your deployed backend URL, e.g.
   *     https://ai-investment-agent.onrender.com
   *   (no trailing slash)
   */
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
