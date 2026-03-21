const express = require("express");
const router = express.Router();
const {
  register,
  login,
  logout,
  refresh,
  getProfile,
  updateProfile,
} = require("../controllers/authController");
const auth = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimiter");

router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.post("/logout", logout);
router.post("/refresh", refresh);
router.get("/profile", auth, getProfile);
router.put("/profile", auth, updateProfile);

module.exports = router;
