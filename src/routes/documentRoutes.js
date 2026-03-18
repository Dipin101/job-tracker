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

router.post("/resume/:jobId", generateResumeForJob); // POST /api/documents/resume/:jobId
router.post("/cover-letter/:jobId", generateCoverLetterForJob); // POST /api/documents/cover-letter/:jobId
router.post("/generate/:jobId", generateBoth); // POST /api/documents/generate/:jobId
router.get("/resume/:jobId/download", downloadResume); // GET  /api/documents/resume/:jobId/download
router.get("/cover-letter/:jobId/download", downloadCoverLetter); // GET /api/documents/cover-letter/:jobId/download

module.exports = router;
