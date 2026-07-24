import { z } from "zod";
import { AI_CATEGORIES } from "../services/candidateScoringService.js";

const score = z.coerce.number().min(0).max(100).transform((value) => Math.round(value));
const safeString = z.string().trim().max(2000).catch("");
const safeStringArray = z.array(z.string().trim().max(500)).catch([]).default([]);

const skillMatchSchema = z.object({
  skill: safeString,
  matched: z.boolean().catch(false).default(false),
  matchedAs: safeString.default(""),
  evidence: safeString.default(""),
  source: safeString.default("")
}).catchall(z.never());

const skillGapSchema = z.object({
  skill: safeString,
  importance: z.enum(["High", "Medium", "Low"]).catch("Medium").default("Medium"),
  evidence: safeString.default(""),
  recommendation: safeString.default("")
}).catchall(z.never());

const experienceAnalysisSchema = z.object({
  score: score.default(0),
  candidateExperience: z.union([z.number(), z.null()]).catch(null).default(null),
  requiredMinimum: z.union([z.number(), z.null()]).catch(null).default(null),
  requiredMaximum: z.union([z.number(), z.null()]).catch(null).default(null),
  assessment: safeString.default(""),
  evidence: safeStringArray.default([])
}).catchall(z.never());

const educationAnalysisSchema = z.object({
  score: score.default(0),
  candidateEducation: safeStringArray.default([]),
  requiredEducation: safeString.default(""),
  assessment: safeString.default(""),
  evidence: safeStringArray.default([])
}).catchall(z.never());

const projectAnalysisSchema = z.object({
  score: score.default(0),
  relevantProjects: z.array(z.object({
    name: safeString.default(""),
    technologies: safeStringArray.default([]),
    matchedSkills: safeStringArray.default([]),
    evidence: safeString.default("")
  }).catchall(z.never())).catch([]).default([]),
  assessment: safeString.default(""),
  evidence: safeStringArray.default([])
}).catchall(z.never());

export const aiEvaluationSchema = z.object({
  overallScore: score.default(0),
  skillsScore: score.default(0),
  experienceScore: score.default(0),
  educationScore: score.default(0),
  projectScore: score.default(0),
  preferredSkillsScore: score.default(0),
  requiredSkillsFound: z.array(skillMatchSchema).catch([]).default([]),
  requiredSkillsMissing: z.array(skillMatchSchema).catch([]).default([]),
  preferredSkillsFound: z.array(skillMatchSchema).catch([]).default([]),
  additionalRelevantSkills: safeStringArray.default([]),
  strengths: safeStringArray.default([]),
  weaknesses: safeStringArray.default([]),
  skillGaps: z.array(skillGapSchema).catch([]).default([]),
  experienceAnalysis: experienceAnalysisSchema.default({}),
  educationAnalysis: educationAnalysisSchema.default({}),
  projectAnalysis: projectAnalysisSchema.default({}),
  recommendation: safeString.default(""),
  interviewRecommendation: safeString.default(""),
  summary: safeString.default(""),
  redFlags: safeStringArray.default([]),
  category: z.enum(Object.values(AI_CATEGORIES)).catch(AI_CATEGORIES.NOT_SUITABLE).default(AI_CATEGORIES.NOT_SUITABLE),
  confidence: score.default(70),
  screeningNotes: safeStringArray.default([])
}).strict();

export const validateAiEvaluation = (value) => aiEvaluationSchema.parse(value);
