const db = require("../db/db");
const {
  generateResume,
  generateCoverLetter,
  generateDocuments,
} = require("../services/documentService");

const generateResumeForJob = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { jobId } = req.params;

    const resume = await generateResume(userId, jobId);

    return res.json({
      message: "Resume generated",
      resume: {
        id: resume.id,
        job_id: resume.job_id,
        content: resume.content,
        created_at: resume.created_at,
      },
    });
  } catch (err) {
    console.error(
      "[DocumentController] generateResumeForJob error:",
      err.message,
    );
    return res.status(500).json({ error: err.message });
  }
};

const generateCoverLetterForJob = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { jobId } = req.params;

    const coverLetter = await generateCoverLetter(userId, jobId);

    return res.json({
      message: "Cover letter generated",
      coverLetter: {
        id: coverLetter.id,
        job_id: coverLetter.job_id,
        content: coverLetter.content,
        created_at: coverLetter.created_at,
      },
    });
  } catch (err) {
    console.error(
      "[DocumentController] generateCoverLetterForJob error:",
      err.message,
    );
    return res.status(500).json({ error: err.message });
  }
};

const generateBoth = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { jobId } = req.params;

    const { resume, coverLetter } = await generateDocuments(userId, jobId);

    return res.json({
      message: "Documents generated",
      resume: {
        id: resume.id,
        job_id: resume.job_id,
        content: resume.content,
        created_at: resume.created_at,
      },
      coverLetter: {
        id: coverLetter.id,
        job_id: coverLetter.job_id,
        content: coverLetter.content,
        created_at: coverLetter.created_at,
      },
    });
  } catch (err) {
    console.error("[DocumentController] generateBoth error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

const downloadResume = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { jobId } = req.params;

    const result = await db.query(
      "SELECT * FROM ai_resumes WHERE user_id = $1 AND job_id = $2",
      [userId, jobId],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Resume not found — generate it first" });
    }

    const resume = result.rows[0];
    const pdfBuffer = Buffer.from(resume.pdf_base64, "base64");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="resume-${jobId}.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (err) {
    console.error("[DocumentController] downloadResume error:", err.message);
    return res.status(500).json({ error: "Failed to download resume" });
  }
};

const downloadCoverLetter = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { jobId } = req.params;

    const result = await db.query(
      "SELECT * FROM cover_letters WHERE user_id = $1 AND job_id = $2",
      [userId, jobId],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Cover letter not found — generate it first" });
    }

    const coverLetter = result.rows[0];
    const pdfBuffer = Buffer.from(coverLetter.pdf_base64, "base64");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="cover-letter-${jobId}.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (err) {
    console.error(
      "[DocumentController] downloadCoverLetter error:",
      err.message,
    );
    return res.status(500).json({ error: "Failed to download cover letter" });
  }
};

module.exports = {
  generateResumeForJob,
  generateCoverLetterForJob,
  generateBoth,
  downloadResume,
  downloadCoverLetter,
};
