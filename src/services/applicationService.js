const db = require("../db/db");
const { matchJobToUser, hasAppliedRecently } = require("./matchingService");

/**
 * Process a single job for a single user.
 * Checks reapply logic, runs matching, saves result to applications table.
 *
 * @param {Object} user - user row from DB
 * @param {Object} job  - job row from DB
 * @returns {Promise<Object|null>} - application result or null if skipped
 */
const processJobForUser = async (user, job) => {
  // 1. Check if already applied recently
  const reapplyDays = user.reapply_threshold_days || 60;
  const alreadyApplied = await hasAppliedRecently(user.id, job.id, reapplyDays);

  if (alreadyApplied) {
    console.log(
      `[AppService] User ${user.id} already applied to job ${job.id} recently — skipping`,
    );
    return null;
  }

  // 2. Run AI matching
  const matchResult = await matchJobToUser(user, job);

  if (!matchResult) {
    console.log(`[AppService] No match result for job ${job.id} — skipping`);
    return null;
  }

  // 3. Save to applications table
  try {
    const status = matchResult.decision === "apply" ? "pending" : "skipped";

    const result = await db.query(
      `INSERT INTO applications
         (user_id, job_id, match_score, matched_skills, missing_skills,
          match_reasoning, is_favourite, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, job_id) DO UPDATE
         SET match_score = EXCLUDED.match_score,
             matched_skills = EXCLUDED.matched_skills,
             missing_skills = EXCLUDED.missing_skills,
             match_reasoning = EXCLUDED.match_reasoning,
             is_favourite = EXCLUDED.is_favourite,
             status = EXCLUDED.status
       RETURNING *`,
      [
        user.id,
        job.id,
        matchResult.score,
        matchResult.matched_skills,
        matchResult.missing_skills,
        matchResult.reasoning,
        matchResult.is_favourite,
        status,
      ],
    );

    console.log(
      `[AppService] Saved application: job "${job.title}" | score: ${matchResult.score} | status: ${status} | favourite: ${matchResult.is_favourite}`,
    );

    return result.rows[0];
  } catch (err) {
    console.error(
      `[AppService] Failed to save application for job ${job.id}:`,
      err.message,
    );
    return null;
  }
};

/**
 * Process all unmatched jobs for a user.
 * Pulls jobs that haven't been scored yet and runs matching on each.
 *
 * @param {Object} user - user row from DB
 * @returns {Promise<Object>} - summary of results
 */
const processAllJobsForUser = async (user) => {
  // Get jobs not yet in applications table for this user
  const result = await db.query(
    `SELECT j.* FROM jobs j
     WHERE NOT EXISTS (
       SELECT 1 FROM applications a
       WHERE a.job_id = j.id AND a.user_id = $1
     )
     AND j.country = $2
     ORDER BY j.posted_at DESC
     LIMIT 50`,
    [user.id, user.country || "gb"],
  );

  const jobs = result.rows;
  console.log(
    `[AppService] Processing ${jobs.length} unmatched jobs for user ${user.id}`,
  );

  if (jobs.length === 0) {
    return { processed: 0, applied: 0, skipped: 0, favourites: 0 };
  }

  let applied = 0;
  let skipped = 0;
  let favourites = 0;

  for (const job of jobs) {
    const application = await processJobForUser(user, job);
    if (!application) {
      skipped++;
      continue;
    }
    if (application.status === "pending") applied++;
    if (application.status === "skipped") skipped++;
    if (application.is_favourite) favourites++;
  }

  const summary = {
    processed: jobs.length,
    applied,
    skipped,
    favourites,
  };

  console.log(`[AppService] Done for user ${user.id}:`, summary);
  return summary;
};

module.exports = { processJobForUser, processAllJobsForUser };
