require("dotenv").config({
  path: require("path").join(__dirname, "../../.env"),
});
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const runMigrations = async () => {
  const client = await pool.connect();
  try {
    console.log("Running migrations...");

    await client.query(
      `CREATE TABLE IF NOT EXISTS migrations (id SERIAL PRIMARY KEY, filename VARCHAR(255) UNIQUE NOT NULL, run_at TIMESTAMP DEFAULT NOW())`,
    );

    const migrationsDir = path.join(__dirname, "migrations");
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const { rows } = await client.query("SELECT filename FROM migrations");
    const completed = new Set(rows.map((r) => r.filename));

    for (const file of files) {
      if (completed.has(file)) {
        console.log(`Skipping ${file} (already run)`);
        continue;
      }

      console.log(`Running ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await client.query(sql);
      await client.query("INSERT INTO migrations (filename) VALUES($1)", [
        file,
      ]);
      console.log(`${file} complete`);
    }
    console.log("All migration complete");
  } catch (err) {
    console.error("Migration Failed:", err.message);
    console.error("Detail", err.detail);
    console.error("Where: ", err.where);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

runMigrations();
