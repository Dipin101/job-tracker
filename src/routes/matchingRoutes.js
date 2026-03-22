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

router.post("/run", runMatching);
router.post("/job/:jobId", matchSingleJob);
router.get("/skills", getMySkills);
router.get("/applications", getApplications);

module.exports = router;
