import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { resolveProviderConfig } from "../config/ai.js";
import { buildCandidateScreeningPrompt } from "../prompts/candidateScreeningPrompt.js";
import { buildResumeParsingPrompt } from "../prompts/resumeParsingPrompt.js";
import ApiError from "../utils/ApiError.js";
import { safelyParseJson, validateParsedJson } from "../utils/safeJsonParser.js";
import { validateAiEvaluation } from "../validations/aiEvaluationValidation.js";
import { parsedResumeSchema } from "../validations/resumeParsingValidation.js";
import { parseResumeWithBasicFallback } from "./basicResumeParserService.js";
import { categorizeCandidate, calculateWeightedOverallScore, validateScoreBreakdown } from "./candidateScoringService.js";

const withTimeout = async (promise, timeoutMs) => {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new ApiError(504, "AI provider timed out")), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
};

const parseWithGemini = async (text, config) => {
  const client = new GoogleGenerativeAI(config.geminiApiKey);
  const model = client.getGenerativeModel({
    model: config.geminiModel,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      maxOutputTokens: 4096
    }
  });
  const result = await withTimeout(model.generateContent(buildResumeParsingPrompt(text)), config.timeoutMs);
  const output = result.response.text();
  return validateParsedJson(parsedResumeSchema, safelyParseJson(output));
};

const parseWithOpenAI = async (text, config) => {
  const client = new OpenAI({ apiKey: config.openaiApiKey, timeout: config.timeoutMs, maxRetries: config.maxRetries });
  const result = await client.chat.completions.create({
    model: config.openaiModel,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You parse resumes into strict JSON and never invent missing details." },
      { role: "user", content: buildResumeParsingPrompt(text) }
    ]
  });
  const output = result.choices?.[0]?.message?.content || "";
  return validateParsedJson(parsedResumeSchema, safelyParseJson(output));
};

export const parseResumeWithAI = async (text) => {
  const config = resolveProviderConfig();

  if (config.provider === "mock") {
    return {
      parsedResume: validateParsedJson(parsedResumeSchema, parseResumeWithBasicFallback(text)),
      provider: "mock",
      model: "basic-fallback",
      fallbackUsed: Boolean(config.fallbackReason)
    };
  }

  try {
    const parsedResume = config.provider === "gemini"
      ? await parseWithGemini(text, config)
      : await parseWithOpenAI(text, config);

    return {
      parsedResume,
      provider: config.provider,
      model: config.provider === "gemini" ? config.geminiModel : config.openaiModel,
      fallbackUsed: false
    };
  } catch (error) {
    return {
      parsedResume: validateParsedJson(parsedResumeSchema, parseResumeWithBasicFallback(text)),
      provider: config.provider,
      model: config.provider === "gemini" ? config.geminiModel : config.openaiModel,
      fallbackUsed: true,
      safeWarning: error.statusCode ? error.message : "AI provider unavailable; fallback parser used"
    };
  }
};

const safeArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const backendControlledEvaluation = (evaluation, scoreData) => {
  const scores = validateScoreBreakdown(scoreData);
  const overallScore = calculateWeightedOverallScore(scores);

  return validateAiEvaluation({
    ...evaluation,
    ...scores,
    overallScore,
    category: categorizeCandidate(overallScore),
    requiredSkillsFound: scoreData.requiredSkillsFound,
    requiredSkillsMissing: scoreData.requiredSkillsMissing,
    preferredSkillsFound: scoreData.preferredSkillsFound,
    additionalRelevantSkills: scoreData.additionalRelevantSkills,
    experienceAnalysis: scoreData.experienceAnalysis,
    educationAnalysis: scoreData.educationAnalysis,
    projectAnalysis: scoreData.projectAnalysis
  });
};

