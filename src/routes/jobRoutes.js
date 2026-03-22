const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  getJobs,
  getLatestJobs,
  getJobById,
  triggerFetch,
} = require("../controllers/jobController");

router.use(auth);

router.get("/", getJobs);
router.get("/latest", getLatestJobs);
router.post("/trigger", triggerFetch);
router.get("/:id", getJobById);

module.exports = router;
