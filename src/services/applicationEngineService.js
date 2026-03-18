const db = require("../db/db");
const redis = require("../config/redis");
const { generateDocuments } = require("./documentService");
const { processAllJobsForUser } = require("./applicationService");

const MAX_RETRIES = 6;

/**
 * Check if user is eligible to apply.
 * Respects kill switch (is_active) and job_search_status.
 */
const isUserEligible = (user) => {
  if (!user.is_active) {
    console.log(`[AppEngine] User ${user.id} is inactive — skipping`);
    return false;
  }
  if (user.job_search_status === "employed") {
    console.log(`[AppEngine] User ${user.id} is employed — skipping`);
    return false;
  }
  return true;
};

/**
 * Run the full pipeline for a single user:
 * 1. Check kill switch
 * 2. Match all unprocessed jobs
 * 3. Generate documents for pending applications
 * 4. Mark as applied
 */
const runPipelineForUser = async (userId) => {
  // 1. Get full user row
  const userResult = await db.query("SELECT * FROM users WHERE id = $1", [
    userId,
  ]);
  if (userResult.rows.length === 0) throw new Error("User not found");
  const user = userResult.rows[0];

  // 2. Kill switch check
  if (!isUserEligible(user)) {
    return { skipped: true, reason: "User inactive or employed" };
  }

  console.log(`[AppEngine] Running pipeline for user ${user.id}`);

  // 3. Match all unprocessed jobs
  const matchSummary = await processAllJobsForUser(user);
  console.log(`[AppEngine] Match summary:`, matchSummary);

  // 4. Get all pending applications that don't have documents yet
  const pendingResult = await db.query(
    `SELECT a.*, j.title, j.company FROM applications a
     JOIN jobs j ON j.id = a.job_id
     WHERE a.user_id = $1
       AND a.status = 'pending'
       AND NOT EXISTS (
         SELECT 1 FROM ai_resumes r
         WHERE r.user_id = a.user_id AND r.job_id = a.job_id
       )
     ORDER BY a.match_score DESC`,
    [userId],
  );

  const pendingApplications = pendingResult.rows;
  console.log(
    `[AppEngine] ${pendingApplications.length} pending applications need documents`,
  );

  let applied = 0;
  let failed = 0;

  for (const application of pendingApplications) {
    try {
      // 5. Generate resume + cover letter
      await generateDocuments(userId, application.job_id);

      // 6. Mark as applied
      await db.query(
        `UPDATE applications SET status = 'applied', applied_at = NOW()
         WHERE user_id = $1 AND job_id = $2`,
        [userId, application.job_id],
      );

      console.log(
        `[AppEngine] Applied to "${application.title}" at ${application.company}`,
      );
      applied++;
    } catch (err) {
      console.error(
        `[AppEngine] Failed to apply to job ${application.job_id}:`,
        err.message,
      );

      // Push to retry queue
      await pushToRetryQueue(userId, application.job_id, err.message);
      failed++;
    }
  }

  return {
    skipped: false,
    matched: matchSummary.processed,
    applied,
    failed,
    favourites: matchSummary.favourites,
  };
};

/**
 * Push a failed application to Redis retry queue.
 */
const pushToRetryQueue = async (userId, jobId, reason = "unknown") => {
  try {
    const payload = JSON.stringify({
      userId,
      jobId,
      reason,
      retryCount: 0,
      failedAt: new Date().toISOString(),
    });
    await redis.lPush("jobs:retry:queue", payload);
    console.log(`[AppEngine] Pushed to retry queue: job ${jobId}`);
  } catch (err) {
    console.error("[AppEngine] Failed to push retry queue:", err.message);
  }
};

/**
 * Process the Redis retry queue.
 * Retries failed applications up to MAX_RETRIES times.
 */
const processRetryQueue = async () => {
  console.log("[AppEngine] Processing retry queue...");
  let processed = 0;

  while (true) {
    let item;
    try {
      // Pop from right (oldest first)
      const raw = await redis.rPop("jobs:retry:queue");
      if (!raw) break;

      item = JSON.parse(raw);
    } catch (err) {
      console.error("[AppEngine] Failed to pop retry queue:", err.message);
      break;
    }

    const { userId, jobId, retryCount, reason } = item;

    // Check max retries
    if (retryCount >= MAX_RETRIES) {
      console.log(
        `[AppEngine] Job ${jobId} exceeded max retries (${MAX_RETRIES}) — marking failed`,
      );
      await db.query(
        `UPDATE applications SET status = 'failed', retry_count = $1, last_retry_at = NOW()
         WHERE user_id = $2 AND job_id = $3`,
        [retryCount, userId, jobId],
      );
      continue;
    }

    // Retry
    try {
      await generateDocuments(userId, jobId);
      await db.query(
        `UPDATE applications SET status = 'applied', retry_count = $1, last_retry_at = NOW()
         WHERE user_id = $2 AND job_id = $3`,
        [retryCount + 1, userId, jobId],
      );
      console.log(
        `[AppEngine] Retry ${retryCount + 1} succeeded for job ${jobId}`,
      );
      processed++;
    } catch (err) {
      console.error(
        `[AppEngine] Retry ${retryCount + 1} failed for job ${jobId}:`,
        err.message,
      );

      // Push back with incremented retry count
      const updated = JSON.stringify({
        ...item,
        retryCount: retryCount + 1,
        lastRetryAt: new Date().toISOString(),
        reason: err.message,
      });
      await redis.lPush("jobs:retry:queue", updated);

      // Update retry count in DB
      await db.query(
        `UPDATE applications SET retry_count = $1, last_retry_at = NOW()
         WHERE user_id = $2 AND job_id = $3`,
        [retryCount + 1, userId, jobId],
      );
    }
  }

  console.log(`[AppEngine] Retry queue processed — ${processed} succeeded`);
  return processed;
};

/**
 * Toggle user kill switch.
 * status: 'active' | 'paused' | 'interviewing' | 'employed'
 */
const updateUserStatus = async (userId, status, isActive) => {
  const result = await db.query(
    `UPDATE users
     SET job_search_status = $1, is_active = $2
     WHERE id = $3
     RETURNING id, job_search_status, is_active`,
    [status, isActive, userId],
  );
  return result.rows[0];
};

module.exports = {
  runPipelineForUser,
  processRetryQueue,
  updateUserStatus,
  pushToRetryQueue,
};
