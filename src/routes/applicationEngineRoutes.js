const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  runPipeline,
  runRetryQueue,
  setStatus,
} = require("../controllers/applicationEngineController");

router.use(auth);

router.post("/run", runPipeline);
router.post("/retry", runRetryQueue);
router.post("/status", setStatus);

module.exports = router;
