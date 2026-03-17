const express = require("express");
const router = express.Router();
const multer = require("multer");
const auth = require("../middleware/auth");
const { uploadResume } = require("../controllers/resumeController");

//store file in memory as buffer
const upload = multer({ storage: multer.memoryStorage() });

router.post("/upload", auth, upload.single("resume"), uploadResume);

module.exports = router;