const mockEvaluation = ({ job, parsedResume, scoreData }) => {
  const missingRequired = safeArray(scoreData.requiredSkillsMissing);
  const foundRequired = safeArray(scoreData.requiredSkillsFound);
  const strengths = [
    foundRequired.length ? `Shows evidence for ${foundRequired.length} required skill${foundRequired.length === 1 ? "" : "s"}.` : "",
    scoreData.experienceScore >= 80 ? scoreData.experienceAnalysis.assessment : "",
    scoreData.projectScore >= 65 ? "Projects show job-related technical evidence." : ""
  ].filter(Boolean);
  const weaknesses = [
    ...missingRequired.slice(0, 5).map((item) => `No clear resume evidence for required skill: ${item.skill}.`),
    scoreData.experienceScore < 60 ? scoreData.experienceAnalysis.assessment : "",
    scoreData.educationScore < 70 ? scoreData.educationAnalysis.assessment : ""
  ].filter(Boolean);
  const redFlags = [
    ...missingRequired.slice(0, 5).map((item) => `Required skill not found: ${item.skill}`),
    scoreData.experienceScore < 50 ? "Experience appears below the stated minimum and requires recruiter review." : ""
  ].filter(Boolean);

  return backendControlledEvaluation({
    strengths,
    weaknesses,
    skillGaps: missingRequired.map((item) => ({
      skill: item.skill,
      importance: "High",
      evidence: "No matching parsed resume evidence found.",
      recommendation: `Ask the candidate to clarify practical experience with ${item.skill}.`
    })),
    recommendation: scoreData.overallScore >= 70
      ? "Proceed with recruiter review and validate the strongest job-related evidence."
      : "Review carefully before shortlisting; required job evidence is incomplete.",
    interviewRecommendation: missingRequired.length
      ? `Focus the interview on ${missingRequired.slice(0, 3).map((item) => item.skill).join(", ")} and recent project depth.`
      : "Use the interview to verify depth of experience and project ownership.",
    summary: `Candidate was screened for ${job.title}. The evaluation is based on parsed resume evidence and job requirements only.`,
    redFlags,
    confidence: parsedResume ? 82 : 60,
    screeningNotes: ["Mock provider used deterministic job and resume evidence."]
  }, scoreData);
};

const sanitizedJob = (job = {}) => ({
  title: job.title,
  department: job.department,
  employmentType: job.employmentType,
  workMode: job.workMode,
  minimumExperience: job.minimumExperience,
  maximumExperience: job.maximumExperience,
  requiredSkills: job.requiredSkills,
  preferredSkills: job.preferredSkills,
  education: job.education,
  description: job.description,
  responsibilities: job.responsibilities
});

const sanitizedCandidate = (parsedResume = {}) => ({
  professionalSummary: parsedResume.professionalSummary,
  skills: parsedResume.skills,
  technicalSkills: parsedResume.technicalSkills,
  education: safeArray(parsedResume.education).map((item) => ({
    degree: item.degree,
    fieldOfStudy: item.fieldOfStudy,
    description: item.description
  })),
  workExperience: safeArray(parsedResume.workExperience).map((item) => ({
    jobTitle: item.jobTitle,
    duration: item.duration,
    responsibilities: item.responsibilities,
    achievements: item.achievements,
    technologies: item.technologies
  })),
  jobTitles: parsedResume.jobTitles,
  projects: parsedResume.projects,
  certifications: safeArray(parsedResume.certifications).map((item) => ({ name: item.name })),
  totalExperience: parsedResume.totalExperience,
  achievements: parsedResume.achievements
});

const evaluateWithGemini = async ({ job, parsedResume, scoreData }, config) => {
  const client = new GoogleGenerativeAI(config.geminiApiKey);
  const model = client.getGenerativeModel({
    model: config.geminiModel,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      maxOutputTokens: 4096
    }
  });
  const result = await withTimeout(
    model.generateContent(buildCandidateScreeningPrompt({
      job: sanitizedJob(job),
      candidate: sanitizedCandidate(parsedResume),
      scoreData
    })),
    config.timeoutMs
  );
  return validateAiEvaluation(safelyParseJson(result.response.text()));
};

const evaluateWithOpenAI = async ({ job, parsedResume, scoreData }, config) => {
  const client = new OpenAI({ apiKey: config.openaiApiKey, timeout: config.timeoutMs, maxRetries: config.maxRetries });
  const result = await client.chat.completions.create({
    model: config.openaiModel,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Return strict JSON for recruiter decision support. Use only supplied job-related evidence and do not infer protected attributes." },
      {
        role: "user",
        content: buildCandidateScreeningPrompt({
          job: sanitizedJob(job),
          candidate: sanitizedCandidate(parsedResume),
          scoreData
        })
      }
    ]
  });

  return validateAiEvaluation(safelyParseJson(result.choices?.[0]?.message?.content || ""));
};

