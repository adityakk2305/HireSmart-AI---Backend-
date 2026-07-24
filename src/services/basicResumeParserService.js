import { emptyParsedResume } from "../validations/resumeParsingValidation.js";

const knownTechnicalSkills = [
  "JavaScript",
  "TypeScript",
  "React",
  "Redux",
  "Node.js",
  "Express",
  "MongoDB",
  "Mongoose",
  "HTML",
  "CSS",
  "Tailwind",
  "Python",
  "Java",
  "SQL",
  "PostgreSQL",
  "MySQL",
  "AWS",
  "Docker",
  "Git",
  "REST",
  "GraphQL",
  "Next.js",
  "Vite"
];

const knownSoftSkills = ["Communication", "Leadership", "Teamwork", "Problem Solving", "Collaboration", "Ownership"];

const headingWords = new Set([
  "resume",
  "curriculum vitae",
  "profile",
  "summary",
  "experience",
  "education",
  "skills",
  "projects",
  "certifications"
]);

const unique = (items = []) => {
  const seen = new Set();
  return items.filter((item) => {
    const normalized = String(item || "").trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const extractEmail = (text = "") => text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null;

export const extractPhone = (text = "") => {
  const match = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  return match ? match[0].replace(/\s+/g, " ").trim() : null;
};

export const extractLinkedIn = (text = "") => text.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+/i)?.[0] || null;

export const extractGitHub = (text = "") => text.match(/https?:\/\/(?:www\.)?github\.com\/[^\s)]+/i)?.[0] || null;

export const extractPortfolio = (text = "") => {
  const urls = text.match(/https?:\/\/[^\s)]+/gi) || [];
  return urls.find((url) => !/linkedin\.com|github\.com/i.test(url)) || null;
};

export const extractLikelyName = (text = "") => {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);

  return lines.find((line) => {
    const words = line.split(/\s+/);
    return (
      words.length >= 2 &&
      words.length <= 4 &&
      line.length <= 80 &&
      /^[A-Za-z][A-Za-z\s.'-]+$/.test(line) &&
      !headingWords.has(line.toLowerCase())
    );
  }) || null;
};

export const extractSkillsFromKnownDictionary = (text = "") => {
  const technicalSkills = knownTechnicalSkills.filter((skill) => new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
  const softSkills = knownSoftSkills.filter((skill) => new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
  return {
    technicalSkills: unique(technicalSkills),
    softSkills: unique(softSkills),
    skills: unique([...technicalSkills, ...softSkills])
  };
};

const extractSectionLines = (text, headingRegex) => {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const start = lines.findIndex((line) => headingRegex.test(line));
  if (start === -1) return [];

  const result = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^(experience|education|skills|projects|certifications|achievements|languages)$/i.test(lines[index])) break;
    result.push(lines[index]);
  }
  return result.slice(0, 8);
};

export const extractEducationSections = (text = "") =>
  extractSectionLines(text, /^education$/i)
    .filter((line) => /university|college|school|bachelor|master|b\.?tech|m\.?tech|degree|diploma/i.test(line))
    .slice(0, 4)
    .map((line) => ({
      institution: line,
      degree: null,
      fieldOfStudy: null,
      startDate: null,
      endDate: null,
      grade: null,
      location: null,
      description: null
    }));

export const extractExperienceSections = (text = "") =>
  extractSectionLines(text, /^(experience|work experience|employment)$/i)
    .filter((line) => line.length > 6)
    .slice(0, 5)
    .map((line) => ({
      company: null,
      jobTitle: line,
      location: null,
      startDate: null,
      endDate: null,
      isCurrent: null,
      duration: null,
      responsibilities: [],
      achievements: [],
      technologies: []
    }));

export const extractProjectSections = (text = "") =>
  extractSectionLines(text, /^projects$/i)
    .filter((line) => line.length > 4)
    .slice(0, 5)
    .map((line) => ({
      name: line,
      description: null,
      role: null,
      technologies: [],
      startDate: null,
      endDate: null,
      url: null,
      achievements: []
    }));

export const extractCertificationSections = (text = "") =>
  extractSectionLines(text, /^certifications$/i)
    .filter((line) => line.length > 4)
    .slice(0, 5)
    .map((line) => ({
      name: line,
      issuer: null,
      issueDate: null,
      expiryDate: null,
      credentialId: null,
      credentialUrl: null
    }));

export const parseResumeWithBasicFallback = (text = "") => {
  const skills = extractSkillsFromKnownDictionary(text);
  return {
    ...emptyParsedResume,
    fullName: extractLikelyName(text),
    email: extractEmail(text),
    phone: extractPhone(text),
    skills: skills.skills,
    technicalSkills: skills.technicalSkills,
    softSkills: skills.softSkills,
    education: extractEducationSections(text),
    workExperience: extractExperienceSections(text),
    projects: extractProjectSections(text),
    certifications: extractCertificationSections(text),
    linkedin: extractLinkedIn(text),
    github: extractGitHub(text),
    portfolio: extractPortfolio(text)
  };
};
