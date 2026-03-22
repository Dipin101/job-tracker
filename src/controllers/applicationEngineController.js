const {
  runPipelineForUser,
  processRetryQueue,
  updateUserStatus,
} = require("../services/applicationEngineService");

const runPipeline = async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await runPipelineForUser(userId);

    if (result.skipped) {
      return res.json({ message: "Pipeline skipped", reason: result.reason });
    }

    return res.json({
      message: "Pipeline complete",
      matched: result.matched,
      applied: result.applied,
      failed: result.failed,
      favourites: result.favourites,
    });
  } catch (err) {
    console.error("[EngineController] runPipeline error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

const runRetryQueue = async (req, res) => {
  try {
    const processed = await processRetryQueue();
    return res.json({ message: "Retry queue processed", processed });
  } catch (err) {
    console.error("[EngineController] runRetryQueue error:", err.message);
    return res.status(500).json({ error: "Retry queue failed" });
  }
};

const setStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { status } = req.body;

    const validStatuses = ["active", "paused", "interviewing", "employed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const isActive = status !== "employed";
    const user = await updateUserStatus(userId, status, isActive);

    return res.json({
      message: `Status updated to "${status}"`,
      job_search_status: user.job_search_status,
      is_active: user.is_active,
    });
  } catch (err) {
    console.error("[EngineController] setStatus error:", err.message);
    return res.status(500).json({ error: "Failed to update status" });
  }
};

module.exports = { runPipeline, runRetryQueue, setStatus };
