/**
 * fetchRealJobs.js
 * Fetches jobs from Adzuna + JSearch (LinkedIn, Indeed, Google Jobs) and stores in DB.
 * Run: node src/scripts/fetchRealJobs.js
 *
 * Active sources:
 *   ✅ Adzuna    — needs ADZUNA_APP_ID + ADZUNA_APP_KEY in .env
 *   ✅ JSearch   — needs OPENWEBNINJA_KEY in .env
 *                  Pulls from LinkedIn, Indeed, Glassdoor, Google Jobs in real time
 *
 * Removed (replaced by JSearch):
 *   ❌ Arbeitnow — low Canadian coverage, mostly European jobs
 *   ❌ Jooble    — low quality dedup issues
 *   ❌ The Muse  — too few entry level jobs
 *   ❌ Remotive  — covered by JSearch remote filter
 */

require("dotenv").config();
const axios = require("axios");
const db = require("../db/db");

const ADZUNA_BASE = "https://api.adzuna.com/v1/api/jobs";
// const JSEARCH_BASE = "https://jsearch.p.rapidapi.com/search";

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Improved experience level detection.
 * Title-level signals win — co-op/intern always entry regardless of description.
 */
const inferExperienceLevel = (title = "", description = "") => {
  const titleLower = title.toLowerCase();
  const descLower = description.toLowerCase();

  // Title-level entry signals — always win, no exceptions
  if (
    titleLower.match(
      /\bjunior\b|co[\s\-]?op\b|intern\b|graduate\b|grad\b|entry[\s\-]?level|developer i\b|engineer i\b|level i\b/,
    )
  )
    return "entry";

  // Description-level entry signals
  if (
    descLower.match(
      /new grad|fresh grad|no experience required|0[\s\-]?2 years|1[\s\-]?2 years|bootcamp|early career|willing to train|will train|mentorship/,
    )
  )
    return "entry";

  // Senior — title or description
  if (
    (titleLower + " " + descLower).match(
      /\bsenior\b|\blead\b|\bprincipal\b|\bstaff\b|architect|director|\bvp\b|vice president|head of|\bmanager\b/,
    )
  )
    return "senior";

  return "mid";
};

const filterRecent = (jobs) => {
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days
  return jobs.filter((job) => new Date(job.posted_at) >= cutoff);
};

const stripHtml = (html = "") =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// ── Get country from user profile ─────────────────────────────────────────────
const getCountry = async () => {
  try {
    const result = await db.query(
      "SELECT country FROM users WHERE is_active = true LIMIT 1",
    );
    const country = result.rows[0]?.country;
    if (country) {
      console.log(
        `[Config] Using country from user profile: ${country.toUpperCase()}`,
      );
      return country.toLowerCase();
    }
  } catch (err) {
    console.warn("[Config] Could not read country from DB:", err.message);
  }
  console.log("[Config] Defaulting to ca");
  return "ca";
};

// ── Country → location label for JSearch ─────────────────────────────────────
const COUNTRY_LOCATION = {
  ca: "Canada",
  gb: "United Kingdom",
  us: "United States",
  au: "Australia",
};

// ── Relevant job title filter ─────────────────────────────────────────────────
const RELEVANT_TITLE_KEYWORDS = [
  "software engineer",
  "software developer",
  "web engineer",
  "frontend engineer",
  "front-end engineer",
  "backend engineer",
  "back-end engineer",
  "fullstack engineer",
  "full stack engineer",
  "full-stack engineer",
  "application engineer",
  "developer",
  "programmer",
  "frontend",
  "front-end",
  "front end",
  "backend",
  "back-end",
  "back end",
  "fullstack",
  "full-stack",
  "full stack",
  "react",
  "angular",
  "vue",
  "node",
  "nodejs",
  "javascript",
  "typescript",
  "python developer",
  "python engineer",
  "co-op",
  "coop",
  "software intern",
  "dev intern",
  "graduate developer",
  "graduate engineer",
  "junior dev",
];

const IRRELEVANT_TITLE_BLACKLIST = [
  "electrical",
  "mechanical",
  "civil",
  "chemical",
  "structural",
  "sales",
  "account manager",
  "account executive",
  "commercial",
  "marketing",
  "accounting",
  "finance",
  "hr ",
  "human resource",
  "recruiter",
  "nurse",
  "medical",
  "dental",
  "care aide",
  "support worker",
  "driver",
  "warehouse",
  "construction",
  "manufacturing",
  "dach",
  "netsuite",
  "sap consultant",
];

