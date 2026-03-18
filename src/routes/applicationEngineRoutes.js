const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  runPipeline,
  runRetryQueue,
  setStatus,
} = require("../controllers/applicationEngineController");

router.use(auth);

router.post("/run", runPipeline); // POST /api/engine/run
router.post("/retry", runRetryQueue); // POST /api/engine/retry
router.post("/status", setStatus); // POST /api/engine/status

module.exports = router;
