const pool = require("../db/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

//Registering
const register = async (req, res) => {
  const { email, password } = req.body;
  try {
    //checking if user exists
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email =$1",
      [email],
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "Email already registered." });
    }
    //hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    //create user if not exist
    const result = await pool.query(
      "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email, created_at",
      [email, hashedPassword],
    );
    const user = result.rows[0];

    //generate token
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "5h",
    });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error("Resigter Error: ", err);
    res.status(500).json({ message: "Server error" });
  }
};

//for login
const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    //finding user
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const user = result.rows[0];

    //comparing the password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid Credentials" });
    }

    //generate tokens for user
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "5h",
    });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error("Login Error", err);
    res.status(500).json({ message: "Could not Login" });
  }
};

module.exports = { register, login };
