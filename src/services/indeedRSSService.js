const axios = require("axios");
const { parseStringPromise } = require("xml2js");
const { MOCK_JOBS } = require("./mockData");
const IS_DEV = process.env.NODE_ENV !== "production";
const INDEED_RSS_BASE = "https://www.indeed.com/rss";

//Same as adzuna for experience
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

//strip html tags from indeed's description field
const stripHtml = (html = "") => {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

//pull job id from indeed url
//guid -> Globally unique identifier
const extractIndeedId = (guid = "") => {
  const match = guid.match(/jk=([a-z0-9]+)/i);
  return match
    ? `indeed-${match[1]}`
    : `indeed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

//Normalize similar to adzuna

const normalizeIndeedJobs = (item, country) => {
  const title = item.title?.[0] || "";
  const description = stripHtml(item.description?.[0] || "");
  const url = item.link?.[0] || "";
  const guid = item.guid?.[0]?._ || item.guid?.[0] || url;
  const pubDate = item.pubDate?.[0] || null;
  const sourceTag = item.source?.[0]?._ || item.source?.[0] || "";

  return {
    external_id: extractIndeedId(guid),
    source: "indeed_rss",
    title,
    company: sourceTag || "Unknown",
    location: "",
    country,
    description,
    url,
    salary_min: null,
    salary_max: null,
    experience_level: inferExperienceLevel(title, description),
    skills_required: [], // Day 5: AI will extract
    posted_at: pubDate
      ? new Date(pubDate).toISOString()
      : new Date().toISOString(),
  };
};

// Same like adzuna --> keep jobs posted in the last 48 hours
const filterRecent = (jobs) => {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  return jobs.filter((job) => new Date(job.posted_at) >= cutoff);
};

/**
 * Fetch jobs from Indeed RSS feed.
 * No API key needed — public RSS.
 * Uses mock data in development, real feed in production.
 *
 * @param {string} query    - e.g. "software engineer"
 * @param {string} location - e.g. "London" or "Remote"
 * @param {string} country  - ISO code for our DB e.g. "gb"
 */
const fetchIndeedJobs = async (
  query = "software engineer",
  location = "",
  country = "gb",
) => {
  if (IS_DEV) {
    console.log("[Indeed RSS] DEV mode — returning mock data");
    return filterRecent(MOCK_JOBS.filter((j) => j.source === "indeed_rss"));
  }

  try {
    const response = await axios.get(INDEED_RSS_BASE, {
      params: {
        q: query,
        l: location,
        sort: "date",
        fromage: 2, // last 2 days
        limit: 50,
      },
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; JobTrackerBot/1.0)",
      },
      timeout: 10000,
    });

    const parsed = await parseStringPromise(response.data, {
      explicitArray: true,
    });
    const items = parsed?.rss?.channel?.[0]?.item || [];

    console.log(`[Indeed RSS] Fetched ${items.length} jobs for "${query}"`);

    const normalized = items.map((item) => normalizeIndeedJob(item, country));
    return filterRecent(normalized);
  } catch (err) {
    console.error(`[Indeed RSS] Error: ${err.message}`);
    return [];
  }
};

module.exports = { fetchIndeedJobs };
