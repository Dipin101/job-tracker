// src/services/applyService.js
const db = require("../db/db");
const documentService = require("./documentService");
const { applyToJob } = require("./playwrightAgent");
const notificationService = require("./notificationService");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Run the full apply pipeline for a single matched job.
 *
 * Flow:
 *   1. Generate AI resume + cover letter tailored to the job
 *   2. Attempt auto-apply via Playwright
 *      a. Simple form → fill with JOB_EMAIL + generated docs → submit
 *      b. CAPTCHA / bot wall / ATS → flag manual_required
 *   3. Save result to applications table
 *   4. Send email notification (applied or manual required)
 *
 * @param {string} jobId
 * @param {string} userId
 * @returns {{ status, job, applicationId }}
 */
const processApplication = async (jobId, userId) => {
  // ── 1. Load job + user ──────────────────────────────────────────────────────
  const { rows: jobRows } = await db.query("SELECT * FROM jobs WHERE id = $1", [
    jobId,
  ]);
  const { rows: userRows } = await db.query(
    "SELECT * FROM users WHERE id = $1",
    [userId],
  );

  if (!jobRows.length) throw new Error(`Job ${jobId} not found`);
  if (!userRows.length) throw new Error(`User ${userId} not found`);

  const job = jobRows[0];
  const user = userRows[0];

  console.log(
    `\n[ApplyService] ── Processing: ${job.title} @ ${job.company} ──`,
  );

  // ── 2. Check if already applied ────────────────────────────────────────────
  const { rows: existing } = await db.query(
    `SELECT id, status FROM applications WHERE job_id = $1 AND user_id = $2`,
    [jobId, userId],
  );
  if (existing.length) {
    const existingStatus = existing[0].status;
    if (existingStatus !== "pending") {
      console.log(
        `[ApplyService] Already processed with status: ${existingStatus} — skipping`,
      );
      return { status: existingStatus, job, applicationId: existing[0].id };
    }
    // Status is pending — continue and process it
  }

  // ── 3. Generate tailored resume + cover letter ──────────────────────────────
  let coverLetter = "";
  let resumePath = null;

  try {
    console.log(`[ApplyService] Generating docs for ${job.title}...`);
    const docs = await documentService.generateDocuments(user.id, job.id);
    coverLetter = docs.coverLetter?.content || "";

    if (docs.resume?.pdf_base64) {
      resumePath = path.join(os.tmpdir(), `resume_${user.id}_${job.id}.pdf`);
      fs.writeFileSync(
        resumePath,
        Buffer.from(docs.resume.pdf_base64, "base64"),
      );
      console.log(`[ApplyService] Resume written to tmp: ${resumePath}`);
    }

    console.log(
      `[ApplyService] Docs ready — resume: ${resumePath ? "yes" : "no"}, cover letter: ${coverLetter.length} chars`,
    );
  } catch (err) {
    console.error(
      `[ApplyService] Doc generation failed: ${err.message} — proceeding without`,
    );
  }

  // ── 4. Attempt auto-apply via Playwright ────────────────────────────────────
  let applyResult = {
    status: "manual_required",
    reason: "Playwright not attempted",
  };

  try {
    applyResult = await applyToJob(job, user, coverLetter, resumePath);
  } catch (err) {
    console.error(`[ApplyService] Playwright crashed: ${err.message}`);
    applyResult = {
      status: "manual_required",
      reason: `Playwright crash: ${err.message}`,
    };
  } finally {
    // Clean up temp resume file after apply attempt
    if (resumePath && fs.existsSync(resumePath)) {
      fs.unlinkSync(resumePath);
      console.log(`[ApplyService] Cleaned up temp resume: ${resumePath}`);
    }
  }

  const { status, reason, fields } = applyResult;

  // ── 5. Save to applications table ───────────────────────────────────────────
  const { rows: appRows } = await db.query(
    `UPDATE applications 
   SET status = $3, apply_method = $4, apply_attempted_at = NOW(),
       apply_error = $5, resume_path = $6, notification_sent = false
   WHERE job_id = $1 AND user_id = $2
   RETURNING id`,
    [
      jobId,
      userId,
      status,
      status === "auto_applied" ? "auto" : "manual",
      reason || null,
      resumePath,
    ],
  );

  const applicationId = appRows[0].id;
  console.log(
    `[ApplyService] Saved application #${applicationId} — status: ${status}`,
  );

  // ── 6. Send notification ────────────────────────────────────────────────────
  // notifications are sent as daily digest at end of run, not per job

  return { status, job, applicationId, fields };
};

