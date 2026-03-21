const db = require("../db/db");
const redis = require("../config/redis");
const { fetchAdzunaJobs } = require("./adzunaService");
const { fetchIndeedJobs } = require("./indeedRSSService");
const { fetchJoobleJobs } = require("./joobleService");
const { fetchJobBankJobs } = require("./jobBankService");
const { fetchArbeitnowJobs } = require("./arbeitNowService");

const BATCH_CACHE_KEY = "jobs:batch:latest";
const CACHE_TTL = 60 * 60 * 6; // 6 hours

// Small delay helper to avoid rate limiting
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * Fetch jobs from all sources, deduplicate, save to DB, cache in Redis.
 *
 * @param {Object} user  - User row from DB (needs id, country)
 * @param {string} query - Search keywords
 */
const fetchAndStoreJobs = async (user, query = "junior software developer") => {
  const country = user.country || "ca";
  console.log(
    `[JobService] Fetching for user ${user.id} | country: ${country} | query: "${query}"`,
  );

  // ── Adzuna — sequential with delay to avoid 429 ──────────────────────────
  const adzunaQueries = [
    query,
    "junior full stack developer",
    "junior software engineer",
  ];
  const adzunaJobs = [];
  for (const q of adzunaQueries) {
    const jobs = await fetchAdzunaJobs(country, q);
    adzunaJobs.push(...jobs);
    await delay(1500);
  }

  // ── Other sources in parallel ─────────────────────────────────────────────
  const [indeedResult, joobleResult, jobBankResult, arbeitnowResult] =
    await Promise.allSettled([
      fetchIndeedJobs(query, "", country),
      fetchJoobleJobs(query, country),
      country === "ca" ? fetchJobBankJobs(query) : Promise.resolve([]),
      fetchArbeitnowJobs(query, country),
    ]);

  if (indeedResult.status === "rejected")
    console.error("[JobService] Indeed failed:", indeedResult.reason);
  if (joobleResult.status === "rejected")
    console.error("[JobService] Jooble failed:", joobleResult.reason);
  if (jobBankResult.status === "rejected")
    console.error("[JobService] Job Bank failed:", jobBankResult.reason);
  if (arbeitnowResult.status === "rejected")
    console.error("[JobService] Arbeitnow failed:", arbeitnowResult.reason);

  const allFetched = [
    ...adzunaJobs,
    ...(indeedResult.status === "fulfilled" ? indeedResult.value : []),
    ...(joobleResult.status === "fulfilled" ? joobleResult.value : []),
    ...(jobBankResult.status === "fulfilled" ? jobBankResult.value : []),
    ...(arbeitnowResult.status === "fulfilled" ? arbeitnowResult.value : []),
  ];

  console.log(`[JobService] Total fetched: ${allFetched.length}`);

  if (allFetched.length === 0) return [];

  // Deduplicate against DB
  const externalIds = allFetched.map((j) => j.external_id);
  const existing = await db.query(
    "SELECT external_id FROM jobs WHERE external_id = ANY($1)",
    [externalIds],
  );
  const existingIds = new Set(existing.rows.map((r) => r.external_id));
  const newJobs = allFetched.filter((j) => !existingIds.has(j.external_id));

  console.log(
    `[JobService] New: ${newJobs.length} | Duplicates skipped: ${allFetched.length - newJobs.length}`,
  );

  if (newJobs.length === 0) return [];

  // Save to DB
  const savedJobs = [];
  for (const job of newJobs) {
    try {
      const result = await db.query(
        `INSERT INTO jobs
           (external_id, source, title, company, location, country,
            description, url, salary_min, salary_max,
            experience_level, skills_required, posted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (external_id) DO NOTHING
         RETURNING *`,
        [
          job.external_id,
          job.source,
          job.title,
          job.company,
          job.location,
          job.country,
          job.description,
          job.url,
          job.salary_min,
          job.salary_max,
          job.experience_level,
          job.skills_required,
          job.posted_at,
        ],
      );
      if (result.rows[0]) savedJobs.push(result.rows[0]);
    } catch (err) {
      console.error(
        `[JobService] Failed to save ${job.external_id}:`,
        err.message,
      );
    }
  }

  console.log(`[JobService] Saved ${savedJobs.length} jobs to DB`);

  // Cache job IDs in Redis
  try {
    await redis.setEx(
      BATCH_CACHE_KEY,
      CACHE_TTL,
      JSON.stringify(savedJobs.map((j) => j.id)),
    );
    console.log(`[JobService] Cached ${savedJobs.length} job IDs in Redis`);
  } catch (err) {
    console.error("[JobService] Redis cache failed (non-fatal):", err.message);
  }

  return savedJobs;
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
