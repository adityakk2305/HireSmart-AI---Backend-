export const buildCandidateScreeningPrompt = ({ job, candidate, scoreData }) => `Return valid JSON only. Do not include markdown.

Evaluate this candidate only for job-related qualifications. Use only the supplied evidence. Do not infer gender, age, religion, caste, nationality, marital status, disability, sexual orientation, political views, family information, or any other protected attribute. Do not use name, location, college, language, photo, or resume formatting as a proxy. Do not automatically select or reject the candidate.

The backend already calculated all numeric scores. Do not change these scores:
${JSON.stringify({
  overallScore: scoreData.overallScore,
  skillsScore: scoreData.skillsScore,
  experienceScore: scoreData.experienceScore,
  educationScore: scoreData.educationScore,
  projectScore: scoreData.projectScore,
  preferredSkillsScore: scoreData.preferredSkillsScore,
  category: scoreData.category
})}

Return this JSON shape:
{
  "overallScore": 0,
  "skillsScore": 0,
  "experienceScore": 0,
  "educationScore": 0,
  "projectScore": 0,
  "preferredSkillsScore": 0,
  "requiredSkillsFound": [],
  "requiredSkillsMissing": [],
  "preferredSkillsFound": [],
  "additionalRelevantSkills": [],
  "strengths": [],
  "weaknesses": [],
  "skillGaps": [{ "skill": "", "importance": "High", "evidence": "", "recommendation": "" }],
  "experienceAnalysis": { "candidateExperience": null, "requiredMinimum": null, "requiredMaximum": null, "assessment": "", "evidence": [] },
  "educationAnalysis": { "candidateEducation": [], "requiredEducation": "", "assessment": "", "evidence": [] },
  "projectAnalysis": { "relevantProjects": [], "assessment": "", "evidence": [] },
  "recommendation": "",
  "interviewRecommendation": "",
  "summary": "",
  "redFlags": [],
  "category": "",
  "confidence": 0,
  "screeningNotes": []
}

Job:
${JSON.stringify(job)}

Anonymized candidate evidence:
${JSON.stringify(candidate)}

Deterministic evidence and score data:
${JSON.stringify(scoreData)}
`;