const isRelevantJob = (title = "") => {
  const t = title.toLowerCase();
  if (IRRELEVANT_TITLE_BLACKLIST.some((kw) => t.includes(kw))) return false;
  return RELEVANT_TITLE_KEYWORDS.some((kw) => t.includes(kw));
};

// ── 1. Adzuna ─────────────────────────────────────────────────────────────────
const fetchAdzuna = async (query, country, results = 50) => {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    console.error("[Adzuna] Missing ADZUNA_APP_ID or ADZUNA_APP_KEY in .env");
    return [];
  }

  try {
    const response = await axios.get(`${ADZUNA_BASE}/${country}/search/1`, {
      params: {
        app_id: appId,
        app_key: appKey,
        what: query,
        results_per_page: results,
        max_days_old: 2,
        sort_by: "date",
      },
      timeout: 30000,
    });

    const raw = response.data?.results || [];
    const filtered = raw.filter((job) => isRelevantJob(job.title));
    console.log(
      `[Adzuna] "${query}" → ${raw.length} fetched → ${filtered.length} relevant`,
    );

    return filtered.map((job) => ({
      external_id: `adzuna-${job.id}`,
      source: "adzuna",
      title: job.title || "",
      company: job.company?.display_name || "Unknown",
      location: job.location?.display_name || "",
      country,
      description: job.description || "",
      url: job.redirect_url || "",
      salary_min: job.salary_min ? Math.round(job.salary_min) : null,
      salary_max: job.salary_max ? Math.round(job.salary_max) : null,
      experience_level: inferExperienceLevel(job.title, job.description),
      required_skills: [],
      posted_at: job.created
        ? new Date(job.created).toISOString()
        : new Date().toISOString(),
    }));
  } catch (err) {
    console.error(`[Adzuna] Error: ${err.response?.status} — ${err.message}`);
    return [];
  }
};

// ── 2. JSearch ────────────────────────────────────────────────────────────────
// Pulls from LinkedIn, Indeed, Glassdoor, Google Jobs in real time
const fetchJSearch = async (query, country) => {
  const apiKey = process.env.OPENWEBNINJA_KEY;
  if (!apiKey) {
    console.error("[JSearch] Missing OPENWEBNINJA_KEY in .env");
    return [];
  }

  const location = COUNTRY_LOCATION[country] || "Canada";

  try {
    const response = await axios.get(
      "https://api.openwebninja.com/jsearch/search",
      {
        params: {
          query: `${query} in ${location}`,
          date_posted: "today",
          country: country.toUpperCase(),
          language: "en",
        },
        headers: {
          "x-api-key": apiKey, // ← OpenWebNinja uses x-api-key not X-RapidAPI-Key
        },
        timeout: 30000,
      },
    );

    const jobs = response.data?.data || [];
    const filtered = jobs.filter((job) => isRelevantJob(job.job_title));
    console.log(
      `[JSearch] "${query}" in ${location} → ${jobs.length} fetched → ${filtered.length} relevant`,
    );

    return filtered.map((job) => {
      // Use required_experience_in_months for accurate experience level
      const expMonths =
        job.job_required_experience?.required_experience_in_months;
      let experienceLevel;

      if (expMonths !== null && expMonths !== undefined) {
        if (expMonths <= 12) experienceLevel = "entry";
        else if (expMonths <= 36) experienceLevel = "mid";
        else experienceLevel = "senior";
      } else {
        // Fall back to text inference if no structured data
        experienceLevel = inferExperienceLevel(
          job.job_title,
          job.job_description,
        );
      }

      // Use no_experience_required flag
      if (
        job.job_required_experience?.no_experience_required === "true" ||
        job.job_required_experience?.no_experience_required === true
      ) {
        experienceLevel = "entry";
      }

      return {
        external_id: `jsearch-${job.job_id}`,
        source: `jsearch_${job.job_publisher?.toLowerCase().replace(/\s/g, "_") || "google"}`,
        title: job.job_title || "",
        company: job.employer_name || "Unknown",
        location: job.job_city
          ? `${job.job_city}${job.job_state ? ", " + job.job_state : ""}`
          : job.job_is_remote
            ? "Remote"
            : location,
        country,
        description: stripHtml(job.job_description || ""),
        url: job.job_apply_link || job.job_google_link || "",
        salary_min: job.job_min_salary ? Math.round(job.job_min_salary) : null,
        salary_max: job.job_max_salary ? Math.round(job.job_max_salary) : null,
        experience_level: experienceLevel,
        required_skills: job.job_required_skills || [],
        remote: job.job_is_remote || false,
        posted_at: job.job_posted_at_datetime_utc
          ? new Date(job.job_posted_at_datetime_utc).toISOString()
          : new Date().toISOString(),
      };
    });
  } catch (err) {
    console.error(`[JSearch] Error: ${err.response?.status} — ${err.message}`);
    return [];
  }
};

