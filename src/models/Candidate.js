import mongoose from "mongoose";

export const CANDIDATE_STATUSES = [
  "Applied",
  "Resume Parsed",
  "AI Screening Completed",
  "Under Review",
  "Shortlisted",
  "Interview Scheduled",
  "Interview Completed",
  "Selected",
  "Rejected",
  "On Hold"
];

export const CANDIDATE_SOURCES = ["Public Application", "HR Upload", "Referral", "Other"];
export const RESUME_PARSE_STATUSES = ["Not Parsed", "Processing", "Parsed", "Failed", "Needs OCR"];
export const AI_SCREENING_STATUSES = ["Not Screened", "Processing", "Screened", "Failed"];

const screeningAnswerSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    question: { type: String, required: true, trim: true, maxlength: 500 },
    type: { type: String, enum: ["text", "textarea", "number", "select", "yes-no"], required: true },
    answer: { type: mongoose.Schema.Types.Mixed, required: true }
  },
  { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
  {
    previousStatus: { type: String, enum: [...CANDIDATE_STATUSES, null], default: null },
    newStatus: { type: String, enum: CANDIDATE_STATUSES, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    changedByRole: { type: String, default: "candidate" },
    note: { type: String, trim: true, maxlength: 1000, default: "" },
    changedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const recruiterNoteSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, minlength: 1, maxlength: 3000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdByName: { type: String, trim: true, maxlength: 120, default: "" }
  },
  { timestamps: true }
);

const candidateSchema = new mongoose.Schema(
  {
    applicationId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true
    },
    fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    location: { type: String, trim: true, maxlength: 150, default: "" },
    totalExperience: { type: Number, min: 0, max: 60, default: 0 },
    currentCompany: { type: String, trim: true, maxlength: 150, default: "" },
    currentDesignation: { type: String, trim: true, maxlength: 150, default: "" },
    expectedSalary: { type: Number, min: 0, default: null },
    noticePeriod: { type: String, trim: true, maxlength: 100, default: "" },
    linkedinUrl: { type: String, trim: true, default: "" },
    githubUrl: { type: String, trim: true, default: "" },
    portfolioUrl: { type: String, trim: true, default: "" },
    coverLetter: { type: String, trim: true, maxlength: 5000, default: "" },
    resumeUrl: { type: String, trim: true, default: "" },
    resumeStoragePath: { type: String, required: true, select: false },
    resumeOriginalName: { type: String, required: true, trim: true },
    resumeStoredName: { type: String, required: true, trim: true },
    resumeMimeType: {
      type: String,
      required: true,
      enum: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
    },
    resumeSize: { type: Number, required: true, min: 1 },
    extractedResumeText: { type: String, default: null },
    parsedResume: { type: mongoose.Schema.Types.Mixed, default: null },
    resumeParseStatus: { type: String, enum: RESUME_PARSE_STATUSES, default: "Not Parsed", index: true },
    resumeParseError: { type: String, default: null },
    resumeParsedAt: { type: Date, default: null },
    resumeParsedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resumeParserVersion: { type: String, default: "v1" },
    resumeTextLength: { type: Number, default: 0 },
    resumeParseAttempts: { type: Number, default: 0 },
    resumeParserProvider: { type: String, default: "mock" },
    resumeParserModel: { type: String, default: "mock" },
    resumeTextTruncated: { type: Boolean, default: false },
    resumeParserFallbackUsed: { type: Boolean, default: false },
    screeningAnswers: { type: [screeningAnswerSchema], default: [] },
    source: { type: String, enum: CANDIDATE_SOURCES, default: "Public Application", index: true },
    status: { type: String, enum: CANDIDATE_STATUSES, default: "Applied", index: true },
    statusHistory: { type: [statusHistorySchema], default: [] },
    aiEvaluation: { type: mongoose.Schema.Types.Mixed, default: null },
    aiScreeningStatus: { type: String, enum: AI_SCREENING_STATUSES, default: "Not Screened", index: true },
    aiScreeningError: { type: String, default: null },
    aiScreenedAt: { type: Date, default: null, index: true },
    aiScreenedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    aiProvider: { type: String, enum: ["mock", "gemini", "openai"], default: "mock" },
    aiModel: { type: String, default: null },
    aiScreeningVersion: { type: String, default: "v1" },
    aiScreeningAttempts: { type: Number, default: 0 },
    aiProviderFallbackUsed: { type: Boolean, default: false },
    jobUpdatedAtAtScreening: { type: Date, default: null },
    resumeParsedAtAtScreening: { type: Date, default: null },
    recruiterNotes: { type: [recruiterNoteSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    appliedAt: { type: Date, default: Date.now, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    deletionReason: { type: String, trim: true, maxlength: 1000, default: "" }
  },
  { timestamps: true }
);

candidateSchema.index({ jobId: 1, email: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
candidateSchema.index({ companyId: 1, status: 1 });
candidateSchema.index({ companyId: 1, createdAt: -1 });
candidateSchema.index({ companyId: 1, jobId: 1 });
candidateSchema.index({ companyId: 1, email: 1 });
candidateSchema.index({ companyId: 1, aiScreeningStatus: 1 });
candidateSchema.index({ companyId: 1, "aiEvaluation.overallScore": -1 });
candidateSchema.index({ companyId: 1, appliedAt: -1, status: 1 });
candidateSchema.index({ companyId: 1, aiScreenedAt: -1, aiScreeningStatus: 1 });
candidateSchema.index({ companyId: 1, source: 1, appliedAt: -1 });

candidateSchema.methods.toSafeSummary = function toSafeSummary() {
  return {
    id: this._id.toString(),
    applicationId: this.applicationId,
    jobId: this.jobId,
    companyId: this.companyId,
    fullName: this.fullName,
    email: this.email,
    phone: this.phone,
    totalExperience: this.totalExperience,
    currentCompany: this.currentCompany,
    currentDesignation: this.currentDesignation,
    source: this.source,
    status: this.status,
    aiEvaluation: null,
    aiScreeningStatus: this.aiScreeningStatus,
    aiScreeningError: this.aiScreeningError,
    aiScreenedAt: this.aiScreenedAt,
    aiProvider: this.aiProvider,
    aiModel: this.aiModel,
    aiScreeningVersion: this.aiScreeningVersion,
    aiScreeningAttempts: this.aiScreeningAttempts,
    aiProviderFallbackUsed: this.aiProviderFallbackUsed,
    overallScore: this.aiEvaluation?.overallScore ?? null,
    category: this.aiEvaluation?.category ?? null,
    resumeParseStatus: this.resumeParseStatus,
    appliedAt: this.appliedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

candidateSchema.methods.toSafeDetails = function toSafeDetails() {
  return {
    ...this.toSafeSummary(),
    location: this.location,
    expectedSalary: this.expectedSalary,
    noticePeriod: this.noticePeriod,
    linkedinUrl: this.linkedinUrl,
    githubUrl: this.githubUrl,
    portfolioUrl: this.portfolioUrl,
    coverLetter: this.coverLetter,
    resumeUrl: this.resumeUrl,
    resumeOriginalName: this.resumeOriginalName,
    resumeStoredName: this.resumeStoredName,
    resumeMimeType: this.resumeMimeType,
    resumeSize: this.resumeSize,
    extractedResumeText: null,
    parsedResume: this.parsedResume,
    resumeParseStatus: this.resumeParseStatus,
    resumeParseError: this.resumeParseError,
    resumeParsedAt: this.resumeParsedAt,
    resumeParsedBy: this.resumeParsedBy,
    resumeParserVersion: this.resumeParserVersion,
    resumeTextLength: this.resumeTextLength,
    resumeParseAttempts: this.resumeParseAttempts,
    resumeParserProvider: this.resumeParserProvider,
    resumeParserModel: this.resumeParserModel,
    resumeTextTruncated: this.resumeTextTruncated,
    resumeParserFallbackUsed: this.resumeParserFallbackUsed,
    aiEvaluation: this.aiEvaluation,
    aiScreeningStatus: this.aiScreeningStatus,
    aiScreeningError: this.aiScreeningError,
    aiScreenedAt: this.aiScreenedAt,
    aiScreenedBy: this.aiScreenedBy,
    aiProvider: this.aiProvider,
    aiModel: this.aiModel,
    aiScreeningVersion: this.aiScreeningVersion,
    aiScreeningAttempts: this.aiScreeningAttempts,
    aiProviderFallbackUsed: this.aiProviderFallbackUsed,
    jobUpdatedAtAtScreening: this.jobUpdatedAtAtScreening,
    resumeParsedAtAtScreening: this.resumeParsedAtAtScreening,
    screeningAnswers: this.screeningAnswers,
    statusHistory: this.statusHistory,
    recruiterNotes: this.recruiterNotes,
    createdBy: this.createdBy
  };
};

const Candidate = mongoose.model("Candidate", candidateSchema);

export default Candidate;
