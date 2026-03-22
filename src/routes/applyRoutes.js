const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  runApplyPipeline,
  applySingleJob,
  markAsManuallyApplied,
  getApplyStatus,
  sendTestEmail,
} = require("../controllers/applyController");

router.use(auth);

router.post("/run", runApplyPipeline);
router.post("/single", applySingleJob);
router.patch("/:applicationId/manual", markAsManuallyApplied);
router.get("/status", getApplyStatus);
router.post("/test-email", sendTestEmail);

module.exports = router;
