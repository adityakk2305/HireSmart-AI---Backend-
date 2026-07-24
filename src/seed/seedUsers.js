import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { connectDB, closeDB } from "../config/db.js";
import AuditLog from "../models/AuditLog.js";
import Candidate from "../models/Candidate.js";
import Company from "../models/Company.js";
import EmailLog from "../models/EmailLog.js";
import Interview from "../models/Interview.js";
import Job from "../models/Job.js";
import User from "../models/User.js";
import { getResumeAccessPath } from "../services/fileStorageService.js";
import { seedDefaultEmailTemplatesForCompany } from "../services/emailTemplateService.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resumesRoot = path.resolve(__dirname, "../../uploads/resumes");

const credentials = [
  {
    name: "HireSmart Admin",
    email: "admin@hiresmart.com",
    password: "Admin@12345",
    role: "admin"
  },
  {
    name: "HireSmart HR",
    email: "hr@hiresmart.com",
    password: "Hr@12345",
    role: "hr",
    phone: "+919876543210"
  },
  {
    name: "Priya Interviewer",
    email: "interviewer.one@hiresmart.com",
    password: "Hr@12345",
    role: "hr",
    phone: "+919876543211"
  },
  {
    name: "Rahul Interviewer",
    email: "interviewer.two@hiresmart.com",
    password: "Hr@12345",
    role: "hr",
    phone: "+919876543212"
  },
  {
    name: "Phase Eleven Suspended HR",
    email: "suspended.hr@hiresmart.com",
    password: "Hr@12345",
    role: "hr",
    phone: "+919876543213"
  }
];

const resumeFixtures = [
  {
    fileName: "candidate-092d451f-d2eb-4792-b650-7f2ccb972cf1-1784060617621.pdf",
    originalName: "linus-torvalds-resume.pdf",
    mimeType: "application/pdf"
  },
  {
    fileName: "candidate-a1883a98-5c99-4677-91c3-70e220bd14ce-1784060701354.docx",
    originalName: "margaret-hamilton-resume.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  },
  {
    fileName: "candidate-e4bf7eaa-7abf-4bda-aed5-2281bcd32ab5-1784060749799.pdf",
    originalName: "katherine-johnson-resume.pdf",
    mimeType: "application/pdf"
  }
];

const plusDays = (days, hours, minutes = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hours, minutes, 0, 0);
  return date;
};

const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60 * 1000);

