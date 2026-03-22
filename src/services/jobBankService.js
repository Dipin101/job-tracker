// const axios = require("axios");
// const { MOCK_JOBS } = require("./mockData");

// const IS_DEV = process.env.NODE_ENV !== "production";

// const inferExperienceLevel = (title = "", description = "") => {
//   const text = (title + " " + description).toLowerCase();
//   if (text.match(/senior|lead|principal|staff/)) return "senior";
//   if (text.match(/junior|graduate|entry|intern/)) return "entry";
//   return "mid";
// };

// const filterRecent = (jobs) => {
//   const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
//   return jobs.filter((job) => new Date(job.posted_at) >= cutoff);
// };

// /**
//  * Fetch jobs from Job Bank Canada.
//  * Canada's official government job board — no API key needed, always free.
//  * Only relevant for country = "ca".
//  */
// const fetchJobBankJobs = async (query = "junior developer") => {
//   if (IS_DEV) {
//     console.log("[Job Bank] DEV mode — returning mock data");
//     return filterRecent(
//       MOCK_JOBS.filter((j) => j.source === "adzuna").slice(0, 1),
//     );
//   }

//   try {
//     const response = await axios.get(
//       "https://jobs.jobbank.gc.ca/jobsearch/jobsearchresults",
//       {
//         params: {
//           searchstring: query,
//           locationstring: "Canada",
//           action: "ajax",
//           fcode: "",
//           mid: "",
//           noc: "",
//         },
//         headers: {
//           Accept: "application/json, text/javascript, */*",
//           "User-Agent": "Mozilla/5.0 (compatible; JobTrackerBot/1.0)",
//           "X-Requested-With": "XMLHttpRequest",
//         },
//         timeout: 15000,
//       },
//     );

//     const data = response.data;
//     const jobs = data?.jobs || data?.hits?.hits || data?.results || [];

//     console.log(`[Job Bank] "${query}" → ${jobs.length} jobs`);

//     if (jobs.length === 0) {
//       console.log("[Job Bank] No jobs returned — API format may have changed");
//       return [];
//     }

//     return filterRecent(
//       jobs.map((job) => {
//         const j = job._source || job; // handle Elasticsearch _source wrapper
//         return {
//           external_id: `jobbank-${j.jobId || j.id || j.noc_id || Math.random().toString(36).slice(2, 10)}`,
//           source: "jobbank",
//           title: j.title || j.jobTitle || j.occupation || "",
//           company: j.employer || j.businessName || j.company || "Unknown",
//           location: j.location || j.city || j.province || "Canada",
//           country: "ca",
//           description: j.jobSummary || j.description || j.duties || "",
//           url:
//             j.jobPostingUrl ||
//             j.url ||
//             `https://jobs.jobbank.gc.ca/jobsearch/jobposting/${j.jobId || j.id}`,
//           salary_min: j.salaryMin ? parseFloat(j.salaryMin) : null,
//           salary_max: j.salaryMax ? parseFloat(j.salaryMax) : null,
//           experience_level: inferExperienceLevel(
//             j.title || j.jobTitle || "",
//             j.jobSummary || j.description || "",
//           ),
//           required_skills: [], // ✅ fixed: was skills_required
//           posted_at:
//             j.datePosted || j.postedDate || j.created
//               ? new Date(
//                   j.datePosted || j.postedDate || j.created,
//                 ).toISOString()
//               : new Date().toISOString(),
//         };
//       }),
//     );
//   } catch (err) {
//     console.error(`[Job Bank] Error: ${err.message} — skipping`);
//     return [];
//   }
// };

// module.exports = { fetchJobBankJobs };
