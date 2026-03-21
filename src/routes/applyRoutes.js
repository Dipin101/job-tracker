// src/routes/applyRoutes.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  processApplication,
  processAllMatched,
  markManuallyApplied,
} = require("../services/applyService");
const notificationService = require("../services/notificationService");

// POST /api/apply/run
// Runs the full auto-apply pipeline for all matched jobs
router.use(auth);
router.post("/run", async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = req.body.limit || 20;
    const threshold = req.body.threshold || 55;

    console.log(
      `[Routes] /api/apply/run — userId: ${userId}, limit: ${limit}, threshold: ${threshold}`,
    );

    // Run async — respond immediately so request doesn't time out
    res.json({ message: "Apply pipeline started", userId, limit, threshold });

    // Run in background
    processAllMatched(userId, { limit, threshold }).catch((err) => {
      console.error("[Routes] processAllMatched error:", err.message);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/apply/single
// Apply to a single job by jobId
router.post("/single", async (req, res) => {
  try {
    const { jobId } = req.body;
    const userId = req.user.userId;
    if (!jobId) return res.status(400).json({ error: "jobId required" });

    const result = await processApplication(jobId, userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/apply/:applicationId/manual
// Mark a manual_required application as manually_applied (you applied yourself)
router.patch("/:applicationId/manual", async (req, res) => {
  try {
    const { applicationId } = req.params;
    await markManuallyApplied(applicationId);
    res.json({
      message: `Application #${applicationId} marked as manually_applied`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/apply/test-email
// Smoke test — sends a test notification email to verify nodemailer is working
router.post("/test-email", async (req, res) => {
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
});

module.exports = router;
