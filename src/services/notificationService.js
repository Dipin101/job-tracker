// src/services/notificationService.js
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "JobTracker <onboarding@resend.dev>";
const TO = process.env.PERSONAL_EMAIL;

const verifyConnection = () => {
  try {
    if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");
    console.log("[Notifications] Resend transporter ready");
  } catch (err) {
    console.error("[Notifications] Email transporter failed:", err.message);
  }
};

const sendMail = async ({ subject, html, attachments = [] }) => {
  const { error } = await resend.emails.send({
    from: FROM,
    to: TO,
    subject,
    html,
    attachments,
  });
  if (error) throw new Error(error.message);
};

// ─── Auto-applied successfully ────────────────────────────────────────────────
const sendAppliedEmail = async (job) => {
  const subject = `✅ Auto-Applied: ${job.title} at ${job.company}`;
  const html = `
    <h2 style="color:#16a34a;font-family:sans-serif">Applied Successfully</h2>
    <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
      <tr><td style="padding:6px 16px 6px 0;font-weight:bold;color:#374151">Job Title</td><td>${job.title}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-weight:bold;color:#374151">Company</td><td>${job.company}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-weight:bold;color:#374151">Location</td><td>${job.location || "N/A"}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-weight:bold;color:#374151">Match Score</td><td>${job.match_score ?? "N/A"}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-weight:bold;color:#374151">Applied Email</td><td>${process.env.JOB_EMAIL}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-weight:bold;color:#374151">Time</td><td>${new Date().toLocaleString("en-CA", { timeZone: "America/Toronto" })}</td></tr>
    </table>
    <p style="margin-top:16px;font-family:sans-serif">
      <a href="${job.url}" style="color:#2563eb;text-decoration:none">View Job Posting →</a>
    </p>
  `;
  await sendMail({ subject, html });
  console.log(
    `[Notifications] ✅ Sent applied email: ${job.title} @ ${job.company}`,
  );
};

// ─── Manual apply required ────────────────────────────────────────────────────
const sendManualRequiredEmail = async (
  job,
  reason = "CAPTCHA or bot protection detected",
) => {
  const subject = `⚠️ Apply Manually: ${job.title} at ${job.company}`;
  const html = `
    <h2 style="color:#d97706;font-family:sans-serif">Manual Application Required</h2>
    <p style="font-family:sans-serif;color:#374151">The AI could not auto-apply to this job. <strong>Reason: ${reason}</strong></p>
    <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
      <tr><td style="padding:6px 16px 6px 0;font-weight:bold;color:#374151">Job Title</td><td>${job.title}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-weight:bold;color:#374151">Company</td><td>${job.company}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-weight:bold;color:#374151">Location</td><td>${job.location || "N/A"}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-weight:bold;color:#374151">Match Score</td><td>${job.match_score ?? "N/A"}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-weight:bold;color:#374151">Apply Email</td><td>${process.env.JOB_EMAIL}</td></tr>
    </table>
    <p style="margin-top:20px;font-family:sans-serif">
      <a href="${job.url}" style="background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">
        Apply Now →
      </a>
    </p>
  `;

  const attachments = [];
  try {
    const db = require("../db/db");

    const resumeResult = await db.query(
      `SELECT pdf_base64 FROM ai_resumes 
       WHERE user_id = $1 AND job_id = $2 
       ORDER BY created_at DESC LIMIT 1`,
      [job.user_id, job.id],
    );
    if (resumeResult.rows[0]?.pdf_base64) {
      attachments.push({
        filename: `resume-${job.company.replace(/\s+/g, "-")}.pdf`,
        content: resumeResult.rows[0].pdf_base64,
      });
    }

    const coverResult = await db.query(
      `SELECT pdf_base64 FROM cover_letters 
       WHERE user_id = $1 AND job_id = $2 
       ORDER BY created_at DESC LIMIT 1`,
      [job.user_id, job.id],
    );
    if (coverResult.rows[0]?.pdf_base64) {
      attachments.push({
        filename: `cover-letter-${job.company.replace(/\s+/g, "-")}.pdf`,
        content: coverResult.rows[0].pdf_base64,
      });
    }
  } catch (err) {
    console.error(`[Notifications] Failed to fetch attachments:`, err.message);
  }

  await sendMail({ subject, html, attachments });
  console.log(
    `[Notifications] ⚠️  Sent manual-required email: ${job.title} @ ${job.company}`,
  );
};

// ─── Apply attempt failed ─────────────────────────────────────────────────────
const sendFailedEmail = async (job, error = "Unknown error") => {
  const subject = `❌ Apply Failed: ${job.title} at ${job.company}`;
  const html = `
    <h2 style="color:#dc2626;font-family:sans-serif">Application Failed</h2>
    <p style="font-family:sans-serif;color:#374151">The auto-apply crashed with an error.</p>
    <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
      <tr><td style="padding:6px 16px 6px 0;font-weight:bold;color:#374151">Job Title</td><td>${job.title}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-weight:bold;color:#374151">Company</td><td>${job.company}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;font-weight:bold;color:#374151">Error</td><td style="color:#dc2626">${error}</td></tr>
    </table>
    <p style="margin-top:16px;font-family:sans-serif">
      <a href="${job.url}" style="color:#2563eb">View Job Posting →</a>
    </p>
  `;
  await sendMail({ subject, html });
  console.log(
    `[Notifications] ❌ Sent failed email: ${job.title} @ ${job.company}`,
  );
};

// ─── Weekly digest ────────────────────────────────────────────────────────────
const sendWeeklyDigest = async ({
  auto_applied = [],
  manual_required = [],
  failed = [],
}) => {
  const total = auto_applied.length + manual_required.length + failed.length;
  if (total === 0) return;

  const subject = `📋 Weekly Job Summary — ${auto_applied.length} applied, ${manual_required.length} need you`;

  const jobRow = (j) => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">${j.title}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">${j.company}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">
        <a href="${j.url}" style="color:#2563eb">Link</a>
      </td>
    </tr>`;

  const section = (title, color, jobs) =>
    jobs.length === 0
      ? ""
      : `
    <h3 style="color:${color};font-family:sans-serif;margin-top:24px">${title} (${jobs.length})</h3>
    <table style="font-family:sans-serif;font-size:13px;border-collapse:collapse;width:100%">
      <thead>
        <tr style="background:#f3f4f6">
          <th style="padding:8px 12px;text-align:left">Title</th>
          <th style="padding:8px 12px;text-align:left">Company</th>
          <th style="padding:8px 12px;text-align:left">Link</th>
        </tr>
      </thead>
      <tbody>${jobs.map(jobRow).join("")}</tbody>
    </table>`;

  const html = `
    <h2 style="font-family:sans-serif">Job Application Weekly Summary</h2>
    <p style="font-family:sans-serif;color:#6b7280">${new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto", weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
    ${section("✅ Auto-Applied", "#16a34a", auto_applied)}
    ${section("⚠️ Manual Apply Required", "#d97706", manual_required)}
    ${section("❌ Failed", "#dc2626", failed)}
  `;

  await sendMail({ subject, html });
  console.log(`[Notifications] 📋 Weekly digest sent — ${total} jobs`);
};

module.exports = {
  verifyConnection,
  sendAppliedEmail,
  sendManualRequiredEmail,
  sendFailedEmail,
  sendWeeklyDigest,
};
