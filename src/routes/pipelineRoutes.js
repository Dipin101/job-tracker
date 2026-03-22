const express = require("express");
const router = express.Router();
const pipelineService = require("../services/pipelineService");
const auth = require("../middleware/auth");

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

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    await pipelineService.run(userId, send);
  } catch (err) {
    send({ stage: "error", status: "error", message: err.message });
  } finally {
    res.end();
  }
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
