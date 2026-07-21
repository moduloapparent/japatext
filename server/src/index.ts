import express from "express";
import cors from "cors";
import { runMigrations, dbPathForDisplay } from "./db/index.js";
import { seed } from "./db/seed.js";
import { listCharacters } from "./db/repo.js";
import { charactersRouter } from "./routes/characters.js";
import { conversationsRouter } from "./routes/conversations.js";
import { analysisRouter } from "./routes/analysis.js";
import { learningRouter } from "./routes/learning.js";
import { systemRouter } from "./routes/system.js";
import { PORT, OPENAI_API_KEY, WEB_ORIGINS, assertProductionStorage, isAuthEnabled } from "./config.js";
import { authMiddleware } from "./lib/auth.js";
import { startJobWorker } from "./engine/jobs.js";

assertProductionStorage();

runMigrations();
if (listCharacters().length === 0) {
  seed();
}

const app = express();
app.use(
  cors({
    origin: WEB_ORIGINS.length > 0 ? WEB_ORIGINS : true,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use("/api", authMiddleware);

app.use("/api/characters", charactersRouter);
app.use("/api/conversations", conversationsRouter);
app.use("/api/messages", analysisRouter);
app.use("/api/learning-items", learningRouter);
app.use("/api", systemRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const message = err instanceof Error ? err.message : "Unexpected server error.";
  res.status(500).json({ error: { message } });
});

app.listen(PORT, () => {
  startJobWorker();
  console.log(`Japatext server listening on http://localhost:${PORT}`);
  console.log(`Database: ${dbPathForDisplay()}`);
  console.log(`Auth: ${isAuthEnabled() ? "Supabase JWT required" : "local (no auth)"}`);
  if (!OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY is not set. Copy server/.env.example to server/.env and add your key.");
  }
});
