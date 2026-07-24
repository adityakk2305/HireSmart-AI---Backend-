export const AI_SCREENING_VERSION = "v1";

export const AI_SCORE_WEIGHTS = {
  skillsScore: 0.4,
  experienceScore: 0.25,
  educationScore: 0.1,
  projectScore: 0.15,
  preferredSkillsScore: 0.1
};

export const AI_CATEGORIES = {
  EXCELLENT: "Excellent Match",
  GOOD: "Good Match",
  AVERAGE: "Average Match",
  LOW: "Low Match",
  NOT_SUITABLE: "Not Suitable"
};

export const AI_CATEGORY_THRESHOLDS = [
  { min: 85, category: AI_CATEGORIES.EXCELLENT },
  { min: 70, category: AI_CATEGORIES.GOOD },
  { min: 50, category: AI_CATEGORIES.AVERAGE },
  { min: 30, category: AI_CATEGORIES.LOW },
  { min: 0, category: AI_CATEGORIES.NOT_SUITABLE }
];

const SKILL_ALIASES = new Map([
  ["nodejs", "node.js"],
  ["node js", "node.js"],
  ["node", "node.js"],
  ["reactjs", "react"],
  ["react.js", "react"],
  ["javascript", "javascript"],
  ["java script", "javascript"],
  ["mongodb", "mongodb"],
  ["mongo db", "mongodb"],
  ["expressjs", "express.js"],
  ["express", "express.js"],
  ["express js", "express.js"],
  ["nextjs", "next.js"],
  ["next js", "next.js"],
  ["postgresql", "postgresql"],
  ["postgre sql", "postgresql"],
  ["tailwindcss", "tailwind css"],
  ["tailwind", "tailwind css"]
]);

const safeArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
const text = (value) => String(value || "").trim();

