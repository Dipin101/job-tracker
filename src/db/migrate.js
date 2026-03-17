const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const runMigrations = async () => {
  const client = await pool.connect();
  try {
    console.log("Running migrations...");
    const sql = fs.readFileSync(
      path.join(__dirname, "migrations/001_initial_schema.sql"),
      "utf8",
    );
    await client.query(sql);
    console.log("Tables created successfully");
  } catch (err) {
    console.error("Migration Failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

runMigrations();
