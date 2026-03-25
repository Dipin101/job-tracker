const cron = require("node-cron");
const db = require("../db/db");

const SCHEDULES = [
  "0 8 * * 1-5",
  "0 10 * * 1-5",
  "0 13 * * 1-5",
  "0 15 * * 1-5",
  "0 9 * * 6,0",
];

const runJobFetch = async () => {
  const startTime = Date.now();
  console.log(
    `\n[Cron] ===== Pipeline started at ${new Date().toISOString()} =====`,
  );

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

  const pipelineService = require("../services/pipelineService");

  for (const user of users) {
    try {
      await pipelineService.run(user.id, (evt) => {
        console.log(`[Cron] User ${user.id} | ${evt.stage} | ${evt.message}`);
      });
    } catch (err) {
      console.error(`[Cron] Error for user ${user.id}:`, err.message);
    }
  }
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Cron] ===== Done in ${elapsed}s =====\n`);
};

const startCronJobs = () => {
  SCHEDULES.forEach((schedule) => {
    cron.schedule(schedule, runJobFetch, {
      timezone: "America/Toronto",
    });
    console.log(`[Cron] Registered: ${schedule}`);
  });
  // ── Weekly digest — every Sunday at 8am ──────────────────────────────────
  cron.schedule(
    "0 8 * * 0",
    async () => {
      console.log("[Cron] Sending weekly digest...");
      try {
        const notificationService = require("../services/notificationService");
        await notificationService.sendWeeklyDigest();
      } catch (err) {
        console.error("[Cron] Weekly digest failed:", err.message);
      }
    },
    { timezone: "America/Toronto" },
  );

  console.log(
    `[Cron] ${SCHEDULES.length} schedules active + weekly digest on Sundays`,
  );
};

module.exports = { startCronJobs, runJobFetch };
