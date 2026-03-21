const Anthropic = require("@anthropic-ai/sdk");
const db = require("../db/db");

const client = new Anthropic();

// ─────────────────────────────────────────────────────────────────────────────
// THRESHOLDS
// ─────────────────────────────────────────────────────────────────────────────
const getThresholds = (experienceLevel) => {
  switch (experienceLevel) {
    case "entry":
      return { minimum: 35, default: 50, favourite: 70 };
    case "mid":
      return { minimum: 45, default: 60, favourite: 78 };
    case "senior":
      return { minimum: 50, default: 68, favourite: 83 };
    default:
      return { minimum: 35, default: 50, favourite: 70 };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// USER SKILLS
// ─────────────────────────────────────────────────────────────────────────────
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

  const seen = new Set();
  return [...cvSkills, ...githubSkills].filter((skill) => {
    const lower = skill.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// WEIGHTS
// ─────────────────────────────────────────────────────────────────────────────
const WEIGHTS = {
  skills: 35,
  title: 20,
  experience: 15,
  location: 12,
  freshness: 8,
  company: 5,
  semantic: 5,
};

// ─────────────────────────────────────────────────────────────────────────────
// SKILL SYNONYMS
// ─────────────────────────────────────────────────────────────────────────────
const SKILL_SYNONYMS = {
  javascript: ["js", "ecmascript", "es6", "es2015"],
  typescript: ["ts"],
  python: ["py"],
  "react.js": ["react", "reactjs", "react js"],
  "vue.js": ["vue", "vuejs"],
  "node.js": ["node", "nodejs", "express", "expressjs"],
  postgresql: ["postgres", "pg", "psql"],
  kubernetes: ["k8s"],
  "machine learning": ["ml", "deep learning", "ai", "artificial intelligence"],
  "ci/cd": ["devops", "github actions", "jenkins", "gitlab ci", "circleci"],
  aws: ["amazon web services", "ec2", "s3", "lambda", "cloudformation"],
  gcp: ["google cloud", "google cloud platform", "bigquery"],
  azure: ["microsoft azure", "azure devops"],
  rest: ["restful", "rest api", "web api", "api development"],
  graphql: ["graph ql"],
  "c#": ["csharp", "dotnet", ".net"],
  "c++": ["cpp"],
  mongodb: ["mongo", "mongoose"],
  elasticsearch: ["elastic", "elk"],
  docker: ["containerization", "containers"],
  redis: ["cache", "caching"],
  kafka: ["message queue", "event streaming"],
  html: ["html5", "html 5"],
  css: ["css3", "css 3", "sass", "scss", "less"],
  git: ["github", "gitlab", "version control", "source control"],
  sql: ["mysql", "sqlite", "relational database", "database"],
};

// ─────────────────────────────────────────────────────────────────────────────
// TITLE CLUSTERS
// ─────────────────────────────────────────────────────────────────────────────
const TITLE_CLUSTERS = [
  ["software engineer", "software developer", "swe", "programmer", "developer"],
  [
    "frontend",
    "front-end",
    "front end",
    "ui developer",
    "react developer",
    "angular developer",
    "web developer",
  ],
  ["backend", "back-end", "back end", "server-side", "api developer"],
  ["fullstack", "full-stack", "full stack"],
  [
    "data scientist",
    "data analyst",
    "ml engineer",
    "ai engineer",
    "machine learning engineer",
  ],
  [
    "devops",
    "site reliability engineer",
    "sre",
    "platform engineer",
    "cloud engineer",
    "infrastructure engineer",
  ],
  ["product manager", "pm", "product owner", "po"],
  ["designer", "ux designer", "ui designer", "ux/ui", "product designer"],
  [
    "qa engineer",
    "quality assurance",
    "test engineer",
    "sdet",
    "automation engineer",
  ],
  [
    "mobile developer",
    "ios developer",
    "android developer",
    "react native developer",
    "flutter developer",
  ],
  ["data engineer", "etl developer", "pipeline engineer"],
  ["security engineer", "cybersecurity", "appsec", "infosec"],
];

// ─────────────────────────────────────────────────────────────────────────────
// EXPERIENCE SCALE
// ─────────────────────────────────────────────────────────────────────────────
const EXPERIENCE_SCALE = {
  intern: 0,
  entry: 1,
  junior: 1,
  mid: 2,
  intermediate: 2,
  senior: 3,
  sr: 3,
  lead: 4,
  staff: 4,
  principal: 4,
  director: 5,
  vp: 5,
};

// ─────────────────────────────────────────────────────────────────────────────
// PRE-FILTER
// Kills obviously irrelevant jobs BEFORE any scoring or API calls.
// Saves computation time and Anthropic API credits.
//
// Logic:
//   1. Always skip — completely unrelated fields regardless of level
//   2. Check for rescue signals — "junior", "willing to train", "mentorship" etc
//      If found → always score, rescue signals override everything
//   3. No rescue signals → skip if senior title OR 2+ years experience required
// ─────────────────────────────────────────────────────────────────────────────

// Fields that are NEVER relevant for a full stack / web dev candidate
// No matter what the level says, these are always skipped
const ALWAYS_IRRELEVANT_TITLES = [
  "ios developer",
  "android developer",
  "flutter developer",
  "react native developer",
  "mobile developer",
  "mobile engineer",
  "data scientist",
  "machine learning engineer",
  "ml engineer",
  "ai engineer",
  "nlp engineer",
  "computer vision",
  "devops engineer",
  "site reliability engineer",
  "sre",
  "platform engineer",
  "infrastructure engineer",
  "cybersecurity",
  "security engineer",
  "penetration tester",
  "network engineer",
  "systems administrator",
  "sysadmin",
  "embedded engineer",
  "firmware engineer",
  "hardware engineer",
  "game developer",
  "unity developer",
  "unreal developer",
  "blockchain developer",
  "solidity developer",
  "web3 developer",
  "ux designer",
  "ui designer",
  "graphic designer",
  "product designer",
  "gis analyst",
  "geospatial",
  "cartographer",
  "database administrator",
  "dba",
  "netsuite",
  "sap consultant",
  "erp consultant",
  "actuary",
  "financial analyst",
  "accountant",
  "mechanical engineer",
  "civil engineer",
  "electrical engineer",
];

// Rescue signals — if ANY of these appear in title OR description,
// score the job regardless of experience requirement or seniority
const RESCUE_SIGNALS = [
  "junior",
  "entry level",
  "entry-level",
  "entrylevel",
  "new grad",
  "new graduate",
  "recent graduate",
  "fresh graduate",
  "graduate developer",
  "graduate engineer",
  "no experience required",
  "no prior experience",
  "0-1 year",
  "0-2 year",
  "0 to 1",
  "0 to 2",
  "willing to train",
  "will train",
  "we will train",
  "willing to learn",
  "eager to learn",
  "mentorship",
  "mentoring",
  "mentor",
  "bootcamp",
  "boot camp",
  "self-taught",
  "self taught",
  "internship",
  "intern",
  "co-op",
  "coop",
  "open to candidates",
  "open to applicants",
  "training provided",
  "on the job training",
  "growth opportunity",
  "learn and grow",
  "junior to mid",
  "junior/mid",
];

// Senior title keywords — skip if no rescue signal
const SENIOR_TITLE_WORDS = [
  "senior ",
  " sr.",
  " sr ",
  "sr/",
  "/sr",
  "lead ",
  " lead",
  "tech lead",
  "team lead",
  "principal ",
  "staff engineer",
  "staff developer",
  "director",
  "vp ",
  "vice president",
  "head of",
  "architect ",
  "chief ",
  "manager",
  "engineering manager",
];

/**
 * Pre-filter — returns { skip: boolean, reason: string }
 * Called before any scoring to eliminate obviously irrelevant jobs.
 */
const shouldSkipJob = (job, userExpLevel = "entry") => {
  const titleNorm = normalize(job.title || "");
  const descNorm = normalize((job.description || "").slice(0, 1000));
  const fullText = titleNorm + " " + descNorm;

  // ── 1. Always irrelevant fields — skip immediately, no rescue ────────────
  if (ALWAYS_IRRELEVANT_TITLES.some((kw) => titleNorm.includes(kw))) {
    return {
      skip: true,
      reason: `Irrelevant field — ${job.title}`,
    };
  }

  // ── 2. Check rescue signals — override everything if found ───────────────
  // If the job mentions junior/training/mentorship anywhere, always score it
  const hasRescueSignal = RESCUE_SIGNALS.some((signal) =>
    fullText.includes(signal),
  );
  if (hasRescueSignal) {
    return { skip: false };
  }

  // ── 3. No rescue signals — apply entry-level filters ────────────────────
  if (userExpLevel === "entry") {
    // Skip senior titles
    if (SENIOR_TITLE_WORDS.some((w) => titleNorm.includes(w))) {
      return {
        skip: true,
        reason: `Senior title, no junior signals — ${job.title}`,
      };
    }

    // Skip if description requires 2+ years experience
    const expMatch = descNorm.match(
      /(\d+)\s*\+?\s*(?:to\s*\d+\s*)?years?\s*(?:of\s*)?(?:experience|exp)/i,
    );
    if (expMatch) {
      const years = parseInt(expMatch[1]);
      if (years >= 2) {
        return {
          skip: true,
          reason: `Requires ${years}+ years experience, no junior signals`,
        };
      }
    }
  }

  // ── 4. Mid-level filters ──────────────────────────────────────────────────
  if (userExpLevel === "mid") {
    const expMatch = descNorm.match(
      /(\d+)\s*\+?\s*(?:to\s*\d+\s*)?years?\s*(?:of\s*)?(?:experience|exp)/i,
    );
    if (expMatch) {
      const years = parseInt(expMatch[1]);
      if (years >= 6) {
        return {
          skip: true,
          reason: `Requires ${years}+ years experience`,
        };
      }
    }
  }

  return { skip: false };
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const normalize = (str = "") => {
  return str.toLowerCase().trim();
};

function expandSkill(skill) {
  const base = normalize(skill);
  if (SKILL_SYNONYMS[base]) return [base, ...SKILL_SYNONYMS[base]];
  for (const [key, synonyms] of Object.entries(SKILL_SYNONYMS)) {
    if (synonyms.includes(base)) return [base, key, ...synonyms];
  }
  return [base];
}

function skillsMatch(userSkill, requiredSkill) {
  const u = expandSkill(userSkill);
  const r = expandSkill(requiredSkill);
  return u.some((a) => r.includes(a));
}

// ─────────────────────────────────────────────────────────────────────────────
// DIMENSION 1 — Skills (35 pts)
// ─────────────────────────────────────────────────────────────────────────────
const scoreSkills = (
  userSkills = [],
  requiredSkills = [],
  niceToHaveSkills = [],
) => {
  if (!requiredSkills.length) return Math.round(WEIGHTS.skills * 0.65);

  const userNorm = userSkills.map(normalize);

  const matched = requiredSkills.filter((req) =>
    userNorm.some((u) => skillsMatch(u, req)),
  );
  const requiredScore = (matched.length / requiredSkills.length) * 25;

  let bonusScore = 0;
  if (niceToHaveSkills.length) {
    const bonusMatched = niceToHaveSkills.filter((req) =>
      userNorm.some((u) => skillsMatch(u, req)),
    );
    bonusScore = (bonusMatched.length / niceToHaveSkills.length) * 10;
  }

  return Math.min(WEIGHTS.skills, Math.round(requiredScore + bonusScore));
};

// ─────────────────────────────────────────────────────────────────────────────
// DIMENSION 2 — Title Fit (20 pts)
// Generic words like "developer" alone don't count — need meaningful overlap
// ─────────────────────────────────────────────────────────────────────────────
const GENERIC_WORDS = new Set([
  "developer",
  "engineer",
  "software",
  "junior",
  "senior",
  "lead",
  "staff",
  "the",
  "and",
  "for",
  "with",
]);

const scoreTitle = (userTitles = [], jobTitle = "") => {
  const jobNorm = normalize(jobTitle);
  let best = 0;

  for (const userTitle of userTitles) {
    const userNorm = normalize(userTitle);

    // Exact match
    if (userNorm === jobNorm) return WEIGHTS.title;

    // Cluster match
    for (const cluster of TITLE_CLUSTERS) {
      const inCluster = (t) =>
        cluster.some((c) => t.includes(c) || c.includes(t));
      if (inCluster(userNorm) && inCluster(jobNorm)) {
        best = Math.max(best, 14);
        break;
      }
    }

    // Meaningful word overlap — exclude generic words
    const userWords = new Set(
      userNorm
        .split(/\s+/)
        .filter((w) => !GENERIC_WORDS.has(w) && w.length > 2),
    );
    const jobWords = jobNorm
      .split(/\s+/)
      .filter((w) => !GENERIC_WORDS.has(w) && w.length > 2);
    const shared = jobWords.filter((w) => userWords.has(w)).length;
    if (shared >= 1) best = Math.max(best, Math.min(8, shared * 4));
  }

  return best;
};

// ─────────────────────────────────────────────────────────────────────────────
// DIMENSION 3 — Experience Level (15 pts)
// ─────────────────────────────────────────────────────────────────────────────
const scoreExperience = (userExpLevel = "entry", jobExpLevel = "") => {
  const userVal = EXPERIENCE_SCALE[normalize(userExpLevel)] ?? 1;
  const jobVal = EXPERIENCE_SCALE[normalize(jobExpLevel)] ?? 2;
  const diff = Math.abs(userVal - jobVal);

  if (diff === 0) return WEIGHTS.experience;
  if (diff === 1) return Math.round(WEIGHTS.experience * 0.67);
  if (diff === 2) return Math.round(WEIGHTS.experience * 0.27);
  return 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// DIMENSION 4 — Location / Remote (12 pts)
// ─────────────────────────────────────────────────────────────────────────────
const scoreLocation = (userPrefs = {}, job = {}) => {
  const jobLoc = normalize(job.location || "");
  const userCity = normalize(userPrefs.city || "");
  // const userRemote = userPrefs.remote_ok === true;
  const isRemote =
    jobLoc.includes("remote") ||
    job.remote === true ||
    job.country === "remote" ||
    jobLoc === "";

  if (isRemote) return WEIGHTS.location;
  if (!jobLoc) return Math.round(WEIGHTS.location * 0.5);

  if (userCity && jobLoc.includes(userCity)) return WEIGHTS.location;

  const userCountry = normalize(userPrefs.country || "");
  if (userCountry && jobLoc.includes(userCountry))
    return Math.round(WEIGHTS.location * 0.5);

  // Canadian cities — partial credit since user is in Canada
  const canadianCities = [
    "toronto",
    "vancouver",
    "montreal",
    "calgary",
    "ottawa",
    "edmonton",
    "winnipeg",
    "ontario",
    "canada",
  ];
  if (canadianCities.some((city) => jobLoc.includes(city)))
    return Math.round(WEIGHTS.location * 0.5);

  return 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// DIMENSION 5 — Freshness (8 pts)
// ─────────────────────────────────────────────────────────────────────────────
const scoreFreshness = (postedAt) => {
  if (!postedAt) return Math.round(WEIGHTS.freshness * 0.5);

  const ageDays =
    (Date.now() - new Date(postedAt).getTime()) / (1000 * 60 * 60 * 24);

  if (ageDays < 3) return WEIGHTS.freshness;
  if (ageDays < 7) return Math.round(WEIGHTS.freshness * 0.75);
  if (ageDays < 14) return Math.round(WEIGHTS.freshness * 0.5);
  if (ageDays < 30) return Math.round(WEIGHTS.freshness * 0.25);
  return 1;
};

// ─────────────────────────────────────────────────────────────────────────────
// DIMENSION 6 — Company Preference (5 pts)
// ─────────────────────────────────────────────────────────────────────────────
const scoreCompany = (userPrefs = {}, job = {}) => {
  const company = normalize(job.company || "");
  const source = normalize(job.source || "");
  const preferred = (userPrefs.preferred_companies || []).map(normalize);
  const blocked = (userPrefs.blocked_companies || []).map(normalize);

  if (blocked.some((b) => company.includes(b))) return -10;
  if (preferred.some((p) => company.includes(p) || source.includes(p)))
    return WEIGHTS.company;

  return Math.round(WEIGHTS.company * 0.6);
};

// ─────────────────────────────────────────────────────────────────────────────
// AI SCORING
// ─────────────────────────────────────────────────────────────────────────────
const calculateMatchScore = async (
  userSkills,
  job,
  preScore,
  userTitles,
  experienceLevel,
) => {
  const prompt = `You are a fair and supportive technical recruiter evaluating a JUNIOR/ENTRY-LEVEL candidate.

CANDIDATE:
- Experience: ${experienceLevel || "entry"} level (0-1 year, recent graduate)
- Skills: ${userSkills.join(", ")}
- Target roles: ${userTitles.join(", ")}

JOB:
- Title: ${job.title}
- Company: ${job.company}
- Level: ${job.experience_level || "not specified"}
- Description: ${(job.description || "").slice(0, 600)}

Rule-based pre-score: ${preScore}/95

IMPORTANT:
- This job already passed a pre-filter (not irrelevant, not too senior)
- Be FAIR and GENEROUS — entry level candidates rarely have 100% of skills
- 50-60% skill match IS viable for junior roles
- Transferable skills and learning potential count
- Score the actual fit, not just keyword matches

Tasks:
1. SEMANTIC SKILL SCORE (0-5): skill match accounting for equivalent tech
2. OVERALL SCORE (0-100): true fit, be fair
3. matched_skills: relevant skills candidate has
4. missing_skills: important gaps only
5. reasoning: 2-3 sentences

Respond ONLY with JSON (no markdown):
{
  "semantic_score": <0-5>,
  "overall_score": <0-100>,
  "matched_skills": ["..."],
  "missing_skills": ["..."],
  "reasoning": "..."
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].text
    .trim()
    .replace(/```json|```/g, "")
    .trim();
  return JSON.parse(text);
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN MATCH FUNCTION
// ─────────────────────────────────────────────────────────────────────────────
const matchJobToUser = async (user, job, userPrefs = {}) => {
  const userSkills = await getUserSkills(user.id);

  if (userSkills.length === 0) {
    console.log(`[Matching] User ${user.id} has no skills — skipping`);
    return null;
  }

  // ── Pre-filter — kill irrelevant jobs before scoring ──────────────────────
  const preFilter = shouldSkipJob(job, user.experience_level);
  if (preFilter.skip) {
    console.log(`[Matching] PRE-FILTER SKIP: ${preFilter.reason}`);
    return {
      job_id: job.id,
      score: 0,
      score_breakdown: null,
      matched_skills: [],
      missing_skills: [],
      reasoning: preFilter.reason,
      decision: "skip",
      is_favourite: false,
    };
  }

  const requiredSkills = job.required_skills || [];
  const niceToHaveSkills = job.nice_to_have_skills || [];

  // ── Resolve job_titles (supports array and legacy string) ─────────────────
  const userTitles =
    Array.isArray(user.job_titles) && user.job_titles.length
      ? user.job_titles
      : [user.job_title || ""].filter(Boolean);

  // ── Rule-based scores ────────────────────────────────────────────────────
  const s_skills = scoreSkills(userSkills, requiredSkills, niceToHaveSkills);
  const s_title = scoreTitle(userTitles, job.title);
  const s_experience = scoreExperience(
    user.experience_level,
    job.experience_level,
  );
  const s_location = scoreLocation(userPrefs, job);
  const s_freshness = scoreFreshness(job.posted_at);
  const s_company = scoreCompany(userPrefs, job);

  const preScore = Math.max(
    0,
    s_skills + s_title + s_experience + s_location + s_freshness + s_company,
  );

  console.log(`[Matching] "${job.title}" @ ${job.company} — pre-score:`, {
    skills: s_skills,
    title: s_title,
    experience: s_experience,
    location: s_location,
    freshness: s_freshness,
    company: s_company,
    preScore,
  });

  // ── AI scoring ───────────────────────────────────────────────────────────
  let aiResult;
  try {
    aiResult = await calculateMatchScore(
      userSkills,
      job,
      preScore,
      userTitles,
      user.experience_level,
    );
  } catch (err) {
    console.error(
      "[Matching] AI scoring failed, using rule-based only:",
      err.message,
    );
    aiResult = {
      semantic_score: 3,
      overall_score: preScore,
      matched_skills: userSkills.slice(0, 5),
      missing_skills: [],
      reasoning: "AI scoring unavailable — rule-based score used.",
    };
  }

  // ── Semantic bonus ───────────────────────────────────────────────────────
  const s_semantic = Math.round(
    (aiResult.semantic_score / 5) * WEIGHTS.semantic,
  );
  const ruleBasedTotal = Math.min(100, preScore + s_semantic);
  const finalScore = Math.round(
    ruleBasedTotal * 0.7 + aiResult.overall_score * 0.3,
  );

  // ── Decision ─────────────────────────────────────────────────────────────
  const thresholds = getThresholds(user.experience_level);
  const userThreshold = user.match_threshold || thresholds.default;
  const favouriteThreshold = user.favourite_threshold || thresholds.favourite;

  const decision = finalScore >= userThreshold ? "apply" : "skip";
  const isFavourite = finalScore >= favouriteThreshold;

  console.log(
    `[Matching] "${job.title}" → final: ${finalScore} | rule: ${ruleBasedTotal} | ai: ${aiResult.overall_score} | decision: ${decision} | fav: ${isFavourite}`,
  );

  return {
    job_id: job.id,
    score: finalScore,
    score_breakdown: {
      skills: s_skills,
      title: s_title,
      experience: s_experience,
      location: s_location,
      freshness: s_freshness,
      company: s_company,
      semantic: s_semantic,
      rule_total: ruleBasedTotal,
      ai_overall: aiResult.overall_score,
    },
    matched_skills: aiResult.matched_skills,
    missing_skills: aiResult.missing_skills,
    reasoning: aiResult.reasoning,
    decision,
    is_favourite: isFavourite,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// DUPLICATE CHECK
// ─────────────────────────────────────────────────────────────────────────────
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
