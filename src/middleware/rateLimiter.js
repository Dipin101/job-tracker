const rateLimit = require("express-rate-limit");

// General API rate limit — 100 requests per 15 minutes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests — please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limit for auth routes — 10 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts — please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Pipeline limit — 5 runs per hour (prevents abuse)
const pipelineLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Pipeline rate limit reached — try again in an hour" },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { apiLimiter, authLimiter, pipelineLimiter };