/**
 * Run the apply pipeline for all matched jobs above the threshold.
 *
 * @param {string} userId
 * @param {object} options
 * @param {number} options.limit          - max jobs to process in one run (default 20)
 * @param {number} options.threshold      - min match score (default 55)
 * @param {function} onJobProcessed       - optional SSE callback: ({ jobId, title, company, status, matchScore })
 */
const processAllMatched = async (
  userId,
  { limit = 20, threshold = 55 } = {},
  onJobProcessed = null,
) => {
  const { rows: jobs } = await db.query(
    `SELECT j.*, a.match_score, a.matched_skills, a.missing_skills, a.match_reasoning
   FROM jobs j
   INNER JOIN applications a ON a.job_id = j.id AND a.user_id = $1
   WHERE a.match_score >= $2
     AND a.status = 'pending'
     AND j.location NOT ILIKE '%Quebec%'
     AND j.location NOT ILIKE '% QC%'
     AND j.location NOT ILIKE '%Québec%'
   ORDER BY a.match_score DESC
   LIMIT $3`,
    [userId, threshold, limit],
  );

  console.log(
    `\n[ApplyService] Found ${jobs.length} unprocessed matched jobs (score ≥ ${threshold})`,
  );

  const results = { auto_applied: [], manual_required: [], failed: [] };

  for (const job of jobs) {
    let jobStatus = "failed";

    try {
      const result = await processApplication(job.id, userId);
      jobStatus = result.status;
      if (result.status === "auto_applied") results.auto_applied.push(job);
      else results.manual_required.push(job);
    } catch (err) {
      console.error(
        `[ApplyService] Failed processing job ${job.id}: ${err.message}`,
      );
      results.failed.push(job);

      // Save failed state to DB so we don't retry endlessly
      await db
        .query(
          `INSERT INTO applications (user_id, job_id, status, apply_attempted_at, notes)
           VALUES ($1, $2, 'manual_required', NOW(), $3)
           ON CONFLICT DO NOTHING`,
          [userId, job.id, `Processing error: ${err.message}`],
        )
        .catch(() => {});
    }

    // Emit progress to SSE stream if caller provided a callback
    if (onJobProcessed) {
      onJobProcessed({
        jobId: job.id,
        title: job.title,
        company: job.company,
        status: jobStatus,
        matchScore: job.match_score,
      });
    }

    // Small pause between jobs so we don't hammer sites
    await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));
  }

  // ── Send Weekly digest ───────────────────────────────────────────────────────
  try {
    await notificationService.sendDailyDigest(results);
  } catch (err) {
    console.error(`[ApplyService] Digest notification failed: ${err.message}`);
  }

  console.log(`\n[ApplyService] ── Run complete ──`);
  console.log(`  ✅ Auto-applied:     ${results.auto_applied.length}`);
  console.log(`  ⚠️  Manual required:  ${results.manual_required.length}`);
  console.log(`  ❌ Failed:           ${results.failed.length}`);

  return {
    ...results,
    autoApplied: results.auto_applied.length,
    manualRequired: results.manual_required.length,
    failed: results.failed.length,
    total: jobs.length,
  };
};

/**
 * Mark a manually-applied job as manually_applied in the DB.
 * Call this from your dashboard when you apply to a manual_required job yourself.
 *
 * @param {string} applicationId
 */
const markManuallyApplied = async (applicationId) => {
  await db.query(
    `UPDATE applications SET status = 'manually_applied', apply_attempted_at = NOW() WHERE id = $1`,
    [applicationId],
  );
  console.log(
    `[ApplyService] Marked application #${applicationId} as manually_applied`,
  );
};

module.exports = { processApplication, processAllMatched, markManuallyApplied };
