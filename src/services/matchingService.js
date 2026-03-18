const Anthropic = require("@anthropic-ai/sdk");
const db = require("../db/db");

const client = new Anthropic();

/**
 * Get default thresholds by experience level.
 * User's match_threshold in DB overrides the sweet spot default.
 */
const getThresholds = (experienceLevel) => {
  switch (experienceLevel) {
    case "entry":
      return { minimum: 50, default: 70, favourite: 85 };
    case "mid":
      return { minimum: 60, default: 75, favourite: 88 };
    case "senior":
      return { minimum: 70, default: 80, favourite: 90 };
    default:
      return { minimum: 60, default: 70, favourite: 85 };
  }
};

/**
 * Fetch user's combined skills from CV + GitHub.
 * This is the source of truth — we never fabricate beyond these.
 *
 * @param {string} userId
 * @returns {Promise<string[]>} - deduplicated skills array
 */
const getUserSkills = async (userId) => {
  const [cvResult, githubResult] = await Promise.all([
    db.query("SELECT extracted_skills FROM base_resumes WHERE user_id = $1", [
      userId,
    ]),
    db.query("SELECT analyzed_skills FROM github_profiles WHERE user_id = $1", [
      userId,
    ]),
  ]);

  const cvSkills = cvResult.rows[0]?.extracted_skills || [];
  const githubSkills = githubResult.rows[0]?.analyzed_skills || [];

  // Merge and deduplicate (case insensitive)
  const seen = new Set();
  const combined = [...cvSkills, ...githubSkills].filter((skill) => {
    const lower = skill.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });

  return combined;
};

/**
 * Use Anthropic to calculate match score between user skills and job.
 * Returns score, matched skills, missing skills, and reasoning.
 *
 * @param {string[]} userSkills  - combined CV + GitHub skills
 * @param {Object}   job         - job row from DB
 * @returns {Promise<Object>}
 */
const calculateMatchScore = async (userSkills, job) => {
  const prompt = `You are an expert technical recruiter evaluating a candidate's fit for a job.

CANDIDATE SKILLS:
${userSkills.join(", ")}

JOB TITLE: ${job.title}
JOB COMPANY: ${job.company}
JOB EXPERIENCE LEVEL: ${job.experience_level}
JOB DESCRIPTION:
${job.description}

Analyze how well the candidate's skills match this job. Be realistic and strict.

Respond ONLY with a JSON object in this exact format, no preamble, no markdown:
{
  "score": <number 0-100>,
  "matched_skills": [<skills the candidate has that are relevant to this job>],
  "missing_skills": [<important skills the job needs that the candidate lacks>],
  "reasoning": "<2-3 sentence explanation of the score>"
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].text.trim();

  // Strip markdown fences if present
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
};

/**
 * Main matching function.
 * Fetches user skills, scores the job, decides apply/skip/favourite.
 *
 * @param {Object} user - user row from DB
 * @param {Object} job  - job row from DB
 * @returns {Promise<Object>} - match result with decision
 */
const matchJobToUser = async (user, job) => {
  // 1. Get user's combined skills
  const userSkills = await getUserSkills(user.id);

  if (userSkills.length === 0) {
    console.log(`[Matching] User ${user.id} has no skills — skipping`);
    return null;
  }

  // 2. Check experience level match
  // Don't apply to senior jobs if user is entry level etc.
  const expMap = { entry: 1, mid: 2, senior: 3 };
  const userExp = expMap[user.experience_level] || 1;
  const jobExp = expMap[job.experience_level] || 2;

  if (jobExp > userExp + 1) {
    console.log(`[Matching] Job ${job.id} too senior for user — skipping`);
    return {
      job_id: job.id,
      score: 0,
      matched_skills: [],
      missing_skills: [],
      reasoning: "Job experience level too high for candidate",
      decision: "skip",
      is_favourite: false,
    };
  }

  // 3. Calculate AI match score
  const aiResult = await calculateMatchScore(userSkills, job);

  // 4. Get thresholds
  const thresholds = getThresholds(user.experience_level);
  const userThreshold = user.match_threshold || thresholds.default;
  const minimumThreshold = thresholds.minimum;
  const favouriteThreshold = thresholds.favourite;

  // 5. Make decision
  const score = aiResult.score;
  const decision = score >= userThreshold ? "apply" : "skip";
  const isFavourite = score >= favouriteThreshold;

  console.log(
    `[Matching] Job "${job.title}" at ${job.company} → score: ${score} | decision: ${decision} | favourite: ${isFavourite}`,
  );

  return {
    job_id: job.id,
    score,
    matched_skills: aiResult.matched_skills,
    missing_skills: aiResult.missing_skills,
    reasoning: aiResult.reasoning,
    decision,
    is_favourite: isFavourite,
  };
};

/**
 * Check if user has already applied to this job recently.
 * Reapply logic: skip if applied within reapply_threshold_days (default 60).
 *
 * @param {string} userId
 * @param {string} jobId
 * @param {number} reapplyDays
 * @returns {Promise<boolean>} - true if should skip
 */
const hasAppliedRecently = async (userId, jobId, reapplyDays = 60) => {
  const result = await db.query(
    `SELECT applied_at FROM applications
     WHERE user_id = $1 AND job_id = $2
     AND applied_at >= NOW() - INTERVAL '1 day' * $3`,
    [userId, jobId, reapplyDays],
  );
  return result.rows.length > 0;
};

module.exports = {
  matchJobToUser,
  getUserSkills,
  hasAppliedRecently,
  getThresholds,
};
