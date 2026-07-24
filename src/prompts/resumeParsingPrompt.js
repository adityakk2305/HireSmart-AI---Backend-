export const buildResumeParsingPrompt = (resumeText) => `
Parse only the resume text below into valid JSON matching the requested schema.

Rules:
- Use only information explicitly present in the resume.
- Do not infer gender, age, religion, caste, nationality, marital status, disability, or any protected attribute.
- Do not invent missing companies, degrees, dates, projects, achievements, skills, or contact details.
- Missing scalar fields must be null.
- Missing array fields must be empty arrays.
- Preserve names and organization names as written.
- Deduplicate skills case-insensitively.
- Separate technicalSkills and softSkills when explicitly supported by the text.
- Preserve work experience and education order from the resume.
- Use date strings only when explicitly available.
- Do not calculate candidate-job match score.
- Return JSON only. Do not include markdown or explanation.

JSON shape:
{
  "fullName": null,
  "email": null,
  "phone": null,
  "location": null,
  "professionalSummary": null,
  "skills": [],
  "technicalSkills": [],
  "softSkills": [],
  "education": [],
  "workExperience": [],
  "jobTitles": [],
  "companies": [],
  "employmentDates": [],
  "projects": [],
  "certifications": [],
  "languages": [],
  "totalExperience": null,
  "linkedin": null,
  "github": null,
  "portfolio": null,
  "achievements": []
}

Resume text:
${resumeText}
`;