export const clampScore = (score) => {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

export const normalizeSkill = (skill = "") => {
  const normalized = text(skill)
    .toLowerCase()
    .replace(/[._/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return SKILL_ALIASES.get(normalized) || normalized;
};

const pushEvidence = (map, skill, source, evidence) => {
  const normalized = normalizeSkill(skill);
  if (!normalized) return;

  if (!map.has(normalized)) {
    map.set(normalized, {
      normalized,
      display: text(skill),
      sources: new Set(),
      evidence: new Set()
    });
  }

  const item = map.get(normalized);
  if (source) item.sources.add(source);
  if (evidence) item.evidence.add(text(evidence).slice(0, 180));
};

const collectCandidateSkills = (parsedResume = {}) => {
  const map = new Map();

  safeArray(parsedResume.skills).forEach((skill) => pushEvidence(map, skill, "Skills", skill));
  safeArray(parsedResume.technicalSkills).forEach((skill) => pushEvidence(map, skill, "Skills", skill));

  safeArray(parsedResume.workExperience).forEach((entry) => {
    safeArray(entry.technologies).forEach((skill) => {
      pushEvidence(map, skill, "Work Experience", `${entry.jobTitle || "Role"} used ${skill}`);
    });
  });

  safeArray(parsedResume.projects).forEach((project) => {
    safeArray(project.technologies).forEach((skill) => {
      pushEvidence(map, skill, "Project", `${project.name || "Project"} used ${skill}`);
    });
  });

  safeArray(parsedResume.certifications).forEach((certification) => {
    pushEvidence(map, certification.name, "Certification", certification.name);
  });

  return map;
};

export const compareSkills = (jobSkills = [], parsedResume = {}) => {
  const candidateSkills = collectCandidateSkills(parsedResume);

  return safeArray(jobSkills).map((skill) => {
    const normalized = normalizeSkill(skill);
    const match = candidateSkills.get(normalized);

    return {
      skill: text(skill),
      matched: Boolean(match),
      matchedAs: match?.display || "",
      evidence: match ? Array.from(match.evidence).join("; ") : "",
      source: match ? Array.from(match.sources).join(", ") : ""
    };
  });
};

export const calculateRequiredSkillsScore = (requiredSkills = [], parsedResume = {}) => {
  const comparisons = compareSkills(requiredSkills, parsedResume);
  if (!comparisons.length) return { score: 100, comparisons, found: [], missing: [] };

  const found = comparisons.filter((item) => item.matched);
  const missing = comparisons.filter((item) => !item.matched);

  return {
    score: clampScore((found.length / comparisons.length) * 100),
    comparisons,
    found,
    missing
  };
};

export const calculatePreferredSkillsScore = (preferredSkills = [], parsedResume = {}) => {
  const comparisons = compareSkills(preferredSkills, parsedResume);
  if (!comparisons.length) return { score: 100, comparisons, found: [], missing: [] };

  const found = comparisons.filter((item) => item.matched);
  const missing = comparisons.filter((item) => !item.matched);

  return {
    score: clampScore((found.length / comparisons.length) * 100),
    comparisons,
    found,
    missing
  };
};

const parseYears = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const match = String(value).match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
};

export const calculateExperienceScore = (job = {}, parsedResume = {}, candidate = {}) => {
  const candidateExperience = parseYears(parsedResume.totalExperience) ?? parseYears(candidate.totalExperience);
  const requiredMinimum = Number(job.minimumExperience || 0);
  const requiredMaximum = Number(job.maximumExperience || 0);
  const evidence = safeArray(parsedResume.workExperience)
    .slice(0, 4)
    .map((entry) => [entry.jobTitle, entry.duration].filter(Boolean).join(" - "))
    .filter(Boolean);

  if (candidateExperience === null) {
    return {
      score: 45,
      candidateExperience: null,
      requiredMinimum,
      requiredMaximum,
      assessment: "Candidate experience is not clearly stated in the parsed resume.",
      evidence
    };
  }

  if (requiredMinimum === 0) {
    return {
      score: 100,
      candidateExperience,
      requiredMinimum,
      requiredMaximum,
      assessment: "Candidate experience is acceptable for a fresher or entry-level requirement.",
      evidence
    };
  }

  if (candidateExperience < requiredMinimum) {
    return {
      score: clampScore((candidateExperience / requiredMinimum) * 80),
      candidateExperience,
      requiredMinimum,
      requiredMaximum,
      assessment: "Candidate experience is below the stated minimum and needs recruiter review.",
      evidence
    };
  }

  return {
    score: requiredMaximum && candidateExperience > requiredMaximum ? 90 : 100,
    candidateExperience,
    requiredMinimum,
    requiredMaximum,
    assessment: "Candidate experience meets the stated requirement.",
    evidence
  };
};

const EDUCATION_ALIASES = [
  ["btech", ["btech", "b tech", "b.tech", "bachelor of technology", "be", "b e", "b.e"]],
  ["bsc", ["bsc", "b sc", "b.sc", "bachelor of science"]],
  ["mca", ["mca", "master of computer applications"]],
  ["msc", ["msc", "m sc", "m.sc", "master of science"]],
  ["diploma", ["diploma"]]
];

const normalizeEducation = (value = "") => text(value).toLowerCase().replace(/[._/-]+/g, " ").replace(/\s+/g, " ");

export const calculateEducationScore = (job = {}, parsedResume = {}) => {
  const requiredEducation = text(job.education);
  const candidateEducation = safeArray(parsedResume.education).map((entry) =>
    [entry.degree, entry.fieldOfStudy].filter(Boolean).join(" ")
  ).filter(Boolean);

  if (!requiredEducation) {
    return { score: 100, candidateEducation, requiredEducation, assessment: "No specific education requirement was stated.", evidence: [] };
  }

  if (!candidateEducation.length) {
    return { score: 45, candidateEducation, requiredEducation, assessment: "Education evidence is missing from the parsed resume.", evidence: [] };
  }

  const required = normalizeEducation(requiredEducation);
  const evidence = candidateEducation.filter((item) => {
    const normalized = normalizeEducation(item);
    if (required.includes(normalized) || normalized.includes(required)) return true;

    return EDUCATION_ALIASES.some(([, aliases]) =>
      aliases.some((alias) => required.includes(alias)) && aliases.some((alias) => normalized.includes(alias))
    );
  });

  return {
    score: evidence.length ? 100 : 60,
    candidateEducation,
    requiredEducation,
    assessment: evidence.length
      ? "Candidate education appears to match the stated requirement."
      : "Candidate education needs recruiter review against the stated requirement.",
    evidence
  };
};

export const calculateProjectScore = (job = {}, parsedResume = {}) => {
  const required = [...safeArray(job.requiredSkills), ...safeArray(job.preferredSkills)].map(normalizeSkill).filter(Boolean);
  const responsibilities = safeArray(job.responsibilities).join(" ").toLowerCase();
  const relevantProjects = safeArray(parsedResume.projects)
    .map((project) => {
      const technologies = safeArray(project.technologies);
      const matchedSkills = technologies.filter((skill) => required.includes(normalizeSkill(skill)));
      const description = `${project.name || ""} ${project.description || ""}`.toLowerCase();
      const responsibilityMatch = responsibilities && description
        ? safeArray(job.responsibilities).some((item) => description.includes(text(item).toLowerCase().split(" ")[0]))
        : false;

      if (!matchedSkills.length && !responsibilityMatch) return null;

      return {
        name: project.name || "Project",
        technologies,
        matchedSkills,
        evidence: project.description || technologies.join(", ")
      };
    })
    .filter(Boolean);

  const achievementEvidence = safeArray(parsedResume.achievements).map((item) => item.title || item.description).filter(Boolean);
  const score = relevantProjects.length ? Math.min(100, 65 + relevantProjects.length * 15) : achievementEvidence.length ? 55 : 35;

  return {
    score: clampScore(score),
    relevantProjects,
    assessment: relevantProjects.length
      ? "Parsed projects show evidence related to the job requirements."
      : "Parsed projects do not show strong direct evidence for the job requirements.",
    evidence: [...relevantProjects.map((project) => project.evidence).filter(Boolean), ...achievementEvidence.slice(0, 3)]
  };
};

export const calculateWeightedOverallScore = (scores = {}) =>
  clampScore(
    clampScore(scores.skillsScore) * AI_SCORE_WEIGHTS.skillsScore +
      clampScore(scores.experienceScore) * AI_SCORE_WEIGHTS.experienceScore +
      clampScore(scores.educationScore) * AI_SCORE_WEIGHTS.educationScore +
      clampScore(scores.projectScore) * AI_SCORE_WEIGHTS.projectScore +
      clampScore(scores.preferredSkillsScore) * AI_SCORE_WEIGHTS.preferredSkillsScore
  );

export const categorizeCandidate = (overallScore) =>
  AI_CATEGORY_THRESHOLDS.find((item) => clampScore(overallScore) >= item.min)?.category || AI_CATEGORIES.NOT_SUITABLE;

export const validateScoreBreakdown = (scores = {}) => ({
  skillsScore: clampScore(scores.skillsScore),
  experienceScore: clampScore(scores.experienceScore),
  educationScore: clampScore(scores.educationScore),
  projectScore: clampScore(scores.projectScore),
  preferredSkillsScore: clampScore(scores.preferredSkillsScore)
});

const additionalRelevantSkills = (job = {}, parsedResume = {}) => {
  const jobSkills = new Set([...safeArray(job.requiredSkills), ...safeArray(job.preferredSkills)].map(normalizeSkill));
  return [...safeArray(parsedResume.skills), ...safeArray(parsedResume.technicalSkills)]
    .filter((skill) => !jobSkills.has(normalizeSkill(skill)))
    .slice(0, 12);
};

export const scoreCandidateForJob = (job = {}, parsedResume = {}, candidate = {}) => {
  const required = calculateRequiredSkillsScore(job.requiredSkills, parsedResume);
  const preferred = calculatePreferredSkillsScore(job.preferredSkills, parsedResume);
  const experience = calculateExperienceScore(job, parsedResume, candidate);
  const education = calculateEducationScore(job, parsedResume);
  const project = calculateProjectScore(job, parsedResume);

  const scores = validateScoreBreakdown({
    skillsScore: required.score,
    experienceScore: experience.score,
    educationScore: education.score,
    projectScore: project.score,
    preferredSkillsScore: preferred.score
  });
  const overallScore = calculateWeightedOverallScore(scores);

  return {
    ...scores,
    overallScore,
    category: categorizeCandidate(overallScore),
    requiredSkillComparisons: required.comparisons,
    requiredSkillsFound: required.found,
    requiredSkillsMissing: required.missing,
    preferredSkillsFound: preferred.found,
    preferredSkillsMissing: preferred.missing,
    additionalRelevantSkills: additionalRelevantSkills(job, parsedResume),
    experienceAnalysis: experience,
    educationAnalysis: education,
    projectAnalysis: project
  };
};
