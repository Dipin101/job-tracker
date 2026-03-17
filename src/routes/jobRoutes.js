const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  getJobs,
  getLatestJobs,
  getJobById,
  triggerFetch,
} = require("../controllers/jobController");

// All job routes require a valid access token
router.use(auth);

router.get("/", getJobs); // GET  /api/jobs
router.get("/latest", getLatestJobs); // GET  /api/jobs/latest
router.post("/trigger", triggerFetch); // POST /api/jobs/trigger
router.get("/:id", getJobById); // GET  /api/jobs/:id  ← keep last

module.exports = router;
