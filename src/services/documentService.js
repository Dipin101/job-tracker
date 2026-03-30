const Anthropic = require("@anthropic-ai/sdk");
const db = require("../db/db");
const { generateResumePDF, generateCoverLetterPDF } = require("./pdfService");

const client = new Anthropic();

/**
 * Fetch everything needed to generate documents for a user + job.
 * Called ONCE per generateDocuments run — shared between resume and cover letter.
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

  return { user, job, resume, github, application };
};

// ─────────────────────────────────────────────────────────────────────────────
// RESUME
// ─────────────────────────────────────────────────────────────────────────────
const generateResume = async (userId, jobId, context) => {
  const { user, job, resume, github, application } = context;

  const githubSkills = github?.analyzed_skills || [];
  const cvSkills = resume.extracted_skills || [];
  const allSkills = [...new Set([...cvSkills, ...githubSkills])];
  const githubUrl = github?.github_url || null;

  const prompt = `You are an expert technical resume writer who creates highly targeted, job-specific resumes.

CORE PHILOSOPHY:
Every resume must feel written specifically for THIS job at THIS company — not a generic CV with keywords swapped.
A recruiter reading this should immediately see why this candidate fits this specific role.

STEP 1 — ANALYSE THE JOB (do this mentally before writing):
- What are the top 3 technical requirements this job cares about most?
- What type of company is this? (startup/enterprise/agency/consulting/fintech/etc)
- What seniority and working style do they expect? (collaborative/independent/fast-paced/process-driven)
- Which of the candidate's experiences map most directly to these requirements?

STEP 2 — TAILOR EVERY SECTION accordingly:
- CAREER SUMMARY: 2-3 sentences that speak directly to what this job needs — mention their domain if relevant (fintech, consulting, SaaS etc). No generic openers.
- TECHNICAL SKILLS: reorder so the most job-relevant skills appear first in each category. Always include a Testing category with Vitest and React Testing Library separate from Tools & Practices.
- WORK EXPERIENCE: for each role, lead bullets with the skills/outcomes this job cares about most. Same experience should be described differently for a React-heavy role vs a Node-heavy role vs a consulting role.
- PROJECTS: feature the project most relevant to this job first. Describe it through the lens of what this job values.

STEP 3 — BULLET POINT RULES:
- Never start two bullets in the same section with the same verb
- Use varied action verbs: Built, Architected, Delivered, Implemented, Designed, Optimised, Integrated, Deployed, Led, Developed — pick based on what fits
- Each bullet must contain at least one specific detail (number, technology, outcome, or method)
- Every bullet MUST be under 120 characters — count them before writing
- One idea per bullet — no "and" chaining two achievements together
- If you find yourself writing a long bullet, cut the weakest half — shorter is stronger

STRICT RULES:
- ONLY use skills and experience from the candidate's CV — never fabricate
- ALL CAPS section headers
- "- " for bullets
- No contact info — added automatically
- Start with first section header
- HARD LIMIT: 1 page maximum — total bullets across all sections max 9
- NEVER overflow — the PDF cuts at 1 page
- Education now appears above Work Experience — account for this extra vertical space by being aggressive with bullet trimming
- Work experience: maximum 2 bullets per role regardless of relevance
- Projects: maximum 2 bullets each, maximum 3 projects shown
- Career summary: maximum 2 sentences, never 3

LAYOUT STRATEGY:
- All roles: maximum 2 bullets, each max 2 lines
- HIGH relevance project → 2 bullets
- LOW relevance role/project → 1 bullet or omit entirely
- Target 95-98% page fill — not sparse, not overflowing
- Education now sits above Work Experience — this consumes extra vertical space, compensate by trimming bullets aggressively

WORK EXPERIENCE FORMAT:
JOB TITLE | Company | Location    Month Year – Month Year
- bullet
- bullet

CRITICAL: Location must be the COUNTRY only — never city, state, or province.

PROJECTS FORMAT (follow exactly):
PROJECT NAME | Live Demo/GitHub Link    Year
Tech1 • Tech2 • Tech3 • Tech4 (max 4)    
- bullet
- bullet

CRITICAL FOR PROJECT TECH STACK — always show strongest skills first:
- ALWAYS lead with the most impressive/specific technologies (React.js, Node.js, TypeScript, Express.js, MongoDB Atlas)
- NEVER lead with HTML5, CSS3, or JavaScript alone

EDUCATION FORMAT:
Degree | Institution    Year – Year
Keep institution names short — abbreviate if needed to fit one line

CANDIDATE LINKS:
- GitHub: ${user.github_url || ""}
- Portfolio/Live Demo: ${user.portfolio_url || ""}

CANDIDATE SKILLS: ${allSkills.join(", ")}

CANDIDATE CV:
${resume.raw_text}

TARGET JOB:
Title: ${job.title}
Company: ${job.company}
Experience Level: ${job.experience_level}
Description: ${job.description}

Matched skills: ${application?.matched_skills?.join(", ") || "none"}
Missing skills: ${application?.missing_skills?.join(", ") || "none"}
Match score: ${application?.match_score ?? "N/A"}%

Now write the tailored resume. Make it feel unmistakably written for ${job.title} at ${job.company}.`;

  const userObj = { ...user, cvSkills: allSkills, github_url: githubUrl };

  // ── Pass 1 — Sonnet, full creative generation ──────────────────────────────
  const pass1Response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  let resumeContent = pass1Response.content[0].text.trim();
  let pass1Result = await generateResumePDF(resumeContent, userObj);
  let { fillRatio, dynamicFillRatio } = pass1Result;

  console.log(
    `[DocumentService] Resume pass 1 — page: ${(fillRatio * 100).toFixed(1)}% | dynamic: ${(dynamicFillRatio * 100).toFixed(1)}%`,
  );

  // ── Pass 2 — Haiku, mechanical layout correction only ─────────────────────
  if (dynamicFillRatio < 0.96 || fillRatio > 1.0) {
    let correctionInstruction = "";

    if (fillRatio > 1.0) {
      const overBy = Math.round((fillRatio - 0.98) * 100);
      correctionInstruction = `
CORRECTION PASS — Dynamic fill: ${(dynamicFillRatio * 100).toFixed(1)}% (over by ~${overBy}%)
The resume overflows. Trim ONLY work experience and project bullets:
- Shorten the ${Math.ceil(overBy / 5)} least relevant bullets to 1 tight line each
- If still over, remove 1 bullet from the least relevant role or project
- Do NOT touch education, certificates, or section headings
Output the complete corrected resume.`;
    } else {
      const underBy = Math.round((0.98 - dynamicFillRatio) * 100);
      correctionInstruction = `
CORRECTION PASS — Dynamic fill: ${(dynamicFillRatio * 100).toFixed(1)}% (under by ~${underBy}%)
Expand work experience and projects to fill space:
- Expand the ${Math.ceil(underBy / 5)} most relevant bullets by 1 line with specific detail from the CV
- If still under, add a bullet to the most relevant role or project
- HARD LIMIT: never exceed 2 bullets per work experience role
- Do NOT touch education, certificates, skills, or summary
- Do NOT fabricate anything — only use what is in the CV
- Keep ALL bullets under 120 characters
Output the complete corrected resume.`;
    }

    // Haiku for mechanical correction — no creative writing needed here
    const pass2Response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [
        { role: "user", content: prompt },
        { role: "assistant", content: resumeContent },
        { role: "user", content: correctionInstruction },
      ],
    });

    resumeContent = pass2Response.content[0].text.trim();
    const pass2Result = await generateResumePDF(resumeContent, userObj);
    fillRatio = pass2Result.fillRatio;
    pass1Result = pass2Result;

    console.log(
      `[DocumentService] Resume pass 2 (Haiku) — fill: ${(fillRatio * 100).toFixed(1)}%`,
    );
  }

  const pdfBase64 = pass1Result.buffer.toString("base64");

  const result = await db.query(
    `INSERT INTO ai_resumes (user_id, job_id, base_resume_id, content, pdf_base64)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, job_id) DO UPDATE
       SET content    = EXCLUDED.content,
           pdf_base64 = EXCLUDED.pdf_base64,
           created_at = NOW()
     RETURNING *`,
    [userId, jobId, resume.id, resumeContent, pdfBase64],
  );

  console.log(
    `[DocumentService] Resume generated for "${job.title}" at ${job.company}`,
  );
  return result.rows[0];
};

// ─────────────────────────────────────────────────────────────────────────────
// COVER LETTER
// ─────────────────────────────────────────────────────────────────────────────
const generateCoverLetter = async (userId, jobId, context) => {
  const { user, job, resume, github, application } = context;

  const githubSkills = github?.analyzed_skills || [];
  const cvSkills = resume.extracted_skills || [];
  const allSkills = [...new Set([...cvSkills, ...githubSkills])];

  const prompt = `You are a cover letter writer for a junior developer. Every cover letter you write must feel completely unique to THIS job at THIS company — never generic, never templated.
 
════════════════════════════════════════
WHO THIS PERSON IS
════════════════════════════════════════
${user.bio_summary || "A recent graduate with full stack development skills looking for their first professional role."}
 
════════════════════════════════════════
THE 3-PARAGRAPH STRUCTURE (follow exactly)
════════════════════════════════════════
 
PARAGRAPH 1 — What you built + who you are + why THIS company (60-75 words)
Open with something specific you BUILT or SHIPPED from the CV.
This is NOT "I am a recent graduate" — open with a project or technical challenge.
Bridge to who you are in ONE sentence. Connect to THIS company specifically.
 
PARAGRAPH 2 — What you've done with proof (100-120 words)
Pick the 2-3 experiences from the CV that most directly answer what the job is asking for.
Use numbers if they exist. Connect each piece of evidence to a SPECIFIC requirement from the job description.
Language to use: "shipped", "built", "designed", "debugged", "integrated"
Language to NEVER use: "I have experience in", "I am proficient at", "I am skilled in"
 
PARAGRAPH 3 — Why you fit + confident call to action (60-75 words)
Reference something concrete from the job description. End with confidence not gratitude.
NOT: "I look forward to hearing from you"
YES: "I'd welcome the chance to talk through what I've built"
 
════════════════════════════════════════
BANNED PHRASES — never use these
════════════════════════════════════════
"I am excited to apply", "I am passionate about", "I would love the opportunity",
"aligns perfectly with my", "I look forward to hearing from you",
"Thank you for considering my application", "I am a quick learner",
"I am a team player", "I have a strong foundation in", "I am eager to contribute"
 
════════════════════════════════════════
STRICT RULES
════════════════════════════════════════
- ONLY use skills and experience from the candidate's CV — never fabricate
- Target 250-270 words total across all 3 paragraphs
- Do NOT include date, address, greeting, sign-off, or name — added automatically
- Output ONLY the 3 body paragraphs separated by blank lines, nothing else
- NEVER use bullet points, dashes, or lists — prose paragraphs only
 
════════════════════════════════════════
CANDIDATE DATA
════════════════════════════════════════
Skills: ${allSkills.join(", ")}
 
CV:
${resume.raw_text.slice(0, 1500)}
 
TARGET JOB:
Title: ${job.title}
Company: ${job.company}
Description: ${job.description.slice(0, 800)}
 
Matched skills (prioritize these in P2): ${application?.matched_skills?.join(", ") || "none"}
Missing skills (acknowledge naturally if relevant): ${application?.missing_skills?.join(", ") || "none"}
 
Now write the cover letter. P1 must open with something you built. P2 must make the recruiter think "this person actually has the skills". P3 must end with confidence not gratitude.`;

  const countWords = (text) => text.trim().split(/\s+/).length;

  // ── Pass 1 — Sonnet, full creative generation ──────────────────────────────
  const pass1Response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 900,
    messages: [{ role: "user", content: prompt }],
  });

  let clContent = pass1Response.content[0].text.trim();
  let wordCount = countWords(clContent);
  console.log(
    `[DocumentService] Cover letter pass 1 — word count: ${wordCount}`,
  );

  // ── Pass 2 — only if outside 245-275 range ─────────────────────────────────
  if (wordCount < 245 || wordCount > 275) {
    // trimming = Haiku (mechanical), expanding = Sonnet (creative)
    const needsExpansion = wordCount < 245;
    const model = needsExpansion
      ? "claude-sonnet-4-20250514"
      : "claude-haiku-4-5-20251001";

    let correctionPrompt = "";
    if (needsExpansion) {
      const needed = 260 - wordCount;
      correctionPrompt =
        prompt +
        `

REVISION REQUIRED — Word count: ${wordCount} (target: 245-275 words)
Too short by ~${needed} words. Expand naturally:
- Add 1-2 sentences to paragraph 2 with more specific technical detail or a concrete outcome from the CV
- Make the evidence more precise — what technology, what problem, what result
Do NOT fabricate anything. Output 3 paragraphs only, no greeting or sign-off.`;
    } else {
      const excess = wordCount - 260;
      correctionPrompt =
        prompt +
        `

REVISION REQUIRED — Word count: ${wordCount} (target: 245-275 words)
Too long by ~${excess} words. Tighten ruthlessly:
- Cut the weakest or most generic sentence from paragraph 2
- Remove any phrase that could appear in any other cover letter
- If a sentence doesn't add specific proof or specific connection to the job, cut it
Output 3 paragraphs only, no greeting or sign-off.`;
    }

    const pass2Response = await client.messages.create({
      model,
      max_tokens: 900,
      messages: [{ role: "user", content: correctionPrompt }],
    });

    clContent = pass2Response.content[0].text.trim();
    wordCount = countWords(clContent);
    console.log(
      `[DocumentService] Cover letter pass 2 (${needsExpansion ? "Sonnet" : "Haiku"}) — word count: ${wordCount}`,
    );
  }

  const clPdfResult = await generateCoverLetterPDF(clContent, user, job);
  const pdfBase64 = clPdfResult.buffer.toString("base64");

  const result = await db.query(
    `INSERT INTO cover_letters (user_id, job_id, content, pdf_base64)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, job_id) DO UPDATE
       SET content    = EXCLUDED.content,
           pdf_base64 = EXCLUDED.pdf_base64,
           created_at = NOW()
     RETURNING *`,
    [userId, jobId, clContent, pdfBase64],
  );

  console.log(
    `[DocumentService] Cover letter generated for "${job.title}" at ${job.company}`,
  );
  return result.rows[0];
};

// ─────────────────────────────────────────────────────────────────────────────
// GENERATE BOTH — context fetched ONCE, shared between both
// ─────────────────────────────────────────────────────────────────────────────
const generateDocuments = async (userId, jobId) => {
  const context = await getGenerationContext(userId, jobId);

  const [resume, coverLetter] = await Promise.all([
    generateResume(userId, jobId, context),
    generateCoverLetter(userId, jobId, context),
  ]);

  return { resume, coverLetter };
};

module.exports = { generateResume, generateCoverLetter, generateDocuments };
