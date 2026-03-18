const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  runMatching,
  matchSingleJob,
  getMySkills,
  getApplications,
} = require("../controllers/matchingController");

router.use(auth);

router.post("/run", runMatching); // POST /api/matching/run
router.post("/job/:jobId", matchSingleJob); // POST /api/matching/job/:jobId
router.get("/skills", getMySkills); // GET  /api/matching/skills
router.get("/applications", getApplications); // GET  /api/matching/applications

module.exports = router;
