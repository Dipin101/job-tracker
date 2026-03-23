require("dotenv").config();
const { Pool } = require("pg");
const { MOCK_JOBS } = require("./mockData");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const seed = async () => {
  const client = await pool.connect();
  try {
    let inserted = 0;
    let skipped = 0;

    for (const job of MOCK_JOBS) {
      const result = await client.query(
        `INSERT INTO jobs (external_id, source, title, company, location, country, description, url, salary_min, salary_max, experience_level, required_skills, posted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (external_id) DO NOTHING
         RETURNING id, title, company`,
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
          job.skills_required,
          job.posted_at,
        ],
      );

      if (result.rows.length > 0) {
        console.log(
          `✅ Inserted: ${result.rows[0].title} @ ${result.rows[0].company} (${result.rows[0].id})`,
        );
        inserted++;
      } else {
        console.log(
          `⏭️  Skipped (already exists): ${job.title} @ ${job.company}`,
        );
        skipped++;
      }
    }

    console.log(`\nDone — ${inserted} inserted, ${skipped} skipped`);
  } finally {
    client.release();
    await pool.end();
  }
};

seed().catch(console.error);
