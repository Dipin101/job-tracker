require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(cookieParser());

const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);
const resumeRoutes = require("./routes/resumeRoutes");
app.use("/api/resume", resumeRoutes);
const githubRoutes = require("./routes/githubRoutes");
app.use("/api/github", githubRoutes);
const jobRoutes = require("./routes/jobRoutes");
app.use("/api/jobs", jobRoutes);
const matchingRoutes = require("./routes/matchingRoutes");
app.use("/api/matching", matchingRoutes);
const documentRoutes = require("./routes/documentRoutes");
app.use("/api/documents", documentRoutes);
const engineRoutes = require("./routes/applicationEngineRoutes");
app.use("/api/engine", engineRoutes);

app.get("/", (req, res) => {
  res.json({ message: "Job Tracker API is running." });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  if (process.env.NODE_ENV === "production") {
    const { startCronJobs } = require("./jobs/cronJob");
    startCronJobs();
  } else {
    console.log(
      "[Cron] Skipped in dev — use POST /api/jobs/trigger to test manually",
    );
  }
});