const scheduledDateFor = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const getResumeMetadata = (index) => {
  const fixture = resumeFixtures[index % resumeFixtures.length];
  const absolutePath = path.join(resumesRoot, fixture.fileName);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing resume fixture on disk: ${absolutePath}`);
  }

  const stats = fs.statSync(absolutePath);
  return {
    resumeStoragePath: fixture.fileName,
    resumeOriginalName: fixture.originalName,
    resumeStoredName: fixture.fileName,
    resumeMimeType: fixture.mimeType,
    resumeSize: stats.size
  };
};

const upsertUser = async (userData) => {
  const existingUser = await User.findOne({ email: userData.email });

  if (existingUser) {
    existingUser.name = userData.name;
    existingUser.role = userData.role;
    existingUser.phone = userData.phone || "";
    existingUser.isActive = true;
    existingUser.accountStatus = "Active";
    existingUser.statusReason = "";
    if (userData.email === "admin@hiresmart.com") {
      existingUser.password = userData.password;
    }
    await existingUser.save();
    console.log(`Updated development user: ${userData.email}`);
    return existingUser;
  }

  const user = await User.create(userData);
  console.log(`Created development ${userData.role} user: ${userData.email}`);
  return user;
};

const ensureCompany = async (hrUser) => {
  let company = await Company.findOne({ createdBy: hrUser._id });

  if (!company) {
    company = await Company.findOne({ slug: "hiresmart-demo" });
  }

  if (!company) {
    company = await Company.create({
      name: "HireSmart Demo Pvt Ltd",
      slug: "hiresmart-demo",
      website: "https://hiresmart.example.com",
      industry: "Software",
      size: "51-200",
      address: "MG Road",
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
      postalCode: "560001",
      description: "Development company for validating HireSmart AI workflows.",
      contactEmail: "hr@hiresmart.com",
      contactPhone: "+919876543210",
      createdBy: hrUser._id,
      isActive: true,
      accountStatus: "Active"
    });
    console.log("Created development company: HireSmart Demo Pvt Ltd");
  } else {
    company.set({
      name: "HireSmart Demo Pvt Ltd",
      slug: "hiresmart-demo",
      website: "https://hiresmart.example.com",
      industry: "Software",
      size: "51-200",
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
      contactEmail: "hr@hiresmart.com",
      contactPhone: "+919876543210",
      isActive: true,
      accountStatus: "Active",
      statusReason: ""
    });
    await company.save();
    console.log("Updated development company: HireSmart Demo Pvt Ltd");
  }

  return company;
};

const ensureSuspendedCompany = async (hrUser) => {
  let company = await Company.findOne({ slug: "hiresmart-suspended-demo" });

  const data = {
    name: "HireSmart Suspended Demo Ltd",
    slug: "hiresmart-suspended-demo",
    website: "https://suspended.example.com",
    industry: "Software",
    size: "11-50",
    city: "Pune",
    state: "Maharashtra",
    country: "India",
    description: "Development company for admin suspension workflows.",
    contactEmail: "suspended.hr@hiresmart.com",
    createdBy: hrUser._id,
    isActive: false,
    accountStatus: "Suspended",
    statusReason: "Seeded suspended company for Phase 11 admin testing.",
    statusChangedAt: new Date()
  };

  if (!company) {
    company = await Company.create(data);
    console.log("Created suspended development company");
  } else {
    company.set(data);
    await company.save();
    console.log("Updated suspended development company");
  }

  hrUser.companyId = company._id;
  hrUser.isActive = false;
  hrUser.accountStatus = "Suspended";
  hrUser.statusReason = "Seeded suspended HR user for Phase 11 admin testing.";
  hrUser.statusChangedAt = hrUser.statusChangedAt || new Date();
  await hrUser.save({ validateBeforeSave: false });
  return company;
};

const ensureJob = async (company, hrUser) => {
  const deadline = plusDays(45, 18);
  let job = await Job.findOne({ companyId: company._id, title: "MERN Stack Developer" });

  const data = {
    companyId: company._id,
    createdBy: hrUser._id,
    title: "MERN Stack Developer",
    department: "Engineering",
    employmentType: "Full-time",
    workMode: "Hybrid",
    location: "Bengaluru, India",
    minimumExperience: 3,
    maximumExperience: 8,
    requiredSkills: ["React", "Node.js", "Express", "MongoDB", "REST APIs"],
    preferredSkills: ["Redux Toolkit", "Tailwind CSS", "AI integrations", "AWS"],
    education: "Bachelor's degree in Computer Science or equivalent practical experience.",
    description:
      "Build and maintain full-stack hiring workflows, candidate screening tools, interview scheduling features, and analytics dashboards for a modern HR platform.",
    responsibilities: [
      "Develop production-ready MERN features across frontend and backend.",
      "Integrate AI-assisted resume screening and interview workflows.",
      "Write maintainable APIs, validations, and automated tests.",
      "Collaborate with HR users to improve recruiting operations."
    ],
    salaryMin: 1200000,
    salaryMax: 2200000,
    salaryCurrency: "INR",
    salaryPeriod: "Yearly",
    openings: 3,
    deadline,
    status: "Active",
    publicApplicationSlug: "mern-stack-developer-demo",
    publishedAt: new Date(),
    screeningQuestions: [
      {
        key: "notice-period",
        question: "What is your current notice period?",
        type: "select",
        required: true,
        options: ["Immediate", "15 days", "30 days", "60 days", "90 days"],
        order: 1
      }
    ]
  };

  if (!job) {
    job = await Job.create(data);
    console.log("Created development job: MERN Stack Developer");
    return job;
  }

  job.set(data);
  await job.save();
  console.log("Updated development job: MERN Stack Developer");
  return job;
};

const ensureCandidate = async ({ company, job, hrUser, index, applicationId, fullName, email, status, parsedResume }) => {
  let candidate = await Candidate.findOne({ applicationId });
  const resumeMetadata = getResumeMetadata(index);

  const data = {
    applicationId,
    jobId: job._id,
    companyId: company._id,
    fullName,
    email,
    phone: `+91990000000${index + 1}`,
    location: "Bengaluru, India",
    totalExperience: 4 + index,
    currentCompany: index === 0 ? "Kernel Labs" : index === 1 ? "Apollo Systems" : "Orbital Analytics",
    currentDesignation: index === 0 ? "Senior Full Stack Engineer" : index === 1 ? "Engineering Lead" : "Software Engineer",
    expectedSalary: 1800000 + index * 150000,
    noticePeriod: index === 0 ? "30 days" : "Immediate",
    linkedinUrl: "https://www.linkedin.com/in/demo-candidate",
    githubUrl: "https://github.com/demo-candidate",
    portfolioUrl: "https://portfolio.example.com",
    coverLetter: "Seeded candidate for local interview workflow validation.",
    ...resumeMetadata,
    extractedResumeText:
      "Experienced MERN stack developer with React, Node.js, Express, MongoDB, API design, testing, and production delivery experience.",
    parsedResume,
    resumeParseStatus: "Parsed",
    resumeParseError: null,
    resumeParsedAt: new Date(),
    resumeParsedBy: hrUser._id,
    resumeParserVersion: "v1",
    resumeTextLength: 140,
    resumeParseAttempts: 1,
    resumeParserProvider: "mock",
    resumeParserModel: "mock",
    source: "HR Upload",
    status,
    aiEvaluation: {
      overallScore: 84 - index * 4,
      category: index === 0 ? "Excellent Match" : "Good Match",
      summary: "Seeded mock AI evaluation for local interview testing.",
      skillsMatch: { score: 86 - index * 4 },
      experienceMatch: { score: 82 - index * 3 },
      educationMatch: { score: 78 },
      redFlags: []
    },
    aiScreeningStatus: "Screened",
    aiScreenedAt: new Date(),
    aiScreenedBy: hrUser._id,
    aiProvider: "mock",
    aiModel: "mock",
    aiScreeningAttempts: 1,
    createdBy: hrUser._id,
    isDeleted: false,
    resumeUrl: ""
  };

  if (!candidate) {
    candidate = await Candidate.create({
      ...data,
      statusHistory: [
        {
          previousStatus: null,
          newStatus: status,
          changedBy: hrUser._id,
          changedByRole: "hr",
          note: "Seeded local test candidate"
        }
      ]
    });
    console.log(`Created development candidate: ${email}`);
  } else {
    candidate.set(data);
    candidate.statusHistory = candidate.statusHistory?.length
      ? candidate.statusHistory
      : [
          {
            previousStatus: null,
            newStatus: status,
            changedBy: hrUser._id,
            changedByRole: "hr",
            note: "Seeded local test candidate"
          }
        ];
    await candidate.save();
    console.log(`Updated development candidate: ${email}`);
  }

  if (!candidate.resumeUrl) {
    candidate.resumeUrl = getResumeAccessPath(candidate._id);
    await candidate.save();
  }

  return candidate;
};

const ensureSeedInterview = async ({ company, job, hrUser, candidate, interviewer, startTime, status }) => {
  const durationMinutes = 45;
  const applicationId = candidate.applicationId;
  const title = `${candidate.fullName} - ${status} seed interview`;
  let interview = await Interview.findOne({ companyId: company._id, applicationId, title });

  const data = {
    companyId: company._id,
    jobId: job._id,
    candidateId: candidate._id,
    applicationId,
    interviewRound: status === "Completed" ? "Screening Round" : "Technical Round 1",
    title,
    interviewType: status === "Completed" ? "Screening" : "Technical",
    interviewMode: status === "Completed" ? "Phone" : "Video",
    scheduledDate: scheduledDateFor(startTime),
    startTime,
    endTime: addMinutes(startTime, durationMinutes),
    durationMinutes,
    timezone: "Asia/Kolkata",
    interviewerIds: [interviewer._id],
    interviewers: [
      {
        userId: interviewer._id,
        name: interviewer.name,
        email: interviewer.email,
        role: "Interviewer"
      }
    ],
    meetingLink: status === "Completed" ? "" : "https://meet.google.com/demo-phase-nine",
    location: "",
    instructions: "Seeded interview for local workflow validation.",
    agenda: "Discuss role fit, MERN experience, and delivery examples.",
    generatedQuestions: [],
    status,
    feedback:
      status === "Completed"
        ? [
            {
              interviewerId: interviewer._id,
              interviewerName: interviewer.name,
              technicalRating: 4,
              communicationRating: 4,
              problemSolvingRating: 4,
              cultureFitRating: 5,
              overallRating: 4.25,
              strengths: ["Strong project ownership", "Clear communication"],
              concerns: ["Needs deeper system design follow-up"],
              notes: "Seeded feedback for details page verification.",
              recommendation: "Hire"
            }
          ]
        : [],
    averageTechnicalRating: status === "Completed" ? 4 : null,
    averageCommunicationRating: status === "Completed" ? 4 : null,
    averageProblemSolvingRating: status === "Completed" ? 4 : null,
    averageCultureFitRating: status === "Completed" ? 5 : null,
    overallRating: status === "Completed" ? 4.25 : null,
    recommendation: status === "Completed" ? "Hire" : null,
    createdBy: hrUser._id,
    updatedBy: hrUser._id,
    completedAt: status === "Completed" ? new Date() : null
  };

  if (!interview) {
    interview = await Interview.create(data);
    console.log(`Created ${status.toLowerCase()} seed interview for ${candidate.fullName}`);
    return interview;
  }

  interview.set(data);
  await interview.save();
  console.log(`Updated ${status.toLowerCase()} seed interview for ${candidate.fullName}`);
  return interview;
};

const seedUsers = async () => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed development users in production.");
  }

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required to seed users.");
  }

  await connectDB(process.env.MONGODB_URI);

  const users = {};
  for (const userData of credentials) {
    users[userData.email] = await upsertUser(userData);
  }

  const hrUser = users["hr@hiresmart.com"];
  const interviewerOne = users["interviewer.one@hiresmart.com"];
  const interviewerTwo = users["interviewer.two@hiresmart.com"];
  const suspendedHr = users["suspended.hr@hiresmart.com"];
  const company = await ensureCompany(hrUser);
  const suspendedCompany = await ensureSuspendedCompany(suspendedHr);

  for (const user of [hrUser, interviewerOne, interviewerTwo]) {
    user.companyId = company._id;
    user.isActive = true;
    user.accountStatus = "Active";
    user.statusReason = "";
    await user.save();
  }

  const job = await ensureJob(company, hrUser);
  company.emailSettings = {
    ...company.emailSettings?.toObject?.(),
    senderName: "HireSmart HR",
    senderEmail: "no-reply@example.com",
    replyToEmail: "hr@hiresmart.com",
    provider: "mock",
    smtpConfigured: false,
    emailAutomationEnabled: true,
    interviewInvitationsEnabled: false,
    interviewRemindersEnabled: true,
    candidateStatusEmailsEnabled: false,
    defaultReminderHours: 24,
    footerText: "Development mock email generated by HireSmart AI."
  };
  await company.save();
  await seedDefaultEmailTemplatesForCompany(company._id, hrUser._id);
  const candidates = await Promise.all([
    ensureCandidate({
      company,
      job,
      hrUser,
      index: 0,
      applicationId: "HSA-2026-PH9A01",
      fullName: "Linus Torvalds",
      email: "linus.phase9@example.com",
      status: "Shortlisted",
      parsedResume: {
        name: "Linus Torvalds",
        email: "linus.phase9@example.com",
        skills: ["React", "Node.js", "MongoDB", "Distributed systems"],
        experience: [{ title: "Senior Full Stack Engineer", company: "Kernel Labs", years: 5 }],
        education: ["B.Tech Computer Science"]
      }
    }),
    ensureCandidate({
      company,
      job,
      hrUser,
      index: 1,
      applicationId: "HSA-2026-PH9A02",
      fullName: "Margaret Hamilton",
      email: "margaret.phase9@example.com",
      status: "Shortlisted",
      parsedResume: {
        name: "Margaret Hamilton",
        email: "margaret.phase9@example.com",
        skills: ["React", "Express", "API design", "Testing"],
        experience: [{ title: "Engineering Lead", company: "Apollo Systems", years: 7 }],
        education: ["M.S. Software Engineering"]
      }
    }),
    ensureCandidate({
      company,
      job,
      hrUser,
      index: 2,
      applicationId: "HSA-2026-PH9A03",
      fullName: "Katherine Johnson",
      email: "katherine.phase9@example.com",
      status: "Interview Completed",
      parsedResume: {
        name: "Katherine Johnson",
        email: "katherine.phase9@example.com",
        skills: ["MongoDB", "Node.js", "Analytics", "Problem solving"],
        experience: [{ title: "Software Engineer", company: "Orbital Analytics", years: 4 }],
        education: ["B.Sc. Mathematics"]
      }
    })
  ]);

  await ensureSeedInterview({
    company,
    job,
    hrUser,
    candidate: candidates[2],
    interviewer: interviewerOne,
    startTime: plusDays(1, 11),
    status: "Completed"
  });

  await ensureSeedInterview({
    company,
    job,
    hrUser,
    candidate: candidates[1],
    interviewer: interviewerTwo,
    startTime: plusDays(7, 15),
    status: "Scheduled"
  });

  const sampleEmailLogs = [
    {
      idempotencyKey: "phase10-sample-sent",
      emailType: "Manual",
      subject: "Sample sent email",
      status: "Sent",
      sentAt: new Date()
    },
    {
      idempotencyKey: "phase10-sample-pending",
      emailType: "Interview Reminder",
      subject: "Sample pending reminder",
      status: "Pending",
      scheduledFor: plusDays(2, 9)
    },
    {
      idempotencyKey: "phase10-sample-failed",
      emailType: "Follow Up",
      subject: "Sample failed email",
      status: "Failed",
      attempts: 1,
      failedAt: new Date(),
      nextRetryAt: new Date(),
      errorCode: "MOCK_FAILURE",
      errorMessage: "Development sample failed email"
    }
  ];

  for (const sample of sampleEmailLogs) {
    const existing = await EmailLog.findOne({ companyId: company._id, idempotencyKey: sample.idempotencyKey });
    if (existing) continue;
    await EmailLog.create({
      companyId: company._id,
      candidateId: candidates[0]._id,
      jobId: job._id,
      emailType: sample.emailType,
      provider: "mock",
      from: { name: "HireSmart HR", email: "no-reply@example.com" },
      to: [{ name: candidates[0].fullName, email: candidates[0].email }],
      subject: sample.subject,
      htmlBody: "<p>Development sample email log.</p>",
      textBody: "Development sample email log.",
      status: sample.status,
      attempts: sample.attempts || (sample.status === "Sent" ? 1 : 0),
      maxAttempts: 3,
      scheduledFor: sample.scheduledFor || new Date(),
      sentAt: sample.sentAt || null,
      failedAt: sample.failedAt || null,
      nextRetryAt: sample.nextRetryAt || null,
      errorCode: sample.errorCode || "",
      errorMessage: sample.errorMessage || "",
      triggeredBy: hrUser._id,
      triggeredByType: "HR",
      automationKey: sample.idempotencyKey,
      idempotencyKey: sample.idempotencyKey,
      metadata: { seeded: true, mockMode: true },
      createdBy: hrUser._id
    });
  }

  await AuditLog.updateOne(
    { action: "seed.phase11", entityType: "System", entityLabel: "Phase 11 seed data" },
    {
      $setOnInsert: {
        actorId: users["admin@hiresmart.com"]._id,
        actorName: users["admin@hiresmart.com"].name,
        actorRole: "admin",
        companyId: company._id,
        action: "seed.phase11",
        entityType: "System",
        entityLabel: "Phase 11 seed data",
        description: "Seeded audit visibility for analytics and admin monitoring.",
        metadata: { suspendedCompanyId: suspendedCompany._id.toString() }
      }
    },
    { upsert: true }
  );

  const activeCandidateCount = await Candidate.countDocuments({ companyId: company._id, jobId: job._id, isDeleted: false });
  job.candidateCount = activeCandidateCount;
  await job.save();

  console.log("Development credentials only:");
  console.log("Admin: admin@hiresmart.com / Admin@12345");
  console.log("HR: hr@hiresmart.com / Hr@12345");
  console.log("Interviewers: interviewer.one@hiresmart.com, interviewer.two@hiresmart.com / Hr@12345");
  console.log(`Company: ${company.name}`);
  console.log(`Job: ${job.title}`);
  console.log(`Candidates available for Phase 9: ${candidates.map((candidate) => candidate.email).join(", ")}`);
};

seedUsers()
  .catch((error) => {
    console.error(`Seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await closeDB();
    }
  });
