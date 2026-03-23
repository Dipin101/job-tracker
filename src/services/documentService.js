const Anthropic = require("@anthropic-ai/sdk");
const db = require("../db/db");
const { generateResumePDF, generateCoverLetterPDF } = require("./pdfService");

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
  // if (!application) throw new Error("No application found for this job");
  // if (application.status !== "pending") {
  //   throw new Error(
  //     `Job status is "${application.status}" — only pending jobs get documents`,
  //   );
  // }

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
  // const pageLimit = user.cv_page_limit || 1; // default 1 page for entry-level
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
- TECHNICAL SKILLS: reorder so the most job-relevant skills appear first in each category
- WORK EXPERIENCE: for each role, lead bullets with the skills/outcomes this job cares about most. Same experience should be described differently for a React-heavy role vs a Node-heavy role vs a consulting role.
- PROJECTS: feature the project most relevant to this job first. Describe it through the lens of what this job values.

STEP 3 — BULLET POINT RULES:
- Never start two bullets in the same section with the same verb
- Use varied action verbs: Built, Architected, Delivered, Implemented, Designed, Optimised, Integrated, Deployed, Led, Developed — pick based on what fits
- Each bullet must contain at least one specific detail (number, technology, outcome, or method)
- Every bullet MUST be under 120 characters — count them before writing
- One idea per bullet — no "and" chaining two achievements together
- If you find yourself writing a long bullet, cut the weakest half — shorter is stronger
- Bad: "Engineered full-stack platform with 3 data models, protected REST API routes via Express.js and Firebase Auth handling habit, sleep and mood data with secure user authentication"
- Good: "Engineered full-stack platform with 3 data models and protected REST API routes via Express.js and Firebase Auth"
- The good example is 1 clean line. That is the target for every bullet.

STRICT RULES:
- ONLY use skills and experience from the candidate's CV — never fabricate
- ALL CAPS section headers
- "- " for bullets
- No contact info — added automatically
- Start with first section header
- HARD LIMIT: 1 page maximum — total bullets across all sections max 10
- NEVER overflow — the PDF cuts at 1 page
- Education and certificates MUST always be visible — if they don't fit, remove bullets not sections
- Work experience: maximum 3 bullets for HIGH relevance roles, maximum 2 for MEDIUM relevance
- Projects: maximum 2 bullets each
- If you are unsure whether content fits, remove the weakest bullet — never sacrifice education and certificates

LAYOUT STRATEGY:
- HIGH relevance role/project → 3 bullets maximum, each max 2 lines
- MEDIUM relevance → 2 bullets
- LOW relevance → 1 bullet or omit
- Target 98-100% page fill — not sparse, not overflowing

WORK EXPERIENCE FORMAT:
JOB TITLE | Company | Location    Month Year – Month Year
- bullet
- bullet

CRITICAL: Location must be the COUNTRY only — never city, state, or province ("Canada" not "Ontario, Canada", "United States" not "New York, NY", "Nepal" not "Sanepa, Nepal"). The entire left side MUST fit on one line.

PROJECTS FORMAT (follow exactly):
PROJECT NAME | Live Demo/GitHub Link    Year
Tech1 • Tech2 • Tech3 • Tech4 (max 4)    
- bullet
- bullet

CRITICAL FOR PROJECT TECH STACK — always show strongest skills first:
- ALWAYS lead with the most impressive/specific technologies from the project (React.js, Node.js, TypeScript, Express.js, MongoDB Atlas)
- NEVER lead with HTML5, CSS3, or JavaScript alone — these are baseline and make the project look basic
- HTML5/CSS3/JavaScript are only acceptable as 3rd or 4th position if needed to fill 4 slots
- The goal is to show technical depth — React.js is always more impressive than HTML5
- Even for a web admin role, showing React.js and Node.js proves stronger technical ability than HTML5

EDUCATION FORMAT:
Degree | Institution    Year – Year

CANDIDATE LINKS:
- GitHub: ${user.github_url || ""}
- Portfolio/Live Demo: ${user.portfolio_url || ""}

