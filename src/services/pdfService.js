const PDFDocument = require("pdfkit");

const COLORS = {
  primary: "#000000",
  text: "#000000",
  lightText: "#444444",
  border: "#cccccc",
  accent: "#000000",
};

const FONTS = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
};

const MARGIN = 50;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const MAX_Y = PAGE_HEIGHT - 45; // hard bottom boundary

// Sections that never change size — always rendered fully at bottom
const FIXED_SECTIONS = ["EDUCATION", "REFERENCES", "AWARDS"];

// ── Section header ────────────────────────────────────────────────────────────
const drawSectionHeader = (doc, title, y) => {
  doc
    .font(FONTS.bold)
    .fontSize(10.5)
    .fillColor(COLORS.primary)
    .text(title, MARGIN, y);
  const lineY = y + 14;
  doc
    .moveTo(MARGIN, lineY)
    .lineTo(PAGE_WIDTH - MARGIN, lineY)
    .strokeColor(COLORS.border)
    .lineWidth(0.75)
    .stroke();
  return lineY + 6;
};

// ── Parse resume text ─────────────────────────────────────────────────────────
const parseResumeSections = (text) => {
  const lines = text.split("\n").map((l) => l.trim());
  const sections = [];
  let currentSection = null;
  let headerLines = [];
  let inHeader = true;

  for (const line of lines) {
    if (!line) continue;
    if (line.match(/^[A-Z][A-Z\s&/]{2,}$/) && line.length < 40) {
      inHeader = false;
      if (currentSection) sections.push(currentSection);
      currentSection = { title: line.trim(), lines: [] };
    } else if (inHeader) {
      headerLines.push(line);
    } else if (currentSection) {
      const isNewElement =
        line.startsWith("- ") ||
        line.startsWith("• ") ||
        line.match(/^[A-Z].*\d{4}/) || // title/date rows
        /^[A-Za-z][A-Za-z\s&]+:\s/.test(line); // skill lines

      const lastIdx = currentSection.lines.length - 1;
      const lastLine = currentSection.lines[lastIdx];
      const lastIsBullet =
        lastLine && (lastLine.startsWith("- ") || lastLine.startsWith("• "));

      // If this line isn't a new element and the previous line was a bullet,
      // append it to that bullet instead of adding a new line
      if (!isNewElement && lastIsBullet) {
        currentSection.lines[lastIdx] = lastLine + " " + line;
      } else {
        currentSection.lines.push(line);
      }
    }
  }
  if (currentSection) sections.push(currentSection);
  return { headerLines, sections };
};

// ── Estimate section height without rendering ─────────────────────────────────
const estimateSectionHeight = (section) => {
  let h = 22; // header height
  for (const line of section.lines) {
    if (!line.trim()) continue;
    const isSkillLine = /^[A-Za-z][A-Za-z\s&]+:\s/.test(line);
    if (line.startsWith("- ") || line.startsWith("• ")) {
      // Max 2 lines per bullet
      const chars = Math.min(line.length, 140);
      const lines = Math.min(Math.ceil(chars / 72), 2);
      h += lines * 12 + 3;
    } else if (isSkillLine) {
      h += 11;
    } else if (line.match(/\d{4}/)) {
      h += 15;
    } else {
      // Body text — max 2 lines
      const chars = Math.min(line.length, 140);
      const lines = Math.min(Math.ceil(chars / 72), 2);
      h += lines * 12 + 3;
    }
  }
  h += 5; // inter-section gap
  return h;
};

