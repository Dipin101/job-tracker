require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const logger = require("./config/logger");
const { apiLimiter, pipelineLimiter } = require("./middleware/rateLimiter");
const app = express();
const port = process.env.PORT || 5000;

// ── Trust proxy (for Cloudflare tunnel) ───────────────────────────────────
app.set("trust proxy", 1);

// ── Security ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: [
      process.env.CLIENT_URL,
      "https://app.jobtrackers.org",
      "https://job-tracker-zeta-ashy.vercel.app",
      "https://jobtrackers.org",
      "http://localhost:5173",
    ].filter(Boolean),
    credentials: true,
  }),
);
// ── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());
// ── Rate limiting ──────────────────────────────────────────────────────────
// app.use("/api/", apiLimiter); --> globally
// app.use("/api(?!auth)", apiLimiter); //excludes auth --> doessn't work well with express
// ── Routes ──────────────────────────────────────────────────────────────
const authRoutes = require("./routes/authRoutes");
const resumeRoutes = require("./routes/resumeRoutes");
const githubRoutes = require("./routes/githubRoutes");
const jobRoutes = require("./routes/jobRoutes");
const matchingRoutes = require("./routes/matchingRoutes");
const documentRoutes = require("./routes/documentRoutes");
const engineRoutes = require("./routes/applicationEngineRoutes");
const applyRoutes = require("./routes/applyRoutes");
const pipelineRoutes = require("./routes/pipelineRoutes");
app.use("/api/auth", authRoutes);
app.use("/api/resume", apiLimiter, resumeRoutes);
app.use("/api/github", apiLimiter, githubRoutes);
app.use("/api/jobs", apiLimiter, jobRoutes);
app.use("/api/matching", apiLimiter, matchingRoutes);
app.use("/api/documents", apiLimiter, documentRoutes);
app.use("/api/engine", pipelineLimiter, engineRoutes);
app.use("/api/apply", apiLimiter, applyRoutes);
app.use("/api/pipeline", pipelineRoutes);
// ── Health check ───────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});
app.get("/", (req, res) => {
  res.json({ message: "Job Tracker API is running." });
});
// ── Global error handler ───────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error(`${err.message} — ${req.method} ${req.path}`);
  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
});
// ── Start server ───────────────────────────────────────────────────────────
app.listen(port, () => {
  logger.info(
    `Server running on port ${port} (${process.env.NODE_ENV || "development"})`,
  );
  const { verifyConnection } = require("./services/notificationService");
  verifyConnection();
  const { startCronJobs } = require("./jobs/cronJob");
  startCronJobs();
});