When listing projects, include the relevant live demo or GitHub link next to the project name if available.
- Job Tracker → use GitHub link
- Habit Tracker → use portfolio/live demo link
- Pomodoro → use GitHub link

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

  // ── Two-pass: generate → measure → one targeted correction ─────────────────
  const userObj = { ...user, cvSkills: allSkills, github_url: githubUrl };

  // Pre-check helper — count bullets over 120 chars
  const countLongBullets = (text) =>
    text
      .split("\n")
      .filter(
        (l) => (l.startsWith("- ") || l.startsWith("• ")) && l.length > 120,
      ).length;

  // Pass 1 — generate content and render
  const pass1Response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  let resumeContent = pass1Response.content[0].text.trim();
  let pass1Result = await generateResumePDF(resumeContent, userObj);
  let { fillRatio, dynamicFillRatio, dynamicBudget, dynamicUsed } = pass1Result;

  console.log(
    `[DocumentService] Pass 1 — page: ${(fillRatio * 100).toFixed(1)}% | dynamic: ${(dynamicFillRatio * 100).toFixed(1)}%`,
  );

  // Pass 2 — only correct dynamic sections (work experience + projects)
  // Fixed sections (education, certificates) always render fully — never touched
  if (dynamicFillRatio < 0.96 || fillRatio > 1.0) {
    let correctionInstruction = "";

    if (fillRatio > 1.0) {
      // Dynamic content overflows — trim work experience / projects only
      const overBy = Math.round((fillRatio - 0.98) * 100);
      correctionInstruction = `
CORRECTION PASS — Dynamic fill: ${(dynamicFillRatio * 100).toFixed(1)}% (over by ~${overBy}%)
The resume overflows into a second page. Trim ONLY work experience and project bullets:
- Shorten the ${Math.ceil(overBy / 5)} least relevant bullets to 1 tight line each
- If still over, remove 1 bullet from the least relevant role or project
- Do NOT touch education, certificates, or section headings
Output the complete corrected resume.`;
    } else {
      // Dynamic content too short — expand work experience / projects only
      const underBy = Math.round((0.98 - dynamicFillRatio) * 100);
      const longBullets = countLongBullets(resumeContent);
      correctionInstruction = `
CORRECTION PASS — Dynamic fill: ${(dynamicFillRatio * 100).toFixed(1)}% (under by ~${underBy}%)
The work experience and projects sections have unused space. Expand them to fill it:
- Expand the ${Math.ceil(underBy / 5)} most relevant bullets by 1 line with specific detail or metric from the CV
- If still under, add a bullet to the most relevant role or project
- Do NOT touch education, certificates, skills, or summary
- Do NOT fabricate anything — only use what is in the CV
- Keep ALL bullets under 120 characters — if any bullet is longer, rewrite it concisely
Output the complete corrected resume.`;
    }

    const pass2Response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
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
      `[DocumentService] Pass 2 — fill: ${(fillRatio * 100).toFixed(1)}%`,
    );
  }

  const pdfBuffer = pass1Result.buffer;
  const pdfBase64 = pdfBuffer.toString("base64");

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

/**
 * Generate a cover letter using Anthropic, then render via pdfService.
 */
