const axios = require("axios");
const { MOCK_JOBS } = require("./mockData");

const IS_DEV = process.env.NODE_ENV !== "production";
const ARBEITNOW_BASE = "https://www.arbeitnow.com/api/job-board-api";

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

const stripHtml = (html = "") =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Canadian city/province keywords for filtering
const CA_KEYWORDS = [
  "canada",
  "ontario",
  "toronto",
  "vancouver",
  "montreal",
  "calgary",
  "ottawa",
  "edmonton",
  "winnipeg",
  "quebec",
  "british columbia",
  "alberta",
  "nova scotia",
];

/**
 * Fetch jobs from Arbeitnow.
 * Completely free, no API key needed.
 * Pulls directly from company ATS systems.
 */
const fetchArbeitnowJobs = async (
  query = "junior developer",
  country = "ca",
) => {
  if (IS_DEV) {
    console.log("[Arbeitnow] DEV mode — returning mock data");
    return filterRecent(
      MOCK_JOBS.filter((j) => j.source === "indeed_rss").slice(0, 1),
    );
  }

  try {
    const response = await axios.get(ARBEITNOW_BASE, {
      params: { search: query, page: 1 },
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; JobTrackerBot/1.0)",
        Accept: "application/json",
      },
      timeout: 15000,
    });

    const jobs = response.data?.data || [];
    console.log(`[Arbeitnow] "${query}" → ${jobs.length} jobs`);

    // For CA: keep remote jobs + any with Canadian location keywords
    // For other countries: keep all (Arbeitnow is mostly EU/remote)
    const relevant =
      country === "ca"
        ? jobs.filter((job) => {
            const loc = (job.location || "").toLowerCase();
            return (
              job.remote === true || CA_KEYWORDS.some((kw) => loc.includes(kw))
            );
          })
        : jobs;

    console.log(`[Arbeitnow] After filter: ${relevant.length} jobs`);

    return filterRecent(
      relevant.map((job) => ({
        external_id: `arbeitnow-${job.slug || Math.random().toString(36).slice(2, 10)}`,
        source: "arbeitnow",
        title: job.title || "",
        company: job.company_name || "Unknown",
        location: job.location || (job.remote ? "Remote" : ""),
        country,
        description: stripHtml(job.description || ""),
        url: job.url || `https://www.arbeitnow.com/jobs/${job.slug}`,
        salary_min: null,
        salary_max: null,
        experience_level: inferExperienceLevel(job.title, job.description),
        required_skills: job.tags || [], // ✅ fixed: was skills_required — arbeitnow provides tags!
        posted_at: job.created_at
          ? new Date(job.created_at * 1000).toISOString() // Unix timestamp
          : new Date().toISOString(),
      })),
    );
  } catch (err) {
    console.error(`[Arbeitnow] Error: ${err.message} — skipping`);
    return [];
  }
};

module.exports = { fetchArbeitnowJobs };
