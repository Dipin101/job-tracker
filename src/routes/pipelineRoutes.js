const express = require("express");
const router = express.Router();
const pipelineService = require("../services/pipelineService");
const auth = require("../middleware/auth");
const { isRunningNow } = require("../services/pipelineService");

router.use(auth);
/**
 * POST /api/pipeline/run
 * Runs the full pipeline: fetch → match → generate → apply
 * Streams progress events via SSE so the frontend can show live updates.
 *
 * Body: { userId: string }
 *
 * SSE event format:
 *   { stage, status, message, data? }
 *   stages: fetch | match | apply | done | error
 *   status: running | complete | error
 */
router.post("/run", async (req, res) => {
  const userId = req.user.userId;

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  //   res.setHeader("Content-Type", "text/event-stream");
  //   res.setHeader("Cache-Control", "no-cache");
  //   res.setHeader("Connection", "keep-alive");
  //   res.setHeader("X-Accel-Buffering", "no");
  //   res.flushHeaders();

  //   const send = (payload) => {
  //     res.write(`data: ${JSON.stringify(payload)}\n\n`);
  //   };

  //   try {
  //     await pipelineService.run(userId, send);
  //   } catch (err) {
  //     send({ stage: "error", status: "error", message: err.message });
  //   } finally {
  //     res.end();
  //   }*/

  // Collect log messages server-side (no streaming needed)
  const logs = [];
  const send = (payload) => {
    logs.push(payload);
    console.log(`[Pipeline] [${payload.stage}] ${payload.message}`);
  };

  // try {
  //   const result = await pipelineService.run(userId, send);
  //   return res.json({ ...result, logs });
  // } catch (err) {
  //   console.error("[Pipeline] Fatal error:", err.message);
  //   return res.status(500).json({ error: err.message, logs });
  // }
  pipelineService.run(userId, send).catch((err) => {
    console.error("[Pipeline] Background run failed:", err.message);
  });

  return res.json({ message: "Pipeline started", status: "running" });
});

router.get("/status", async (req, res) => {
  res.json({ running: isRunningNow() });
});

router.get("/results", async (req, res) => {
  try {
    const results = await pipelineService.getLatestResults(req.user.userId);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
