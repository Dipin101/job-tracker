const axios = require("axios");
const { MOCK_JOBS } = require("./mockData");

const IS_DEV = process.env.NODE_ENV !== "production";
const JOOBLE_BASE = "https://jooble.org/api";

const inferExperienceLevel = (title = "", description = "") => {
  const text = (title + " " + description).toLowerCase();
  if (text.match(/senior|lead|principal|staff/)) return "senior";
  if (text.match(/junior|graduate|entry|intern/)) return "entry";
  return "mid";
};

const filterRecent = (jobs) => {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return jobs.filter((job) => new Date(job.posted_at) >= cutoff);
};

const locationMap = {
  ca: "Canada",
  gb: "United Kingdom",
  us: "United States",
  au: "Australia",
  de: "Germany",
  ie: "Ireland",
  nl: "Netherlands",
};

/**
 * Fetch jobs from Jooble API.
 * Aggregates from 140,000+ sources including Workopolis, Monster CA, Eluta.
 * Free API key at: jooble.org/api/about
 */
const fetchJoobleJobs = async (query = "junior developer", country = "ca") => {
  if (IS_DEV) {
    console.log("[Jooble] DEV mode — returning mock data");
    return filterRecent(
      MOCK_JOBS.filter((j) => j.source === "adzuna").slice(0, 2),
    );
  }

  const apiKey = process.env.JOOBLE_API_KEY;
  if (!apiKey) {
    console.error(
      "[Jooble] Missing JOOBLE_API_KEY in .env — get free key at jooble.org/api/about",
    );
    return [];
  }

  const location = locationMap[country] || "Canada";

  try {
    const response = await axios.post(
      `${JOOBLE_BASE}/${apiKey}`,
      {
        keywords: query,
        location,
        page: "1",
        ResultsOnPage: "50",
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 15000,
      },
    );

    const jobs = response.data?.jobs || [];
    console.log(`[Jooble] "${query}" in ${location} → ${jobs.length} jobs`);

    return filterRecent(
      jobs.map((job) => ({
        external_id: `jooble-${job.id || Math.random().toString(36).slice(2, 10)}`,
        source: "jooble",
        title: job.title || "",
        company: job.company || "Unknown",
        location: job.location || location,
        country,
        description: job.snippet || job.description || "",
        url: job.link || "",
        salary_min: null,
        salary_max: null,
        experience_level: inferExperienceLevel(job.title, job.snippet),
        required_skills: [], // ✅ fixed: was skills_required
        posted_at: job.updated
          ? new Date(job.updated).toISOString()
          : new Date().toISOString(),
      })),
    );
  } catch (err) {
    console.error(`[Jooble] Error: ${err.response?.status} — ${err.message}`);
    return [];
  }
};

module.exports = { fetchJoobleJobs };
