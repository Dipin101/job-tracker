const db = require("../db/db");
const redis = require("../config/redis");
const fetchRealJobs = require("../scripts/fetchRealJobs");

const BATCH_CACHE_KEY = "jobs:batch:latest";
const CACHE_TTL = 60 * 60 * 6; // 6 hours

/**
 * Fetch jobs from all sources, deduplicate, save to DB, cache in Redis.
 * Delegates to fetchRealJobs script which handles Adzuna + JSearch.
 *
 * @param {Object} user  - User row from DB (needs id, country)
 * @param {string} query - Search keywords (unused — fetchRealJobs uses its own queries)
 */
const fetchAndStoreJobs = async (user, query = "junior software developer") => {
  console.log(
    `[JobService] Fetching for user ${user.id} | country: ${user.country || "ca"}`,
  );

  const saved = await fetchRealJobs();

  // Cache latest job IDs in Redis
  try {
    const result = await db.query(
      `SELECT id FROM jobs ORDER BY posted_at DESC LIMIT 200`,
    );
    const ids = result.rows.map((r) => r.id);
    await redis.setEx(BATCH_CACHE_KEY, CACHE_TTL, JSON.stringify(ids));
    console.log(`[JobService] Cached ${ids.length} job IDs in Redis`);
  } catch (err) {
    console.error("[JobService] Redis cache failed (non-fatal):", err.message);
  }

  const jobsResult = await db.query(
    `SELECT * FROM jobs ORDER BY posted_at DESC LIMIT ${saved || 50}`,
  );
  return jobsResult.rows;
};

/**
 * Get latest batch from Redis cache.
 * Falls back to recent DB query if cache is cold.
 */
const getLatestBatch = async () => {
  try {
    const cached = await redis.get(BATCH_CACHE_KEY);
    if (cached) {
      const ids = JSON.parse(cached);
      if (ids.length === 0) return [];
      const result = await db.query(
        "SELECT * FROM jobs WHERE id = ANY($1) ORDER BY posted_at DESC",
        [ids],
      );
      return result.rows;
    }
  } catch (err) {
    console.error(
      "[JobService] Redis get failed, falling back to DB:",
      err.message,
    );
  }

  // Cache miss — pull last 6h from DB
  const result = await db.query(
    `SELECT * FROM jobs
     WHERE posted_at >= NOW() - INTERVAL '6 hours'
     ORDER BY posted_at DESC
     LIMIT 100`,
  );
  return result.rows;
};

/**
 * Push a failed job application to the Redis retry queue.
 */
const pushToRetryQueue = async (jobId, userId, reason = "unknown") => {
  try {
    const payload = JSON.stringify({
      jobId,
      userId,
      reason,
      failedAt: new Date().toISOString(),
    });
    await redis.lPush("jobs:retry:queue", payload);
    console.log(
      `[JobService] Retry queue: job ${jobId} for user ${userId} (${reason})`,
    );
  } catch (err) {
    console.error("[JobService] Failed to push retry queue:", err.message);
  }
};

module.exports = { fetchAndStoreJobs, getLatestBatch, pushToRetryQueue };