// ── Render a single line ──────────────────────────────────────────────────────
const renderLine = (doc, line) => {
  const isSkillLine = /^[A-Za-z][A-Za-z\s&]+:\s/.test(line);

  if (line.startsWith("- ") || line.startsWith("• ")) {
    // ── Bullet with hanging indent ────────────────────────────────────────────
    // Pass explicit y to both text() calls so PDFKit ignores doc.y state.
    // Bullet symbol at BX, text block at TX — both pinned to same rowY.
    // Wrapped lines stay within TX..TX+TW, giving clean hanging indent.
    const bulletBody = line.replace(/^[-•]\s*/, "");
    const BX = MARGIN + 6;
    const TX = MARGIN + 16; // ← was 14
    const TW = CONTENT_WIDTH - 16; // ← was 14
    const rowY = doc.y;

    doc
      .font(FONTS.regular)
      .fontSize(9.5)
      .fillColor(COLORS.text)
      .text("•", BX, rowY, { width: 8, lineBreak: false });

    doc
      .font(FONTS.regular)
      .fontSize(9.5)
      .fillColor(COLORS.text)
      .text(bulletBody, TX, rowY, { width: TW, lineGap: 1.5 });

    doc.y += 3;
  } else if (isSkillLine) {
    // ── Skill category line ─────────────────────────────────────────────────
    doc
      .font(FONTS.bold)
      .fontSize(9)
      .fillColor(COLORS.text)
      .text(line, MARGIN, doc.y, { width: CONTENT_WIDTH, lineGap: 0 });
    doc.y += 2;
  } else if (line.match(/\d{4}/)) {
    // ── Title / date row ────────────────────────────────────────────────────
    const dateMatch = line.match(
      /^(.*?)\s{2,}((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{4})[\d\s–\-A-Za-z]*)$/i,
    );

    if (dateMatch) {
      const leftPart = dateMatch[1].trim();
      const datePart = dateMatch[2].trim();
      const titleW = CONTENT_WIDTH * 0.68;
      const dateW = CONTENT_WIDTH * 0.32;
      const rowStartY = doc.y;

      doc
        .font(FONTS.bold)
        .fontSize(9.5)
        .fillColor(COLORS.text)
        .text(leftPart, MARGIN, rowStartY, {
          width: titleW - 8,
          lineBreak: true,
          lineGap: 1,
        });
      const afterLeftY = doc.y;

      doc
        .font(FONTS.bold)
        .fontSize(9.5)
        .fillColor(COLORS.text)
        .text(datePart, MARGIN + titleW, rowStartY, {
          width: dateW,
          align: "right",
        });

      doc.y = Math.max(afterLeftY, rowStartY + 13) + 2;
    } else {
      doc
        .font(FONTS.bold)
        .fontSize(9.5)
        .fillColor(COLORS.text)
        .text(line, MARGIN, doc.y, { width: CONTENT_WIDTH, lineGap: 1 });
      doc.y += 14;
    }
  } else {
    // ── Regular body text ────────────────────────────────────────────────────
    doc
      .font(FONTS.regular)
      .fontSize(9.5)
      .fillColor(COLORS.text)
      .text(line, MARGIN, doc.y, { width: CONTENT_WIDTH, lineGap: 1.5 });
    doc.y += 3;
  }
};

// ── Resume PDF ────────────────────────────────────────────────────────────────
const generateResumePDF = (content, user) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: MARGIN,
      size: "A4",
      autoFirstPage: true,
      bufferPages: true, // prevent auto page-add
    });
    const buffers = [];
    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("error", reject);

    const { headerLines, sections } = parseResumeSections(content);

    // Split sections
    const fixedSections = sections.filter((s) =>
      FIXED_SECTIONS.includes(s.title.toUpperCase()),
    );
    const dynamicSections = sections.filter(
      (s) => !FIXED_SECTIONS.includes(s.title.toUpperCase()),
    );

    // Estimate fixed height
    const fixedHeight = fixedSections.reduce(
      (sum, s) => sum + estimateSectionHeight(s),
      0,
    );
    const headerHeight = 80;
    const topMargin = MARGIN;
    const bottomMargin = 45;
    const totalUsable = PAGE_HEIGHT - topMargin - bottomMargin;
    const dynamicBudget = totalUsable - headerHeight - fixedHeight;

    // ── Name ─────────────────────────────────────────────────────────────────
    const name = user.full_name || headerLines[0] || "Candidate";
    doc
      .font(FONTS.bold)
      .fontSize(22)
      .fillColor(COLORS.accent)
      .text(name, MARGIN, MARGIN, { align: "center", width: CONTENT_WIDTH });

    // ── Contact ───────────────────────────────────────────────────────────────
    const contactParts = [
      user.location,
      user.email,
      user.phone,
      user.linkedin_url,
      user.github_url,
      user.portfolio_url,
    ].filter(Boolean);
    doc
      .font(FONTS.regular)
      .fontSize(8.5)
      .fillColor(COLORS.lightText)
      .text(contactParts.join("  |  "), MARGIN, doc.y + 4, {
        align: "center",
        width: CONTENT_WIDTH,
      });

    // ── Divider ───────────────────────────────────────────────────────────────
    const divY = doc.y + 6;
    doc
      .moveTo(MARGIN, divY)
      .lineTo(PAGE_WIDTH - MARGIN, divY)
      .strokeColor(COLORS.border)
      .lineWidth(0.75)
      .stroke();
    doc.y = divY + 10;

    // ── Dynamic sections ──────────────────────────────────────────────────────
    const dynamicStartY = doc.y;

    for (const section of dynamicSections) {
      // Stop if we'd overflow into the fixed section space
      if (doc.y + 22 > MAX_Y - fixedHeight) break;
      doc.y = drawSectionHeader(doc, section.title, doc.y);
      for (const line of section.lines) {
        if (!line.trim()) continue;
        if (doc.y + 12 > MAX_Y - fixedHeight) break;
        renderLine(doc, line);
      }
      doc.y += 5;
    }

    const dynamicEndY = doc.y;
    const dynamicUsed = dynamicEndY - dynamicStartY;
    const dynamicFillRatio = Math.min(dynamicUsed / dynamicBudget, 1.5);

    // ── Fixed sections — always rendered fully ────────────────────────────────
    for (const section of fixedSections) {
      doc.y = drawSectionHeader(doc, section.title, doc.y);
      for (const line of section.lines) {
        if (!line.trim()) continue;
        renderLine(doc, line);
      }
      doc.y += 5;
    }

    // ── Fill ratio ────────────────────────────────────────────────────────────
    const finalY = doc.y;
    const usedTotal = finalY - MARGIN;
    const fillRatio = Math.min(usedTotal / totalUsable, 1.5);

    doc.on("end", () => {
      resolve({
        buffer: Buffer.concat(buffers),
        fillRatio,
        dynamicFillRatio,
        dynamicBudget,
        dynamicUsed,
      });
    });

    doc.end();
  });
};

