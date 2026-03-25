const db = require("../db/db");
const {
  processJobForUser,
  processAllJobsForUser,
} = require("../services/applicationService");
const { getUserSkills, getThresholds } = require("../services/matchingService");

const buildUserPrefs = (user) => ({
  city: user.city || null,
  country: user.country || null,
  remote_ok: user.remote_ok ?? true,
  preferred_companies: user.preferred_companies || [],
  blocked_companies: user.blocked_companies || [],
});

const runMatching = async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [
      req.user.userId,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = result.rows[0];
    const userPrefs = buildUserPrefs(user);
    const summary = await processAllJobsForUser(user, userPrefs);

    return res.json({ message: "Matching complete", ...summary });
  } catch (err) {
    console.error("[MatchingController] runMatching error:", err.message);
    return res.status(500).json({ error: "Matching failed" });
  }
};

const matchSingleJob = async (req, res) => {
  try {
    const userResult = await db.query("SELECT * FROM users WHERE id = $1", [
      req.user.userId,
    ]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const jobResult = await db.query("SELECT * FROM jobs WHERE id = $1", [
      req.params.jobId,
    ]);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: "Job not found" });
    }

    const user = userResult.rows[0];
    const job = jobResult.rows[0];
    const userPrefs = buildUserPrefs(user);

    const application = await processJobForUser(user, job, userPrefs);

    if (!application) {
      return res.json({ message: "Job skipped", application: null });
    }

    return res.json({ message: "Job processed", application });
  } catch (err) {
    console.error("[MatchingController] matchSingleJob error:", err.message);
    return res.status(500).json({ error: "Matching failed" });
  }
};

const getMySkills = async (req, res) => {
  try {
    const skills = await getUserSkills(req.user.userId);

    const thresholds = await db.query(
      "SELECT experience_level, match_threshold FROM users WHERE id = $1",
      [req.user.userId],
    );
    const user = thresholds.rows[0];
    const defaultThresholds = getThresholds(user?.experience_level);

    return res.json({
      skills,
      count: skills.length,
      experience_level: user?.experience_level,
      thresholds: {
        ...defaultThresholds,
        current: user?.match_threshold || defaultThresholds.default,
      },
    });
  } catch (err) {
    console.error("[MatchingController] getMySkills error:", err.message);
    return res.status(500).json({ error: "Failed to retrieve skills" });
  }
};

const getApplications = async (req, res) => {
  try {
    const { status, is_favourite, limit = 20, offset = 0 } = req.query;

    const conditions = ["a.user_id = $1"];
    const params = [req.user.userId];
    let i = 2;

    if (status) {
      conditions.push(`a.status = $${i++}`);
      params.push(status);
    }
    if (is_favourite === "true") {
      conditions.push(`a.is_favourite = true`);
    }

    const result = await db.query(
      `SELECT a.*, j.title, j.company, j.location, j.url, j.salary_min, j.salary_max, j.description, j.posted_at
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY a.match_score DESC, a.applied_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, parseInt(limit), parseInt(offset)],
    );

    return res.json({ applications: result.rows, count: result.rows.length });
  } catch (err) {
    console.error("[MatchingController] getApplications error:", err.message);
    return res.status(500).json({ error: "Failed to retrieve applications" });
  }
};

const updateApplication = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { status, notes, is_favourite } = req.body;

    const validStatuses = [
      "manually_applied",
      "rejected",
      "skipped",
      "manual_required",
      "not_interested",
      "first_call",
      "interviewing",
    ];

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const { rows } = await db.query(
      `UPDATE applications
       SET
         status = COALESCE($1, status),
         notes  = COALESCE($2, notes),
         is_favourite = COALESCE($3, is_favourite),
         updated_at = NOW()
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [status || null, notes || null, is_favourite ?? null, id, userId],
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Application not found" });
    }

    return res.json({ application: rows[0] });
  } catch (err) {
    console.error("[MatchingController] updateApplication error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  runMatching,
  matchSingleJob,
  getMySkills,
  getApplications,
  updateApplication,
};
