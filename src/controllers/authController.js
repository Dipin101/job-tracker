const pool = require("../db/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "1h" });
};

const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "7d",
  });
};

const register = async (req, res) => {
  const { email, password } = req.body;
  try {
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email =$1",
      [email],
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "Email already registered." });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await pool.query(
      "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email, created_at",
      [email, hashedPassword],
    );

    res.status(201).json({ message: "Registered successfully. Please Login" });
  } catch (err) {
    console.error("Resigter Error: ", err);
    res.status(500).json({ message: "Server error" });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid Credentials" });
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); //-> 7 days 7days + 24 hour* 60minute * 60seconds * 1000ms
    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1,$2, $3)",
      [user.id, refreshToken, expiresAt],
    );

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ accessToken, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error("Login Error", err);
    res.status(500).json({ message: "Could not Login" });
  }
};

const refresh = async (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) {
    return res.status(401).json({ message: "No refresh token" });
  }
  try {
    const result = await pool.query(
      "SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()",
      [token],
    );
    if (result.rows.length === 0) {
      return res
        .status(401)
        .json({ message: "Invalid or expired refresh token" });
    }

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

    const accessToken = generateAccessToken(decoded.userId);
    res.json({ accessToken });
  } catch (err) {
    console.error("Refresh Error", err);
    res.status(401).json({ message: "Invalid refresh token" });
  }
};

const logout = async (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) {
    return res.status(401).json({ message: "No refresh token" });
  }
  try {
    await pool.query("DELETE FROM refresh_tokens WHERE token =$1", [token]);

    res.clearCookie("refreshToken");
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout Error", err);
    res.status(500).json({ message: "Could not logout" });
  }
};

const getProfile = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, email, full_name, phone, location, work_authorization, years_experience, salary_expectation_min, salary_expectation_max, linkedin_url, portfolio_url, bio_summary, job_titles, match_threshold, experience_level, country, job_search_status, is_active FROM users WHERE id = $1",
      [req.user.userId],
    );
    return res.json({ user: result.rows[0] });
  } catch (err) {
    console.error("Get profile error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const updateProfile = async (req, res) => {
  try {
    const {
      full_name,
      phone,
      location,
      work_authorization,
      years_experience,
      salary_expectation_min,
      salary_expectation_max,
      linkedin_url,
      portfolio_url,
      bio_summary,
      job_titles,
      match_threshold,
      experience_level,
      country,
    } = req.body;

    const result = await pool.query(
      `UPDATE users SET
        full_name = $1, phone = $2, location = $3, work_authorization = $4,
        years_experience = $5, salary_expectation_min = $6, salary_expectation_max = $7,
        linkedin_url = $8, portfolio_url = $9, bio_summary = $10,
        job_titles = $11, match_threshold = $12, experience_level = $13, country = $14
       WHERE id = $15
       RETURNING id, email, full_name, experience_level, country, match_threshold`,
      [
        full_name,
        phone,
        location,
        work_authorization,
        years_experience,
        salary_expectation_min,
        salary_expectation_max,
        linkedin_url,
        portfolio_url,
        bio_summary,
        job_titles,
        match_threshold,
        experience_level,
        country,
        req.user.userId,
      ],
    );

    return res.json({ message: "Profile updated", user: result.rows[0] });
  } catch (err) {
    console.error("Update profile error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  register,
  login,
  refresh,
  logout,
  getProfile,
  updateProfile,
};
