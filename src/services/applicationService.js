const pLimit = require("p-limit");
const db = require("../db/db");
const {
  getUserSkills,
  scoreRuleBased,
  scoreWithAI,
  hasAppliedRecently,
  // getThresholds,
} = require("./matchingService");

// ─────────────────────────────────────────────────────────────────────────────
// PROCESS ALL JOBS — batched, efficient
// ─────────────────────────────────────────────────────────────────────────────
const processAllJobsForUser = async (user, userPrefs = {}) => {
  // 1. get user skills ONCE
  const userSkills = await getUserSkills(user.id);

  if (userSkills.length === 0) {
    console.log(`[AppService] User ${user.id} has no skills — skipping`);
    return { processed: 0, applied: 0, skipped: 0, favourites: 0 };
  }

  // 2. fetch all pending jobs
  const { rows: jobs } = await db.query(
    `SELECT * FROM jobs
     WHERE match_status = 'pending'
     AND country = $1
     ORDER BY posted_at DESC
     LIMIT 200`,
    [user.country || "ca"],
  );

  console.log(`[AppService] ${jobs.length} pending jobs for user ${user.id}`);

  if (jobs.length === 0) {
    return { processed: 0, applied: 0, skipped: 0, favourites: 0 };
  }

  // 3. rule-based score ALL jobs — pure JS, no AI
  const ruleScored = jobs.map((job) => ({
    job,
    ...scoreRuleBased(userSkills, job, user, userPrefs),
  }));

  // 4. mark ALL fetched jobs as matched so they never get reprocessed
  await db.query(
    `UPDATE jobs SET match_status = 'matched' WHERE id = ANY($1)`,
    [jobs.map((j) => j.id)],
  );

  // 5. drop pre-filter skips, sort by rule score, take top 15
  const eligible = ruleScored.filter((r) => !r.skipped);
  const top15 = eligible.sort((a, b) => b.preScore - a.preScore).slice(0, 15);

  console.log(
    `[AppService] ${eligible.length} eligible after pre-filter → AI scoring top ${top15.length}`,
  );

  if (top15.length === 0) {
    return {
      processed: jobs.length,
      applied: 0,
      skipped: jobs.length,
      favourites: 0,
    };
  }

  // 6. AI score top 15 — Haiku, max 2 concurrent
  const limit = pLimit(2);
  const aiResults = await Promise.all(
    top15.map(({ job, preScore, userTitles }) =>
      limit(async () => {
        const alreadyApplied = await hasAppliedRecently(
          user.id,
          job.id,
          user.reapply_threshold_days || 60,
        );
        if (alreadyApplied) {
          console.log(`[AppService] Already applied to ${job.id} — skipping`);
          return null;
        }
        return scoreWithAI(userSkills, job, preScore, user, userTitles);
      }),
    ),
  );

  // 7. save results
  let applied = 0,
    skipped = 0,
    favourites = 0;

  for (const result of aiResults) {
    if (!result) {
      skipped++;
      continue;
    }

    const status = result.decision === "apply" ? "pending" : "skipped";

    try {
      await db.query(
        `INSERT INTO applications
           (user_id, job_id, match_score, matched_skills, missing_skills,
            match_reasoning, is_favourite, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id, job_id) DO UPDATE
           SET match_score    = EXCLUDED.match_score,
               matched_skills = EXCLUDED.matched_skills,
               missing_skills = EXCLUDED.missing_skills,
               match_reasoning = EXCLUDED.match_reasoning,
               is_favourite   = EXCLUDED.is_favourite,
               status         = EXCLUDED.status`,
        [
          user.id,
          result.job_id,
          result.score,
          result.matched_skills,
          result.missing_skills,
          result.reasoning,
          result.is_favourite,
          status,
        ],
      );

      if (status === "pending") applied++;
      else skipped++;
      if (result.is_favourite) favourites++;

      const job = top15.find((r) => r.job.id === result.job_id)?.job;
      console.log(
        `[AppService] Saved: "${job?.title}" | score: ${result.score} | status: ${status} | fav: ${result.is_favourite}`,
      );
    } catch (err) {
      console.error(
        `[AppService] Failed to save ${result.job_id}:`,
        err.message,
      );
    }
  }

  const summary = { processed: jobs.length, applied, skipped, favourites };
  console.log(`[AppService] Done for user ${user.id}:`, summary);
  return summary;
};

// ─────────────────────────────────────────────────────────────────────────────
// PROCESS SINGLE JOB — kept for backwards compat
// ─────────────────────────────────────────────────────────────────────────────
const processJobForUser = async (user, job, userPrefs = {}) => {
  const userSkills = await getUserSkills(user.id);
  const ruleResult = scoreRuleBased(userSkills, job, user, userPrefs);

  if (ruleResult.skipped) return null;

  const result = await scoreWithAI(
    userSkills,
    job,
    ruleResult.preScore,
    user,
    ruleResult.userTitles,
  );
  if (!result) return null;

  const status = result.decision === "apply" ? "pending" : "skipped";

  const { rows } = await db.query(
    `INSERT INTO applications
       (user_id, job_id, match_score, matched_skills, missing_skills,
        match_reasoning, is_favourite, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, job_id) DO UPDATE
       SET match_score     = EXCLUDED.match_score,
           matched_skills  = EXCLUDED.matched_skills,
           missing_skills  = EXCLUDED.missing_skills,
           match_reasoning = EXCLUDED.match_reasoning,
           is_favourite    = EXCLUDED.is_favourite,
           status          = EXCLUDED.status
     RETURNING *`,
    [
      user.id,
      result.job_id,
      result.score,
      result.matched_skills,
      result.missing_skills,
      result.reasoning,
      result.is_favourite,
      status,
    ],
  );

  return rows[0];
};

module.exports = { processJobForUser, processAllJobsForUser };
