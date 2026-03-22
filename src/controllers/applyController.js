const db = require("../db/db");
const {
  processAllMatched,
  processApplication,
  markManuallyApplied,
} = require("../services/applyService");
const notificationService = require("../services/notificationService");

const runApplyPipeline = async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = req.body.limit || 20;
    const threshold = req.body.threshold || 55;

    const summary = await processAllMatched(userId, { limit, threshold });
    res.json({ message: "Apply pipeline complete", ...summary });
  } catch (err) {
    console.error("[ApplyController] runApplyPipeline error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

const applySingleJob = async (req, res) => {
  try {
    const { jobId } = req.body;
    const userId = req.user.userId;
    if (!jobId) return res.status(400).json({ error: "jobId required" });

    const result = await processApplication(jobId, userId);
    res.json(result);
  } catch (err) {
    console.error("[ApplyController] applySingleJob error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

const markAsManuallyApplied = async (req, res) => {
  try {
    await markManuallyApplied(req.params.applicationId);
    res.json({
      message: `Application #${req.params.applicationId} marked as manually_applied`,
    });
  } catch (err) {
    console.error(
      "[ApplyController] markAsManuallyApplied error:",
      err.message,
    );
    res.status(500).json({ error: "Update failed" });
  }
};

const getApplyStatus = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')           AS pending,
         COUNT(*) FILTER (WHERE status = 'auto_applied')      AS auto_applied,
         COUNT(*) FILTER (WHERE status = 'manual_required')   AS manual_required,
         COUNT(*) FILTER (WHERE status = 'manually_applied')  AS manually_applied,
         COUNT(*) FILTER (WHERE status = 'skipped')           AS skipped,
         COUNT(*) FILTER (WHERE status = 'interviewing')      AS interviewing,
         COUNT(*) FILTER (WHERE status = 'rejected')          AS rejected,
         COUNT(*)                                             AS total
       FROM applications
       WHERE user_id = $1`,
      [req.user.userId],
    );
    return res.json({ stats: result.rows[0] });
  } catch (err) {
    console.error("[ApplyController] getApplyStatus error:", err.message);
    return res.status(500).json({ error: "Failed to get status" });
  }
};

const sendTestEmail = async (req, res) => {
  try {
    await notificationService.sendAppliedEmail({
      title: "Test Job Title",
      company: "Test Company Inc.",
      location: "Toronto, ON (Remote)",
      match_score: 87,
      url: "https://example.com/job/123",
    });
    res.json({ message: `Test email sent to ${process.env.PERSONAL_EMAIL}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  runApplyPipeline,
  applySingleJob,
  markAsManuallyApplied,
  getApplyStatus,
  sendTestEmail,
};
