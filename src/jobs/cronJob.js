const cron = require("node-cron");
const db = require("../db/db");
const { fetchAndStoreJobs } = require("../services/jobService");

/**
 * Smart cron schedule — peak job-posting hours only.
 * Stays under Adzuna's 100 calls/month free limit.
 *
 * Weekdays (Mon–Fri): 8am, 10am, 1pm, 3pm  → 4 runs/day × ~22 days = ~88 runs
 * Weekends (Sat–Sun): 9am only              → 1 run/day × ~8 days  = ~8 runs
 * Total: ~96 runs/month
 */
const SCHEDULES = [
  "0 8 * * 1-5", // 8am  Mon–Fri
  "0 10 * * 1-5", // 10am Mon–Fri
  "0 13 * * 1-5", // 1pm  Mon–Fri
  "0 15 * * 1-5", // 3pm  Mon–Fri
  "0 9 * * 6,0", // 9am  Sat–Sun
];

// Core task — runs on each schedule tick
async function runJobFetch() {
  const startTime = Date.now();
  console.log(
    `\n[Cron] ===== Job fetch started at ${new Date().toISOString()} =====`,
  );

  // Get all active users (not employed, not paused)
  let users;
  try {
    const result = await db.query(
      `SELECT id, country, job_search_status
       FROM users
       WHERE is_active = true
         AND job_search_status != 'employed'`,
    );
    users = result.rows;
  } catch (err) {
    console.error("[Cron] Failed to fetch users:", err.message);
    return;
  }

  if (users.length === 0) {
    console.log("[Cron] No active users — skipping");
    return;
  }

  console.log(`[Cron] Processing ${users.length} active user(s)`);

  // Process each user sequentially to avoid hammering APIs
  // Day 5 will add per-user keyword config for personalised queries
  for (const user of users) {
    try {
      const query = "software engineer"; // TODO Day 5: pull from user profile
      const newJobs = await fetchAndStoreJobs(user, query);
      console.log(`[Cron] User ${user.id}: ${newJobs.length} new jobs`);
    } catch (err) {
      console.error(`[Cron] Error for user ${user.id}:`, err.message);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Cron] ===== Done in ${elapsed}s =====\n`);
}

// Register all schedules — call once from index.js
function startCronJobs() {
  SCHEDULES.forEach((schedule) => {
    cron.schedule(schedule, runJobFetch, {
      timezone: "Europe/London",
    });
    console.log(`[Cron] Registered: ${schedule}`);
  });
  console.log(`[Cron] ${SCHEDULES.length} schedules active`);
}

module.exports = { startCronJobs, runJobFetch };
