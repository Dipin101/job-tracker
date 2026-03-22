const pool = require("../db/db");
const pdfParse = require("pdf-parse");
const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic();

const uploadResume = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const pdfData = await pdfParse(req.file.buffer);
    const rawText = pdfData.text;

    if (!rawText || rawText.trim().length === 0) {
      return res
        .status(400)
        .json({ message: "Could not extract text from PDF" });
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Extract all technical and professional skills from this CV
                    Return ONLY a JSON array of strings, nothing else.
                    Example: ["Javascript", "React", "Node.js", "PostgreSQL", "MongoDB"]

                    CV TEXT:${rawText}`,
        },
      ],
    });

    const content = response.content[0].text;
    const cleaned = content.replace(/```json|```/g, "").trim();
    const extractedSkills = JSON.parse(cleaned);

    const userId = req.user.userId;

    const result = await pool.query(
      `INSERT INTO base_resumes(user_id, file_url, raw_text, extracted_skills) VALUES($1,$2,$3,$4)
        ON CONFLICT(user_id) 
        DO UPDATE SET
            raw_text = EXCLUDED.raw_text, 
            extracted_skills = EXCLUDED.extracted_skills, 
            uploaded_at = NOW()
        RETURNING *`,
      [userId, req.file.originalname, rawText, extractedSkills],
    );
    res.status(201).json({
      message: "Resume uploaded and skills extracted",
      resume: result.rows[0],
    });
  } catch (err) {
    console.error("Resume Upload Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { uploadResume };
