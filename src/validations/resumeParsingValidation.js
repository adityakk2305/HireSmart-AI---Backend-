import { z } from "zod";

const nullableString = z.string().trim().min(1).nullable().default(null);
const stringArray = z.array(z.string().trim().min(1)).default([]);

const educationEntrySchema = z.object({
  institution: nullableString,
  degree: nullableString,
  fieldOfStudy: nullableString,
  startDate: nullableString,
  endDate: nullableString,
  grade: nullableString,
  location: nullableString,
  description: nullableString
}).strict();

const workExperienceEntrySchema = z.object({
  company: nullableString,
  jobTitle: nullableString,
  location: nullableString,
  startDate: nullableString,
  endDate: nullableString,
  isCurrent: z.boolean().nullable().default(null),
  duration: nullableString,
  responsibilities: stringArray,
  achievements: stringArray,
  technologies: stringArray
}).strict();

const projectEntrySchema = z.object({
  name: nullableString,
  description: nullableString,
  role: nullableString,
  technologies: stringArray,
  startDate: nullableString,
  endDate: nullableString,
  url: nullableString,
  achievements: stringArray
}).strict();

const certificationEntrySchema = z.object({
  name: nullableString,
  issuer: nullableString,
  issueDate: nullableString,
  expiryDate: nullableString,
  credentialId: nullableString,
  credentialUrl: nullableString
}).strict();

const achievementEntrySchema = z.object({
  title: nullableString,
  description: nullableString,
  date: nullableString
}).strict();

export const parsedResumeSchema = z.object({
  fullName: nullableString,
  email: nullableString,
  phone: nullableString,
  location: nullableString,
  professionalSummary: nullableString,
  skills: stringArray,
  technicalSkills: stringArray,
  softSkills: stringArray,
  education: z.array(educationEntrySchema).default([]),
  workExperience: z.array(workExperienceEntrySchema).default([]),
  jobTitles: stringArray,
  companies: stringArray,
  employmentDates: stringArray,
  projects: z.array(projectEntrySchema).default([]),
  certifications: z.array(certificationEntrySchema).default([]),
  languages: stringArray,
  totalExperience: z.union([z.number().min(0), z.string().trim().min(1), z.null()]).default(null),
  linkedin: nullableString,
  github: nullableString,
  portfolio: nullableString,
  achievements: z.array(achievementEntrySchema).default([])
}).strict();

export const emptyParsedResume = {
  fullName: null,
  email: null,
  phone: null,
  location: null,
  professionalSummary: null,
  skills: [],
  technicalSkills: [],
  softSkills: [],
  education: [],
  workExperience: [],
  jobTitles: [],
  companies: [],
  employmentDates: [],
  projects: [],
  certifications: [],
  languages: [],
  totalExperience: null,
  linkedin: null,
  github: null,
  portfolio: null,
  achievements: []
};
