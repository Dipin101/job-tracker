const db = require("../db/db");
const { getLatestBatch, fetchAndStoreJobs } = require("../services/jobService");

// GET /api/jobs
// Paginated job list with optional filters
const getJobs = async (req, res) => {
  try {
    const {
      source,
      experience_level,
      country,
      limit = 20,
      offset = 0,
    } = req.query;

    const conditions = [];
    const params = [];
    let i = 1;

    if (source) {
      conditions.push(`source = $${i++}`);
      params.push(source);
    }
    if (experience_level) {
      conditions.push(`experience_level = $${i++}`);
      params.push(experience_level);
    }
    if (country) {
      conditions.push(`country = $${i++}`);
      params.push(country);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await db.query(
      `SELECT id, external_id, source, title, company, location, country,
              url, salary_min, salary_max, experience_level,
              skills_required, posted_at, created_at
       FROM jobs
       ${where}
       ORDER BY posted_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, parseInt(limit), parseInt(offset)],
    );

    const countResult = await db.query(
      `SELECT COUNT(*) FROM jobs ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count);

    return res.json({
      jobs: result.rows,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + result.rows.length < total,
      },
    });
  } catch (err) {
    console.error("[JobController] getJobs error:", err.message);
    return res.status(500).json({ error: "Failed to retrieve jobs" });
  }
};

// GET /api/jobs/latest
// Returns most recent cached batch from Redis (falls back to DB)
const getLatestJobs = async (req, res) => {
  try {
    const jobs = await getLatestBatch();
    return res.json({ jobs, count: jobs.length });
  } catch (err) {
    console.error("[JobController] getLatestJobs error:", err.message);
    return res.status(500).json({ error: "Failed to retrieve latest jobs" });
  }
};

// GET /api/jobs/:id
// Single job by UUID
const getJobById = async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM jobs WHERE id = $1", [
      req.params.id,
    ]);
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Job not found" });
    return res.json({ job: result.rows[0] });
  } catch (err) {
    console.error("[JobController] getJobById error:", err.message);
    return res.status(500).json({ error: "Failed to retrieve job" });
  }
};

// POST /api/jobs/trigger
// Manually trigger a job fetch — useful for testing without waiting for cron
const triggerFetch = async (req, res) => {
  try {
    const { query = "software engineer" } = req.body;
    console.log(`[JobController] Manual trigger by user ${req.user.userId}`);
    const user = { ...req.user, id: req.user.userId };
    const newJobs = await fetchAndStoreJobs(user, query);
    return res.json({
      message: "Job fetch complete",
      newJobsFound: newJobs.length,
      jobs: newJobs,
    });
  } catch (err) {
    console.error("[JobController] triggerFetch error:", err.message);
    return res.status(500).json({ error: "Job fetch failed" });
  }
};

module.exports = { getJobs, getLatestJobs, getJobById, triggerFetch };