// ── Save to DB ────────────────────────────────────────────────────────────────
const saveJobs = async (jobs) => {
  let saved = 0;
  let skipped = 0;

  for (const job of jobs) {
    try {
      const result = await db.query(
        `INSERT INTO jobs
           (external_id, source, title, company, location, country,
            description, url, salary_min, salary_max,
            experience_level, required_skills, posted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (external_id) DO NOTHING
         RETURNING id`,
        [
          job.external_id,
          job.source,
          job.title,
          job.company,
          job.location,
          job.country,
          job.description,
          job.url,
          job.salary_min,
          job.salary_max,
          job.experience_level,
          job.required_skills,
          job.posted_at,
        ],
      );
      result.rows[0] ? saved++ : skipped++;
    } catch (err) {
      console.error(`[DB] Failed to save ${job.external_id}: ${err.message}`);
    }
  }

  return { saved, skipped };
};

// ── Deduplicate ───────────────────────────────────────────────────────────────
const deduplicateJobs = (jobs) => {
  const seen = new Set();
  return jobs.filter((job) => {
    if (seen.has(job.external_id)) return false;
    seen.add(job.external_id);
    return true;
  });
};

// ── Main ──────────────────────────────────────────────────────────────────────
const main = async () => {
  console.log("\n===== Real Job Fetch Script =====");

  const COUNTRY = await getCountry();
  console.log(
    `Country: ${COUNTRY.toUpperCase()} | Time: ${new Date().toISOString()}\n`,
  );

  const allJobs = [];

  // ── 1. Adzuna — Canadian-specific coverage ────────────────────────────────
  console.log("--- Adzuna ---");
  const adzunaQueries = [
    "software engineer",
    "software developer",
    "full stack developer",
    "react developer",
    "web developer",
    "javascript developer",
    "junior software developer",
    "entry level developer",
    "co-op developer",
  ];

  for (const query of adzunaQueries) {
    const jobs = await fetchAdzuna(query, COUNTRY, 50);
    allJobs.push(...jobs);
    await sleep(1000);
  }

  // ── 2. JSearch — LinkedIn, Indeed, Google Jobs ────────────────────────────
  console.log("\n--- JSearch ---");
  const jsearchQueries = [
    "junior software developer",
    "junior full stack developer",
    "junior web developer",
    "entry level software engineer",
    "junior react developer",
    "junior backend developer",
    "software developer co-op",
    "graduate software engineer",
  ];

  for (const query of jsearchQueries) {
    const jobs = await fetchJSearch(query, COUNTRY);
    allJobs.push(...jobs);
    await sleep(2000); // slightly longer delay — RapidAPI rate limits
  }

  // ── Dedup + filter + save ─────────────────────────────────────────────────
  console.log(`\nTotal fetched (before dedup): ${allJobs.length}`);

  const unique = deduplicateJobs(allJobs);
  const recent = filterRecent(unique);

  console.log(`After dedup + 3-day filter: ${recent.length} jobs\n`);

  if (recent.length === 0) {
    console.log("No jobs found. Check your API keys and country setting.");
    // process.exit(0);
    return 0;
  }

  const { saved, skipped } = await saveJobs(recent);
  console.log(`\n✅ Saved: ${saved} | Skipped (duplicates): ${skipped}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  const bySource = await db.query(
    `SELECT source, COUNT(*) as count FROM jobs GROUP BY source ORDER BY count DESC`,
  );
  console.log("\n--- Jobs in DB by source ---");
  bySource.rows.forEach((r) => console.log(`  ${r.source}: ${r.count}`));

  const byExp = await db.query(
    `SELECT experience_level, COUNT(*) as count FROM jobs GROUP BY experience_level ORDER BY count DESC`,
  );
  console.log("\n--- Jobs in DB by experience level ---");
  byExp.rows.forEach((r) => console.log(`  ${r.experience_level}: ${r.count}`));

  const sample = await db.query(
    `SELECT id, title, company, experience_level, source, location FROM jobs ORDER BY posted_at DESC LIMIT 10`,
  );
  console.log("\n--- Latest 10 jobs ---");
  sample.rows.forEach((j) =>
    console.log(
      `[${j.id}] ${j.title} @ ${j.company} (${j.experience_level}) — ${j.source} — ${j.location}`,
    ),
  );

  console.log("\n===== Done — run matching next =====\n");
  // process.exit(0);
  return saved;
};

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

module.exports = main;
