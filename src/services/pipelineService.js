// src/services/pipelineService.js
const fetchRealJobs = require("../scripts/fetchRealJobs");
const { processAllJobsForUser } = require("./applicationService");
const applyService = require("./applyService");
const db = require("../db/db"); // adjust to your db import

/**
 * Runs the full pipeline for a user, emitting SSE progress events via `send`.
 *
 * @param {string} userId
 * @param {function} send  - SSE emitter: send({ stage, status, message, data? })
 */
const run = async (userId, send) => {
  // ─── Stage 1: Fetch jobs ───────────────────────────────────────────────────
  send({
    stage: "fetch",
    status: "running",
    message: "Fetching fresh job listings…",
  });

  let fetchedCount = 0;
  try {
    fetchedCount = await fetchRealJobs();
    send({
      stage: "fetch",
      status: "complete",
      message: `Fetched ${fetchedCount} new jobs`,
      data: { fetchedCount },
    });
  } catch (err) {
    send({
      stage: "fetch",
      status: "error",
      message: `Fetch failed: ${err.message}`,
    });
    throw err;
  }

  // ─── Stage 2: Match & score ────────────────────────────────────────────────
  send({
    stage: "match",
    status: "running",
    message: "Scoring jobs against your profile…",
  });

  let matchResults;
  try {
    const userResult = await db.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);
    const user = userResult.rows[0];
    const userPrefs = {
      city: user.city || null,
      country: user.country || null,
      remote_ok: user.remote_ok ?? true,
      preferred_companies: user.preferred_companies || [],
      blocked_companies: user.blocked_companies || [],
    };
    matchResults = await processAllJobsForUser(user, userPrefs);
    send({
      stage: "match",
      status: "complete",
      message: `${matchResults.processed} jobs matched your threshold`,
      data: matchResults,
    });
  } catch (err) {
    send({
      stage: "match",
      status: "error",
      message: `Matching failed: ${err.message}`,
    });
    throw err;
  }

  // ─── Stage 3: Apply ────────────────────────────────────────────────────────
  send({
    stage: "apply",
    status: "running",
    message: "Generating documents & applying…",
  });

  let applyResults;
  try {
    // applyService.run should accept a progress callback for per-job updates
    applyResults = await applyService.processAllMatched(
      userId,
      {},
      (jobUpdate) => {
        // jobUpdate: { jobId, title, company, status, matchScore }
        send({
          stage: "apply",
          status: "running",
          message: `Processed: ${jobUpdate.title} at ${jobUpdate.company}`,
          data: jobUpdate,
        });
      },
    );

    send({
      stage: "apply",
      status: "complete",
      message: `Applied to ${applyResults.autoApplied} jobs, ${applyResults.manualRequired} need manual review`,
      data: applyResults,
    });
  } catch (err) {
    send({
      stage: "apply",
      status: "error",
      message: `Apply stage failed: ${err.message}`,
    });
    throw err;
  }

  // ─── Done ──────────────────────────────────────────────────────────────────
  const appliedJobs = await getLatestResults(userId);
  send({
    stage: "done",
    status: "complete",
    message: "Pipeline complete",
    data: {
      fetchedCount,
      ...matchResults,
      ...applyResults,
      jobs: appliedJobs,
    },
  });
};

/**
 * Returns the most recently processed applications for display in the dashboard.
 */
const getLatestResults = async (userId) => {
  const { rows } = await db.query(
    `SELECT
       a.id,
       a.status,
       a.match_score,
       a.apply_method,
       a.matched_skills,
       a.missing_skills,
       a.match_reasoning,
       a.apply_attempted_at,
       j.title,
       j.company,
       j.location,
       j.url,
       j.salary_min,
       j.salary_max
     FROM applications a
     JOIN jobs j ON j.id = a.job_id
     WHERE a.user_id = $1
       AND a.status NOT IN ('skipped', 'pending')
       AND a.apply_attempted_at >= NOW() - INTERVAL '24 hours'
     ORDER BY a.apply_attempted_at DESC
     LIMIT 50`,
    [userId],
  );
  return rows;
};

module.exports = { run, getLatestResults };
