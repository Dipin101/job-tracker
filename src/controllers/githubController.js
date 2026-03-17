const pool = require("../db/db");
const axios = require("axios");
const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic();

// POST /api/github/connect
const connectGithub = async (req, res) => {
  const { github_url } = req.body;
  if (!github_url) {
    return res.status(400).json({ message: "GitHub URL is required" });
  }

  try {
    // extract username from URL
    // https://github.com/username → username
    const username = github_url
      .replace("https://github.com/", "")
      .replace(/\/$/, "");

    // fetch repos from GitHub API
    const reposResponse = await axios.get(
      `https://api.github.com/users/${username}/repos?sort=updated&per_page=20`,
    );
    const repos = reposResponse.data;

    if (repos.length === 0) {
      return res.status(400).json({ message: "No public repos found" });
    }

    // build summary for Anthropic
    const repoSummary = repos.map((repo) => ({
      name: repo.name,
      description: repo.description,
      language: repo.language,
      topics: repo.topics,
    }));

    // send to Anthropic for skill analysis
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Analyze these GitHub repositories and extract all technical skills.
          Return ONLY a JSON array of strings, nothing else.
          Example: ["JavaScript", "React", "Node.js", "PostgreSQL"]
          
          REPOSITORIES:
          ${JSON.stringify(repoSummary, null, 2)}`,
        },
      ],
    });

    // parse skills
    const content = response.content[0].text;
    const analyzedSkills = JSON.parse(content);

    // upsert to github_profiles table
    const userId = req.user.userId;
    const result = await pool.query(
      `INSERT INTO github_profiles (user_id, github_url, analyzed_skills, last_analyzed_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         github_url = EXCLUDED.github_url,
         analyzed_skills = EXCLUDED.analyzed_skills,
         last_analyzed_at = NOW()
       RETURNING *`,
      [userId, github_url, analyzedSkills],
    );

    res.status(201).json({
      message: "GitHub profile analyzed",
      profile: result.rows[0],
    });
  } catch (err) {
    console.error("GitHub Connect Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { connectGithub };
