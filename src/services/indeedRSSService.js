// const axios = require("axios");
// const { parseStringPromise } = require("xml2js");
// const { MOCK_JOBS } = require("./mockData");

// const IS_DEV = process.env.NODE_ENV !== "production";
// const INDEED_RSS_BASE = "https://www.indeed.com/rss";

// // ─── Country → cities map ─────────────────────────────────────────────────────
// // Indeed RSS works best with specific city/region queries.
// // Add more countries and cities as needed.
// const COUNTRY_CITIES = {
//   gb: ["London", "Manchester", "Birmingham", "Edinburgh", "Bristol", "Remote"],
//   ca: ["Toronto", "Vancouver", "Montreal", "Calgary", "Ottawa", "Remote"],
//   us: ["New York", "San Francisco", "Austin", "Seattle", "Chicago", "Remote"],
//   au: ["Sydney", "Melbourne", "Brisbane", "Perth", "Remote"],
//   de: ["Berlin", "Munich", "Hamburg", "Frankfurt", "Remote"],
//   ie: ["Dublin", "Cork", "Remote"],
//   nl: ["Amsterdam", "Rotterdam", "Remote"],
//   sg: ["Singapore", "Remote"],
//   remote: ["Remote"],
// };

// // ─── Helpers ──────────────────────────────────────────────────────────────────

// const inferExperienceLevel = (title = "", description = "") => {
//   const text = (title + " " + description).toLowerCase();
//   if (
//     text.includes("senior") ||
//     text.includes("lead") ||
//     text.includes("principal") ||
//     text.includes("staff")
//   )
//     return "senior";

//   if (
//     text.includes("junior") ||
//     text.includes("graduate") ||
//     text.includes("entry") ||
//     text.includes("intern")
//   )
//     return "entry";

//   return "mid";
// };

// const stripHtml = (html = "") =>
//   html
//     .replace(/<[^>]*>/g, " ")
//     .replace(/&amp;/g, "&")
//     .replace(/&lt;/g, "<")
//     .replace(/&gt;/g, ">")
//     .replace(/&nbsp;/g, " ")
//     .replace(/\s+/g, " ")
//     .trim();

// const extractIndeedId = (guid = "") => {
//   const match = guid.match(/jk=([a-z0-9]+)/i);
//   return match
//     ? `indeed-${match[1]}`
//     : `indeed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
// };

// const normalizeIndeedJob = (item, city, country) => {
//   const title = item.title?.[0] || "";
//   const description = stripHtml(item.description?.[0] || "");
//   const url = item.link?.[0] || "";
//   const guid = item.guid?.[0]?._ || item.guid?.[0] || url;
//   const pubDate = item.pubDate?.[0] || null;
//   const sourceTag = item.source?.[0]?._ || item.source?.[0] || "";

//   return {
//     external_id: extractIndeedId(guid),
//     source: "indeed_rss",
//     title,
//     company: sourceTag || "Unknown",
//     location: city, // now populated from our city param
//     country,
//     description,
//     url,
//     salary_min: null,
//     salary_max: null,
//     experience_level: inferExperienceLevel(title, description),
//     required_skills: [],
//     posted_at: pubDate
//       ? new Date(pubDate).toISOString()
//       : new Date().toISOString(),
//   };
// };

// const filterRecent = (jobs) => {
//   const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
//   return jobs.filter((job) => new Date(job.posted_at) >= cutoff);
// };

// // ─── Single city fetch ────────────────────────────────────────────────────────

// const fetchForCity = async (query, city, country) => {
//   try {
//     const response = await axios.get(INDEED_RSS_BASE, {
//       params: {
//         q: query,
//         l: city,
//         sort: "date",
//         fromage: 2,
//         limit: 25, // 25 per city — stays within rate limits
//       },
//       headers: {
//         "User-Agent": "Mozilla/5.0 (compatible; JobTrackerBot/1.0)",
//       },
//       timeout: 10000,
//     });

//     const parsed = await parseStringPromise(response.data, {
//       explicitArray: true,
//     });
//     const items = parsed?.rss?.channel?.[0]?.item || [];

//     console.log(`[Indeed RSS] "${city}" → ${items.length} jobs for "${query}"`);

//     return items.map((item) => normalizeIndeedJob(item, city, country));
//   } catch (err) {
//     console.error(`[Indeed RSS] Failed for city "${city}": ${err.message}`);
//     return [];
//   }
// };

// // ─── Deduplicate by external_id ───────────────────────────────────────────────
// // Same job can appear in multiple city queries (e.g. a Remote job)

// const deduplicateJobs = (jobs) => {
//   const seen = new Set();
//   return jobs.filter((job) => {
//     if (seen.has(job.external_id)) return false;
//     seen.add(job.external_id);
//     return true;
//   });
// };

// // ─── Main export ──────────────────────────────────────────────────────────────

// /**
//  * Fetch jobs from Indeed RSS across multiple cities for a given country.
//  *
//  * @param {string}   query    - e.g. "software engineer"
//  * @param {string}   country  - ISO code e.g. "gb", "ca", "us"
//  * @param {string[]} [cities] - override the default city list for this country
//  *
//  * Examples:
//  *   fetchIndeedJobs("software engineer", "gb")
//  *   fetchIndeedJobs("software engineer", "ca", ["Toronto", "Remote"])
//  */
// const fetchIndeedJobs = async (
//   query = "software engineer",
//   country = "gb",
//   cities,
// ) => {
//   if (IS_DEV) {
//     console.log("[Indeed RSS] DEV mode — returning mock data");
//     return filterRecent(MOCK_JOBS.filter((j) => j.source === "indeed_rss"));
//   }

//   // Resolve city list — caller override → country map → fallback to Remote only
//   const cityList = cities ||
//     COUNTRY_CITIES[country.toLowerCase()] || ["Remote"];

//   console.log(
//     `[Indeed RSS] Querying ${cityList.length} cities for country "${country}":`,
//     cityList,
//   );

//   // Fetch all cities in parallel
//   const results = await Promise.all(
//     cityList.map((city) => fetchForCity(query, city, country)),
//   );

//   const allJobs = results.flat();
//   const deduplicated = deduplicateJobs(allJobs);
//   const recent = filterRecent(deduplicated);

//   console.log(
//     `[Indeed RSS] Total: ${allJobs.length} fetched → ${deduplicated.length} unique → ${recent.length} recent`,
//   );

//   return recent;
// };

// module.exports = { fetchIndeedJobs, COUNTRY_CITIES };
