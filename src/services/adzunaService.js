const axios = require("axios");
const IS_DEV = process.env.NODE_ENV !== "production";
const ADZUNA_BASE = "https://api.adzuna.com/v1/api/jobs";
const { MOCK_JOBS } = require("./mockData");

const inferExperienceLevel = (title = "", description = "") => {
  const text = (title + " " + description).toLowerCase();
  if (
    text.includes("senior") ||
    text.includes("lead") ||
    text.includes("principal") ||
    text.includes("staff")
  ) {
    return "senior";
  }
  if (
    text.includes("junior") ||
    text.includes("graduate") ||
    text.includes("entry") ||
    text.includes("intern")
  ) {
    return "entry";
  }
  return "mid";
};

const normalizeAdzunaJob = (raw, country) => {
  return {
    external_id: `adzuna-${raw.id}`,
    source: "adzuna",
    title: raw.title || "",
    company: raw.company?.display_name || "Unknown",
    location: raw.location?.display_name || "",
    country,
    description: raw.description || "",
    url: raw.redirect_url || "",
    salary_min: raw.salary_min ? Math.round(raw.salary_min) : null,
    salary_max: raw.salary_max ? Math.round(raw.salary_max) : null,
    experience_level: inferExperienceLevel(raw.title, raw.description),
    skills_required: [], // Day 5: AI will extract from description
    posted_at: raw.created
      ? new Date(raw.created).toISOString()
      : new Date().toISOString(),
  };
};

const filterRecent = (jobs) => {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  return jobs.filter((job) => new Date(job.posted_at) >= cutoff);
};

/**
 * Fetch jobs from Adzuna.
 * Uses mock data in development, real API in production.
 *
 * @param {string} country - e.g. "gb", "us", "ca"
 * @param {string} query   - e.g. "software engineer"
 * @param {number} results - max results per page (Adzuna max: 50)
 */

const fetchAdzunaJobs = async (
  country = "ca",
  query = "junior fullstack developer",
  results = 50,
) => {
  if (IS_DEV) {
    console.log("[Adzuna] DEV mode - returning mock data");
    return filterRecent(MOCK_JOBS.filter((j) => j.source === "adzuna"));
  }
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    console.error("[Adzuna] Missing ADZUNA_APP_ID or ADZUNA_APP_KEY in .env");
    return [];
  }

  try {
    const url = `${ADZUNA_BASE}/${country}/search/1`;
    const response = await axios.get(url, {
      params: {
        app_id: appId,
        app_key: appKey,
        what: query,
        results_per_page: results,
        max_days_old: 2, // last 48h only
        sort_by: "date",
      },
      timeout: 10000,
    });

    const raw = response.data?.results || [];
    console.log(
      `[Adzuna] Fetched ${raw.length} jobs for "${query}" in ${country.toUpperCase()}`,
    );
    const normalized = raw.map((job) => normalizeAdzunaJob(job, country));
    return filterRecent(normalized);
  } catch (err) {
    const status = err.response?.status;
    const message = err.response?.data?.error || err.message;
    console.error(`[Adzuna] API error (${status}): ${message}`);
    return [];
  }
};

module.exports = { fetchAdzunaJobs };