// ── Strip AI sign-off from cover letter ───────────────────────────────────────
const stripSignature = (text) =>
  text
    .replace(
      /\n*(sincerely|best regards|yours sincerely|warm regards)[^\n]*/gi,
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// ── Cover letter PDF ──────────────────────────────────────────────────────────
const generateCoverLetterPDF = (content, user, job) => {
  return new Promise((resolve, reject) => {
    const LM = 70;
    const RM = 70;
    const doc = new PDFDocument({ margin: LM, size: "A4" });
    const buffers = [];
    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("error", reject);

    const CW = doc.page.width - LM - RM;

    doc
      .font("Helvetica-Bold")
      .fontSize(26)
      .fillColor("#000000")
      .text(user.full_name || "Candidate", LM, 60, { width: CW });

    const divY = doc.y + 6;
    doc
      .moveTo(LM, divY)
      .lineTo(doc.page.width - RM, divY)
      .strokeColor("#cccccc")
      .lineWidth(0.75)
      .stroke();

    let y = divY + 18;
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor("#888888")
      .text("FROM", LM, y, { width: CW, characterSpacing: 1 });
    y += 13;

    const fromParts = [
      user.email,
      user.phone,
      user.location,
      user.linkedin_url,
    ].filter(Boolean);
    for (const part of fromParts) {
      doc
        .font("Helvetica")
        .fontSize(9.5)
        .fillColor("#000000")
        .text(part, LM, y, { width: CW });
      y += 13;
    }

    y += 8;
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor("#888888")
      .text("TO", LM, y, { width: CW, characterSpacing: 1 });
    y += 13;
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor("#000000")
      .text("Hiring Manager", LM, y, { width: CW });
    y += 13;
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor("#000000")
      .text(job.company || "", LM, y, { width: CW });
    y += 13;

    y += 8;
    const date = new Date().toLocaleDateString("en-CA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor("#444444")
      .text(date, LM, y, { width: CW });
    y += 24;

    doc
      .moveTo(LM, y)
      .lineTo(doc.page.width - RM, y)
      .strokeColor("#cccccc")
      .lineWidth(0.75)
      .stroke();
    y += 20;

    const paragraphs = stripSignature(content)
      .split("\n\n")
      .filter((p) => p.trim());
    for (const para of paragraphs) {
      doc
        .font("Helvetica")
        .fontSize(10.5)
        .fillColor("#000000")
        .text(para.trim(), LM, y, { width: CW, lineGap: 3, align: "left" });
      y = doc.y + 14;
    }

    y += 4;
    doc
      .font("Helvetica")
      .fontSize(10.5)
      .fillColor("#000000")
      .text("Sincerely,", LM, y, { width: CW });
    y = doc.y + 6;
    doc
      .font("Helvetica-Bold")
      .fontSize(10.5)
      .fillColor("#000000")
      .text(user.full_name || "Candidate", LM, y, { width: CW });

    const finalY = doc.y;
    doc.on("end", () => {
      const fillRatio = Math.min(finalY / (PAGE_HEIGHT - 60), 1.5);
      resolve({ buffer: Buffer.concat(buffers), fillRatio });
    });

    doc.end();
  });
};

module.exports = { generateResumePDF, generateCoverLetterPDF };
