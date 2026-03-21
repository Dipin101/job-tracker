/**
 * applyController.js
 * API endpoints for the auto-apply pipeline.
 *
 * Place in: src/controllers/applyController.js
 *
 * Routes to add in your router:
 *   POST /api/apply/run              — process all pending applications
 *   POST /api/apply/job/:jobId       — apply to a single job
 *   PATCH /api/apply/:id/manual      — mark as manually applied
 *   GET  /api/apply/status           — get apply summary stats
 */

const db = require("../db/db");
const {
  processAllPendingApplications,
  processApplication,
  markManuallyApplied,
  getUserProfile,
} = require("../services/applyService");
const { attemptApply } = require("../services/playwrightAgent");

// POST /api/apply/run
// Process all pending applications for the logged in user
const runAutoApply = async (req, res) => {
  try {
    const { min_score = 60, limit = 20 } = req.body;

    const summary = await processAllPendingApplications(req.user.userId, {
      minScore: parseInt(min_score),
      limit: parseInt(limit),
    });

    return res.json({ message: "Auto-apply run complete", ...summary });
  } catch (err) {
    console.error("[ApplyController] runAutoApply error:", err.message);
    return res.status(500).json({ error: "Auto-apply failed" });
  }
};

// POST /api/apply/job/:jobId
// Attempt to apply to a single specific job
const applySingleJob = async (req, res) => {
  try {
    const jobResult = await db.query("SELECT * FROM jobs WHERE id = $1", [
      req.params.jobId,
    ]);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: "Job not found" });
    }

    const appResult = await db.query(
      "SELECT * FROM applications WHERE job_id = $1 AND user_id = $2",
      [req.params.jobId, req.user.userId],
    );
    if (appResult.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Application not found — run matching first" });
    }

    const job = jobResult.rows[0];
    const application = appResult.rows[0];
    const userProfile = await getUserProfile(req.user.userId);

    const updated = await processApplication(application, userProfile, job);

    return res.json({
      message:
        updated.status === "auto_applied"
          ? "Successfully auto-applied"
          : "Manual apply required — check your email",
      application: updated,
    });
  } catch (err) {
    console.error("[ApplyController] applySingleJob error:", err.message);
    return res.status(500).json({ error: "Apply failed" });
  }
};

// PATCH /api/apply/:id/manual
// Mark an application as manually applied (triggered from dashboard)
const markAsManuallyApplied = async (req, res) => {
  try {
    const updated = await markManuallyApplied(req.params.id, req.user.userId);
    if (!updated) {
      return res.status(404).json({ error: "Application not found" });
    }
    return res.json({
      message: "Marked as manually applied",
      application: updated,
    });
  } catch (err) {
    console.error(
      "[ApplyController] markAsManuallyApplied error:",
      err.message,
    );
    return res.status(500).json({ error: "Update failed" });
  }
};

// GET /api/apply/status
// Summary stats for the dashboard
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

module.exports = {
  runAutoApply,
  applySingleJob,
  markAsManuallyApplied,
  getApplyStatus,
};
