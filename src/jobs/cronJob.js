const cron = require("node-cron");
const db = require("../db/db");

const SCHEDULES = [
  "0 8 * * 1-5", // 8am  Mon–Fri
  "0 10 * * 1-5", // 10am Mon–Fri
  "0 13 * * 1-5", // 1pm  Mon–Fri
  "0 15 * * 1-5", // 3pm  Mon–Fri
  "0 9 * * 6,0", // 9am  Sat–Sun
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

  const {
    runPipelineForUser,
  } = require("../services/applicationEngineService");

  for (const user of users) {
    try {
      const result = await runPipelineForUser(user.id);
      console.log(`[Cron] User ${user.id}:`, result);
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
      timezone: "Europe/London",
    });
    console.log(`[Cron] Registered: ${schedule}`);
  });
  console.log(`[Cron] ${SCHEDULES.length} schedules active`);
};

module.exports = { startCronJobs, runJobFetch };
