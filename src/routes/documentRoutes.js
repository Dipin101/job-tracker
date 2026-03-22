const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  generateResumeForJob,
  generateCoverLetterForJob,
  generateBoth,
  downloadResume,
  downloadCoverLetter,
} = require("../controllers/documentController");

router.use(auth);

router.post("/resume/:jobId", generateResumeForJob);
router.post("/cover-letter/:jobId", generateCoverLetterForJob);
router.post("/generate/:jobId", generateBoth);
router.get("/resume/:jobId/download", downloadResume);
router.get("/cover-letter/:jobId/download", downloadCoverLetter);

module.exports = router;