const generateCoverLetter = async (userId, jobId) => {
  const { user, job, resume, github, application } = await getGenerationContext(
    userId,
    jobId,
  );

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
 
Step 1: Open with something specific you BUILT or SHIPPED from the CV
  - Lead with a project, a technical challenge you solved, or something you learned by doing
  - This is NOT "I am a recent graduate" — that's the worst opener
  - This IS "Building [specific thing] with [specific tech] showed me [specific insight]"
 
Step 2: Bridge to who you are in ONE sentence
  - Your background in 1 sentence maximum — degree, bootcamp, current focus
  - Keep it short — this is not the evidence paragraph
 
Step 3: Connect to THIS company/role specifically
  - Reference something REAL from the job description — their tech stack, product, mission, team size, domain
  - Make it clear you read their posting, not just filled in a company name
  - End with why this specific role is where you want to grow
 
WHY THIS PARAGRAPH MUST BE DYNAMIC:
Every job description has unique signals — a startup building fintech infrastructure is different from an enterprise team maintaining a legacy system, which is different from an agency doing client work. P1 must reflect which one this is. A recruiter at a 10-person startup and a recruiter at TD Bank should feel like they got completely different letters.
 
────────────────────────────────────────
 
PARAGRAPH 2 — What you've done with proof (100-120 words)
 
This is the evidence paragraph. Show, don't tell. Every claim needs a specific anchor.
 
STRUCTURE FOR EACH PIECE OF EVIDENCE:
  [What you built] + [technology used] + [what it proved or what it solved]
 
Rules:
  - Pick the 2-3 experiences from the CV that most directly answer what the job is asking for
  - For React-heavy job → lead with your React project
  - For backend/API job → lead with your Node/Express work
  - For full stack job → show both ends with specific connection between them
  - Use numbers from the CV if they exist — even small ones matter (3 data models, 2 REST endpoints, 40% load time improvement)
  - Connect each piece of evidence to a SPECIFIC requirement from the job description
  - Vary sentence length — mix short punchy lines with longer ones
  - Language to use: "shipped", "built", "designed", "debugged", "integrated", "which required", "that taught me", "to solve", "resulting in"
  - Language to NEVER use: "I have experience in", "I am proficient at", "I am skilled in", "I worked with"
 
WHY THIS PARAGRAPH MUST BE DYNAMIC:
The same CV should produce different P2s for different jobs. A job asking for REST API experience should surface your backend work. A job mentioning React should surface your frontend project. The matching skills list below tells you which experiences to prioritize.
 
────────────────────────────────────────
 
PARAGRAPH 3 — Why you fit + confident call to action (60-75 words)
 
Step 1: One specific reason why THIS role/company appeals
  - Not "I want to grow my skills" — that's meaningless
  - Reference something concrete: their tech stack, the problem they're solving, their growth stage, a specific line from the job description
  - Show you understand what the role actually needs from someone at this level
 
Step 2: One sentence on cultural or technical fit
  - What do you bring beyond the skills — work ethic, how you learn, how you collaborate
  - Keep it tight — one sentence maximum
 
Step 3: Confident call to action
  - NOT: "I look forward to hearing from you", "Thank you for your consideration", "I hope to be considered"
  - YES: Something direct like "I'd welcome the chance to talk through what I've built" or "Happy to walk you through the projects in more detail"
  - End on confidence, not gratitude
 
════════════════════════════════════════
BANNED PHRASES — never use these
════════════════════════════════════════
"I am excited to apply"
"I am passionate about"
"I would love the opportunity"
"aligns perfectly with my"
"aligns with my"
"I look forward to hearing from you"
"Thank you for considering my application"
"I am a quick learner"
"I am a team player"
"I have a strong foundation in"
"I am eager to contribute"
"I would welcome the opportunity"
"I hope to bring value"
Any sentence that could appear in ANY other cover letter unchanged
 
════════════════════════════════════════
WHAT MAKES THIS DYNAMIC
════════════════════════════════════════
Before writing, mentally answer these questions:
1. What is the ONE thing this company cares most about in this role?
2. Which project or experience from the CV most directly proves that thing?
3. What is ONE specific detail from the job description that no other job posting has?
4. Is this a startup, mid-size, or enterprise? How does that change the tone?
 
A startup cover letter should feel scrappier, faster, more direct.
An enterprise cover letter should feel more structured, process-aware, stable.
An agency cover letter should feel client-aware, delivery-focused, adaptable.
 
════════════════════════════════════════
STRICT RULES
════════════════════════════════════════
- ONLY use skills and experience from the candidate's CV — never fabricate
- Target 250-270 words total across all 3 paragraphs
- Do NOT include date, address, greeting, sign-off, or name — added automatically
- Output ONLY the 3 body paragraphs separated by blank lines, nothing else
- Every single sentence must earn its place — if cutting it loses nothing, cut it
- Read it back before outputting — if any sentence could appear in a generic cover letter, rewrite it
 
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

  // ── Word count pass — target 250-270 words ────────────────────────────────
  const countWords = (text) => text.trim().split(/\s+/).length;
  const MAX_PASSES = 3;
  let clContent = "";
  let currentPrompt = prompt;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 900,
      messages: [{ role: "user", content: currentPrompt }],
    });

    clContent = response.content[0].text.trim();
    const wordCount = countWords(clContent);
    console.log(
      `[DocumentService] Cover letter pass ${pass + 1} — word count: ${wordCount}`,
    );

    // Perfect range — done
    if (wordCount >= 245 && wordCount <= 275) break;

    if (wordCount < 245) {
      const needed = 260 - wordCount;
      currentPrompt =
        prompt +
        `
 
REVISION REQUIRED — Word count: ${wordCount} (target: 245-275 words)
Too short by ~${needed} words. Expand naturally:
- Add 1-2 sentences to paragraph 2 — more specific technical detail or a concrete outcome from the CV
- Make the evidence more precise — what technology, what problem, what result
Do NOT fabricate anything. Output 3 paragraphs only, no greeting or sign-off.`;
    } else if (wordCount > 275) {
      const excess = wordCount - 260;
      currentPrompt =
        prompt +
        `
 
REVISION REQUIRED — Word count: ${wordCount} (target: 245-275 words)
Too long by ~${excess} words. Tighten ruthlessly:
- Cut the weakest or most generic sentence from paragraph 2
- Remove any phrase that could appear in any other cover letter
- If a sentence doesn't add specific proof or specific connection to the job, cut it
Output 3 paragraphs only, no greeting or sign-off.`;
    }
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

/**
 * Generate both resume and cover letter in parallel.
 */
const generateDocuments = async (userId, jobId) => {
  const [resume, coverLetter] = await Promise.all([
    generateResume(userId, jobId),
    generateCoverLetter(userId, jobId),
  ]);

  return { resume, coverLetter };
};

module.exports = { generateResume, generateCoverLetter, generateDocuments };
