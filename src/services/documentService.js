const Anthropic = require("@anthropic-ai/sdk");
const PDFDocument = require("pdfkit");
const db = require("../db/db");

/**
 * Convert plain text content into a PDF buffer.
 */
const generatePDF = (content, title) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const buffers = [];

    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    doc.fontSize(16).font("Helvetica-Bold").text(title, { align: "center" });
    doc.moveDown();

    const lines = content.split("\n");
    for (const line of lines) {
      if (line.trim() === "") {
        doc.moveDown(0.5);
      } else if (line.match(/^[A-Z\s]{3,}$/) && line.trim().length < 30) {
        doc.moveDown(0.3);
        doc.fontSize(12).font("Helvetica-Bold").text(line.trim());
        doc.moveDown(0.2);
      } else if (line.startsWith("- ") || line.startsWith("• ")) {
        doc.fontSize(10).font("Helvetica").text(line.trim(), { indent: 20 });
      } else {
        doc.fontSize(10).font("Helvetica").text(line.trim());
      }
    }

    doc.end();
  });
};

const client = new Anthropic();

/**
 * Fetch everything needed to generate documents for a user + job.
 */
const getGenerationContext = async (userId, jobId) => {
  const [userResult, jobResult, resumeResult, githubResult, applicationResult] =
    await Promise.all([
      db.query("SELECT * FROM users WHERE id = $1", [userId]),
      db.query("SELECT * FROM jobs WHERE id = $1", [jobId]),
      db.query("SELECT * FROM base_resumes WHERE user_id = $1", [userId]),
      db.query(
        "SELECT analyzed_skills FROM github_profiles WHERE user_id = $1",
        [userId],
      ),
      db.query(
        "SELECT * FROM applications WHERE user_id = $1 AND job_id = $2",
        [userId, jobId],
      ),
    ]);

  const user = userResult.rows[0];
  const job = jobResult.rows[0];
  const resume = resumeResult.rows[0];
  const github = githubResult.rows[0];
  const application = applicationResult.rows[0];

  if (!user) throw new Error("User not found");
  if (!job) throw new Error("Job not found");
  if (!resume)
    throw new Error("No base resume found — please upload your CV first");
  if (!application) throw new Error("No application found for this job");
  if (application.status !== "pending") {
    throw new Error(
      `Job status is "${application.status}" — only pending jobs get documents`,
    );
  }

  return { user, job, resume, github, application };
};

/**
 * Generate a tailored resume using Anthropic.
 * Never fabricates skills — only uses what's in the base CV + GitHub.
 */
const generateResume = async (userId, jobId) => {
  const { user, job, resume, github, application } = await getGenerationContext(
    userId,
    jobId,
  );

  const githubSkills = github?.analyzed_skills || [];
  const cvSkills = resume.extracted_skills || [];
  const allSkills = [...new Set([...cvSkills, ...githubSkills])];
  const pageLimit = user.cv_page_limit || 2;

  const prompt = `You are an expert technical resume writer. Your job is to tailor a candidate's existing CV for a specific job posting.

STRICT RULES:
- You may ONLY use skills and experience from the candidate's actual CV below
- NEVER add skills, technologies, or experience the candidate does not have
- NEVER fabricate projects, companies, or achievements
- Reorder and emphasize existing content to best match the job
- Keep it to ${pageLimit} page(s) maximum
- Use clean plain text format with clear sections

CANDIDATE'S ACTUAL SKILLS:
${allSkills.join(", ")}

CANDIDATE'S BASE CV:
${resume.raw_text}

TARGET JOB:
Title: ${job.title}
Company: ${job.company}
Experience Level: ${job.experience_level}
Description: ${job.description}

MATCH CONTEXT:
Matched skills: ${application.matched_skills?.join(", ") || "none"}
Missing skills: ${application.missing_skills?.join(", ") || "none"}
Match score: ${application.match_score}%

Write a tailored resume that emphasizes the matched skills and relevant experience. Do not mention or claim the missing skills.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.content[0].text.trim();

  // Generate PDF
  const pdfBuffer = await generatePDF(
    content,
    `Resume — ${job.title} at ${job.company}`,
  );
  const pdfBase64 = pdfBuffer.toString("base64");

  // Save to DB
  const result = await db.query(
    `INSERT INTO ai_resumes (user_id, job_id, base_resume_id, content, pdf_base64)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, job_id) DO UPDATE
       SET content = EXCLUDED.content,
           pdf_base64 = EXCLUDED.pdf_base64,
           created_at = NOW()
     RETURNING *`,
    [userId, jobId, resume.id, content, pdfBase64],
  );

  console.log(
    `[DocumentService] Resume generated for job "${job.title}" at ${job.company}`,
  );
  return result.rows[0];
};

/**
 * Generate a cover letter using Anthropic.
 * Personalised to the job, honest about skills.
 */
const generateCoverLetter = async (userId, jobId) => {
  const { user, job, resume, github, application } = await getGenerationContext(
    userId,
    jobId,
  );

  const githubSkills = github?.analyzed_skills || [];
  const cvSkills = resume.extracted_skills || [];
  const allSkills = [...new Set([...cvSkills, ...githubSkills])];
  const pageLimit = user.cover_letter_page_limit || 1;

  const prompt = `You are an expert cover letter writer. Write a compelling, honest cover letter for the candidate.

STRICT RULES:
- Only reference skills and experience the candidate actually has
- NEVER claim skills or experience they don't have
- Be specific about their actual matched skills
- Keep it to ${pageLimit} page(s) — roughly 3-4 paragraphs
- Professional but personable tone
- Do not use generic filler phrases like "I am a passionate developer"

CANDIDATE'S ACTUAL SKILLS:
${allSkills.join(", ")}

CANDIDATE'S BACKGROUND (from CV):
${resume.raw_text}

TARGET JOB:
Title: ${job.title}
Company: ${job.company}
Experience Level: ${job.experience_level}
Description: ${job.description}

MATCH CONTEXT:
Matched skills: ${application.matched_skills?.join(", ") || "none"}
Match score: ${application.match_score}%

Write a cover letter addressed to the hiring team at ${job.company}.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.content[0].text.trim();

  // Generate PDF
  const pdfBuffer = await generatePDF(
    content,
    `Cover Letter — ${job.title} at ${job.company}`,
  );
  const pdfBase64 = pdfBuffer.toString("base64");

  // Save to DB
  const result = await db.query(
    `INSERT INTO cover_letters (user_id, job_id, content, pdf_base64)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, job_id) DO UPDATE
       SET content = EXCLUDED.content,
           pdf_base64 = EXCLUDED.pdf_base64,
           created_at = NOW()
     RETURNING *`,
    [userId, jobId, content, pdfBase64],
  );

  console.log(
    `[DocumentService] Cover letter generated for job "${job.title}" at ${job.company}`,
  );
  return result.rows[0];
};

/**
 * Generate both resume and cover letter for a job in one call.
 */
const generateDocuments = async (userId, jobId) => {
  const [resume, coverLetter] = await Promise.all([
    generateResume(userId, jobId),
    generateCoverLetter(userId, jobId),
  ]);

  return { resume, coverLetter };
};

module.exports = { generateResume, generateCoverLetter, generateDocuments };
