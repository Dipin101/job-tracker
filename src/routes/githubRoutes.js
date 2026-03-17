const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { connectGithub } = require("../controllers/githubController");

router.post("/connect", auth, connectGithub);

module.exports = router;
