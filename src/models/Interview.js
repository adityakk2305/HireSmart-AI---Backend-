import mongoose from "mongoose";
import { INTERVIEW_STATUSES } from "../constants/interviewStatusTransitions.js";

export const INTERVIEW_ROUNDS = [
  "Screening Round",
  "Technical Round 1",
  "Technical Round 2",
  "Managerial Round",
  "HR Round",
  "Final Round",
  "Custom"
];
export const INTERVIEW_TYPES = ["Screening", "Technical", "Coding", "System Design", "Managerial", "HR", "Culture Fit", "Final", "Other"];
export const INTERVIEW_MODES = ["Video", "Phone", "In Person"];
export const QUESTION_CATEGORIES = ["Technical", "Behavioral", "Experience", "Project", "Problem Solving", "System Design", "HR", "Culture Fit", "Other"];
export const QUESTION_DIFFICULTIES = ["Easy", "Medium", "Hard"];
export const INTERVIEW_RECOMMENDATIONS = ["Strong Hire", "Hire", "Further Review", "No Hire", "Strong No Hire", "Mixed"];

const interviewerSnapshotSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
    role: { type: String, trim: true, maxlength: 120, default: "Interviewer" }
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 1000 },
    category: { type: String, enum: QUESTION_CATEGORIES, default: "Technical" },
    difficulty: { type: String, enum: QUESTION_DIFFICULTIES, default: "Medium" },
    expectedAnswer: { type: String, trim: true, maxlength: 3000, default: "" },
    evaluationCriteria: { type: String, trim: true, maxlength: 3000, default: "" },
    source: { type: String, enum: ["AI", "Mock AI", "Recruiter"], default: "Recruiter" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const feedbackSchema = new mongoose.Schema(
  {
    interviewerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    interviewerName: { type: String, required: true, trim: true, maxlength: 120 },
    technicalRating: { type: Number, min: 1, max: 5, default: null },
    communicationRating: { type: Number, min: 1, max: 5, default: null },
    problemSolvingRating: { type: Number, min: 1, max: 5, default: null },
    cultureFitRating: { type: Number, min: 1, max: 5, default: null },
    overallRating: { type: Number, min: 1, max: 5, required: true },
    strengths: { type: [String], default: [] },
    concerns: { type: [String], default: [] },
    notes: { type: String, trim: true, maxlength: 5000, default: "" },
    recommendation: { type: String, enum: INTERVIEW_RECOMMENDATIONS.filter((item) => item !== "Mixed"), required: true },
    submittedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const rescheduleHistorySchema = new mongoose.Schema(
  {
    previousStartTime: { type: Date, required: true },
    previousEndTime: { type: Date, required: true },
    newStartTime: { type: Date, required: true },
    newEndTime: { type: Date, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    changedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const interviewSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: "Candidate", required: true, index: true },
    applicationId: { type: String, required: true, trim: true, uppercase: true, index: true },
    interviewRound: { type: String, enum: INTERVIEW_ROUNDS, required: true },
    customRoundLabel: { type: String, trim: true, maxlength: 120, default: "" },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    interviewType: { type: String, enum: INTERVIEW_TYPES, required: true },
    interviewMode: { type: String, enum: INTERVIEW_MODES, required: true },
    scheduledDate: { type: Date, required: true, index: true },
    startTime: { type: Date, required: true, index: true },
    endTime: { type: Date, required: true },
    durationMinutes: { type: Number, min: 10, max: 240, required: true },
    timezone: { type: String, required: true, trim: true, default: "Asia/Kolkata" },
    interviewerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    interviewers: { type: [interviewerSnapshotSchema], default: [] },
    meetingLink: { type: String, trim: true, maxlength: 1000, default: "" },
    location: { type: String, trim: true, maxlength: 500, default: "" },
    instructions: { type: String, trim: true, maxlength: 3000, default: "" },
    agenda: { type: String, trim: true, maxlength: 3000, default: "" },
    generatedQuestions: { type: [questionSchema], default: [] },
    customQuestions: { type: [questionSchema], default: [] },
    status: { type: String, enum: INTERVIEW_STATUSES, default: "Scheduled", index: true },
    cancellationReason: { type: String, trim: true, maxlength: 1000, default: "" },
    rescheduleHistory: { type: [rescheduleHistorySchema], default: [] },
    feedback: { type: [feedbackSchema], default: [] },
    averageTechnicalRating: { type: Number, default: null },
    averageCommunicationRating: { type: Number, default: null },
    averageProblemSolvingRating: { type: Number, default: null },
    averageCultureFitRating: { type: Number, default: null },
    overallRating: { type: Number, default: null },
    recommendation: { type: String, enum: INTERVIEW_RECOMMENDATIONS, default: null },
    privateNotes: { type: String, trim: true, maxlength: 5000, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null }
  },
  { timestamps: true }
);

interviewSchema.index({ companyId: 1, scheduledDate: 1 });
interviewSchema.index({ companyId: 1, status: 1 });
interviewSchema.index({ candidateId: 1, scheduledDate: 1 });
interviewSchema.index({ jobId: 1, scheduledDate: 1 });
interviewSchema.index({ companyId: 1, candidateId: 1 });
interviewSchema.index({ companyId: 1, interviewerIds: 1, startTime: 1 });
interviewSchema.index({ companyId: 1, createdAt: -1 });

const Interview = mongoose.model("Interview", interviewSchema);

export default Interview;