export const evaluateCandidateWithAI = async ({ job, parsedResume, scoreData }) => {
  const config = resolveProviderConfig();

  if (config.provider === "mock") {
    return {
      evaluation: mockEvaluation({ job, parsedResume, scoreData }),
      provider: "mock",
      model: "deterministic-screening",
      fallbackUsed: Boolean(config.fallbackReason)
    };
  }

  try {
    const providerEvaluation = config.provider === "gemini"
      ? await evaluateWithGemini({ job, parsedResume, scoreData }, config)
      : await evaluateWithOpenAI({ job, parsedResume, scoreData }, config);

    return {
      evaluation: backendControlledEvaluation(providerEvaluation, scoreData),
      provider: config.provider,
      model: config.provider === "gemini" ? config.geminiModel : config.openaiModel,
      fallbackUsed: false
    };
  } catch (error) {
    if (config.provider === "mock") throw error;

    return {
      evaluation: mockEvaluation({ job, parsedResume, scoreData }),
      provider: config.provider,
      model: config.provider === "gemini" ? config.geminiModel : config.openaiModel,
      fallbackUsed: true,
      safeWarning: error.statusCode ? error.message : "AI provider unavailable; mock screening used"
    };
  }
};

const buildInterviewQuestionPrompt = ({ job, candidate, interviewType, interviewRound, count, difficulty, categories }) => `
Return strict JSON with a "questions" array for an HR-only interview guide.
Do not include candidate name, email, phone, address, recruiter notes, protected attributes, or personal identifiers.
Use only supplied job requirements and sanitized resume evidence.

Job:
${JSON.stringify(sanitizedJob(job), null, 2)}

Candidate evidence:
${JSON.stringify(sanitizedCandidate(candidate?.parsedResume || {}), null, 2)}

AI screening evidence:
${JSON.stringify({
  requiredSkillsMissing: candidate?.aiEvaluation?.requiredSkillsMissing || [],
  requiredSkillsFound: candidate?.aiEvaluation?.requiredSkillsFound || [],
  skillGaps: candidate?.aiEvaluation?.skillGaps || [],
  category: candidate?.aiEvaluation?.category
}, null, 2)}

Interview:
${JSON.stringify({ interviewType, interviewRound, count, difficulty, categories }, null, 2)}

Each question must include: question, category, difficulty, expectedAnswer, evaluationCriteria.
Allowed categories: Technical, Behavioral, Experience, Project, Problem Solving, System Design, HR, Culture Fit, Other.
Allowed difficulty: Easy, Medium, Hard.
`;

const normalizeInterviewQuestions = (value, fallbackDifficulty = "Medium") => {
  const rawQuestions = Array.isArray(value?.questions) ? value.questions : Array.isArray(value) ? value : [];
  return rawQuestions
    .filter((item) => item?.question)
    .slice(0, 20)
    .map((item) => ({
      question: String(item.question).trim().slice(0, 1000),
      category: ["Technical", "Behavioral", "Experience", "Project", "Problem Solving", "System Design", "HR", "Culture Fit", "Other"].includes(item.category)
        ? item.category
        : "Technical",
      difficulty: ["Easy", "Medium", "Hard"].includes(item.difficulty) ? item.difficulty : fallbackDifficulty,
      expectedAnswer: String(item.expectedAnswer || "").trim().slice(0, 3000),
      evaluationCriteria: String(item.evaluationCriteria || "").trim().slice(0, 3000)
    }))
    .filter((item) => item.question);
};

