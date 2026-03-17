//we put this here as migrations is a independent script so 1 for here 1 for index.js--> server
require("dotenv").config({
  path: require("path").join(__dirname, "../../.env"),
});
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

/*
Flow of the migrations
- connects to the database using url
- from db waits for the connection
- check if table exists or not if not it creates table with id, filename and timestamp
- we get directory path 
- read the directory path with sorted values so 001, 002 comes after sequentially
- our result from query of select filenme from migrations returns us object rows [{ filename: "001_initial_schema.sql" }, { filename: "002_add_columns.sql" }]
 rowCount=1}
- we put filenames in the set and iterate over files array, the set is only used to check if file is in set
- if there we skip it if not
- we run the query of the sql which leads us to the path of the file 
- then insert  it into the table with filename and file then consolelog everything success
*/

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const runMigrations = async () => {
  const client = await pool.connect();
  try {
    console.log("Running migrations...");

    //create tracking table if it doesn't exits
    await client.query(
      `CREATE TABLE IF NOT EXISTS migrations (id SERIAL PRIMARY KEY, filename VARCHAR(255) UNIQUE NOT NULL, run_at TIMESTAMP DEFAULT NOW())`,
    );

    //get all tables from .sql file in migrations/folder
    const migrationsDir = path.join(__dirname, "migrations");
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    //get already run migrations from tracking table
    const { rows } = await client.query("SELECT filename FROM migrations");
    const completed = new Set(rows.map((r) => r.filename));

    //Run only new migrations
    for (const file of files) {
      if (completed.has(file)) {
        console.log(`Skipping ${file} {already run}`);
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