const mockInterviewQuestions = ({ job, candidate, interviewType, count, difficulty, categories }) => {
  const requiredSkills = safeArray(job.requiredSkills);
  const missingSkills = safeArray(candidate?.aiEvaluation?.requiredSkillsMissing).map((item) => item.skill || item);
  const projectNames = safeArray(candidate?.parsedResume?.projects).map((item) => item.name || item.title).filter(Boolean);
  const preferredCategories = categories?.length ? categories : ["Technical", "Experience", "Problem Solving", "Behavioral"];
  const templates = [
    {
      question: `Walk us through a recent project where you used ${requiredSkills[0] || "the primary role skills"}. What decisions did you own?`,
      category: "Project",
      expectedAnswer: "Looks for concrete ownership, tradeoffs, implementation detail and measurable outcomes.",
      evaluationCriteria: "Depth of ownership, clarity, relevance to job responsibilities and ability to explain tradeoffs."
    },
    {
      question: `How would you approach a production issue in a ${job.title} role when candidate impact is high and information is incomplete?`,
      category: "Problem Solving",
      expectedAnswer: "Should mention triage, observability, rollback/mitigation, communication and root-cause follow-up.",
      evaluationCriteria: "Structured thinking, prioritization, risk handling and communication."
    },
    {
      question: `Which ${requiredSkills.slice(0, 3).join(", ") || "required"} skill area is your strongest, and what evidence best demonstrates it?`,
      category: "Technical",
      expectedAnswer: "Candidate should cite specific work experience, projects or outcomes rather than broad claims.",
      evaluationCriteria: "Evidence quality, skill depth and alignment with required responsibilities."
    },
    {
      question: missingSkills.length
        ? `We did not see clear resume evidence for ${missingSkills.slice(0, 2).join(" and ")}. What practical experience do you have there?`
        : `Tell us about a technical area you had to learn quickly for a work project. How did you validate your progress?`,
      category: "Technical",
      expectedAnswer: "Looks for honest skill assessment, examples, learning approach and production-ready judgment.",
      evaluationCriteria: "Transparency, learning ability, practical experience and role fit."
    },
    {
      question: `Describe a time you disagreed with a stakeholder or teammate about implementation direction. How did you resolve it?`,
      category: "Behavioral",
      expectedAnswer: "Should show collaboration, evidence-based reasoning and professional conflict resolution.",
      evaluationCriteria: "Communication, maturity, collaboration and outcome."
    },
    {
      question: `If selected for ${job.title}, what would your first 30 days of ramp-up look like?`,
      category: "HR",
      expectedAnswer: "Should include learning plan, delivery focus, team communication and expectation alignment.",
      evaluationCriteria: "Role understanding, ownership mindset and practical onboarding plan."
    },
    {
      question: projectNames.length
        ? `Pick ${projectNames[0]} from your project experience. What would you improve if you rebuilt it today?`
        : `Pick one relevant project from your experience. What would you improve if you rebuilt it today?`,
      category: "Experience",
      expectedAnswer: "Looks for reflection, technical judgment and awareness of maintainability or scale.",
      evaluationCriteria: "Self-awareness, engineering judgment and practical improvement ideas."
    },
    {
      question: interviewType === "System Design"
        ? `Design a scalable workflow for one core responsibility in this role. Explain the main entities, failure modes and tradeoffs.`
        : `What questions do you have about the role, team workflow or success expectations?`,
      category: interviewType === "System Design" ? "System Design" : "Culture Fit",
      expectedAnswer: "Should reveal role curiosity, system thinking or alignment with team expectations.",
      evaluationCriteria: "Relevance, clarity, seniority signal and cultural alignment."
    }
  ];

  return templates
    .filter((item) => !categories?.length || preferredCategories.includes(item.category))
    .concat(templates)
    .slice(0, count)
    .map((item) => ({ ...item, difficulty }));
};

export const generateInterviewQuestionsWithAI = async ({ job, candidate, interviewType, interviewRound, count = 8, difficulty = "Medium", categories = [] }) => {
  const config = resolveProviderConfig();

  if (config.provider === "mock") {
    return {
      questions: mockInterviewQuestions({ job, candidate, interviewType, interviewRound, count, difficulty, categories }),
      provider: "mock",
      model: "mock-interview-questions",
      fallbackUsed: Boolean(config.fallbackReason)
    };
  }

  const prompt = buildInterviewQuestionPrompt({ job, candidate, interviewType, interviewRound, count, difficulty, categories });

  try {
    let parsed;
    if (config.provider === "gemini") {
      const client = new GoogleGenerativeAI(config.geminiApiKey);
      const model = client.getGenerativeModel({
        model: config.geminiModel,
        generationConfig: { temperature: 0.2, responseMimeType: "application/json", maxOutputTokens: 4096 }
      });
      const result = await withTimeout(model.generateContent(prompt), config.timeoutMs);
      parsed = safelyParseJson(result.response.text());
    } else {
      const client = new OpenAI({ apiKey: config.openaiApiKey, timeout: config.timeoutMs, maxRetries: config.maxRetries });
      const result = await client.chat.completions.create({
        model: config.openaiModel,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return strict JSON interview questions for HR review only. Do not include protected attributes." },
          { role: "user", content: prompt }
        ]
      });
      parsed = safelyParseJson(result.choices?.[0]?.message?.content || "");
    }

    const questions = normalizeInterviewQuestions(parsed, difficulty);
    if (!questions.length) throw new ApiError(502, "AI provider returned no valid interview questions");
    return {
      questions: questions.slice(0, count),
      provider: config.provider,
      model: config.provider === "gemini" ? config.geminiModel : config.openaiModel,
      fallbackUsed: false
    };
  } catch (error) {
    return {
      questions: mockInterviewQuestions({ job, candidate, interviewType, interviewRound, count, difficulty, categories }),
      provider: config.provider,
      model: config.provider === "gemini" ? config.geminiModel : config.openaiModel,
      fallbackUsed: true,
      safeWarning: error.statusCode ? error.message : "AI provider unavailable; mock interview questions used"
    };
  }
};

export const generateCandidateSummaryWithAI = async () => {
  throw new ApiError(501, "AI candidate summaries are not available yet");
};
