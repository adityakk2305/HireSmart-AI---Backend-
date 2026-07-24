import mongoose from "mongoose";
import { EMAIL_LOG_STATUSES, EMAIL_TYPES } from "../constants/emailTemplateVariables.js";

const addressSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 120, default: "" },
    email: { type: String, trim: true, lowercase: true, maxlength: 160, required: true }
  },
  { _id: false }
);

const retryHistorySchema = new mongoose.Schema(
  {
    attempt: { type: Number, required: true },
    status: { type: String, enum: EMAIL_LOG_STATUSES, required: true },
    errorCode: { type: String, trim: true, maxlength: 120, default: "" },
    errorMessage: { type: String, trim: true, maxlength: 1000, default: "" },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const emailLogSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: "Candidate", default: null, index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job", default: null, index: true },
    interviewId: { type: mongoose.Schema.Types.ObjectId, ref: "Interview", default: null, index: true },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "EmailTemplate", default: null },
    emailType: { type: String, enum: EMAIL_TYPES, required: true, index: true },
    provider: { type: String, enum: ["mock", "smtp"], required: true, default: "mock" },
    providerMessageId: { type: String, trim: true, maxlength: 300, default: "" },
    from: { type: addressSchema, required: true },
    to: { type: [addressSchema], required: true, validate: [(value) => value.length > 0, "Recipient is required"] },
    cc: { type: [addressSchema], default: [] },
    bcc: { type: [addressSchema], default: [], select: false },
    subject: { type: String, required: true, trim: true, maxlength: 300 },
    htmlBody: { type: String, maxlength: 30000, default: "" },
    textBody: { type: String, maxlength: 30000, default: "" },
    status: { type: String, enum: EMAIL_LOG_STATUSES, default: "Pending", index: true },
    attempts: { type: Number, min: 0, default: 0 },
    maxAttempts: { type: Number, min: 1, default: 3 },
    scheduledFor: { type: Date, default: Date.now, index: true },
    sentAt: { type: Date, default: null, index: true },
    failedAt: { type: Date, default: null },
    nextRetryAt: { type: Date, default: null },
    errorCode: { type: String, trim: true, maxlength: 120, default: "" },
    errorMessage: { type: String, trim: true, maxlength: 1000, default: "" },
    triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    triggeredByType: { type: String, enum: ["HR", "Automation", "System"], default: "HR" },
    automationKey: { type: String, trim: true, maxlength: 300, default: "" },
    idempotencyKey: { type: String, trim: true, maxlength: 300, default: "", index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    retryHistory: { type: [retryHistorySchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

emailLogSchema.index({ companyId: 1, status: 1, scheduledFor: 1 });
emailLogSchema.index({ companyId: 1, createdAt: -1 });
emailLogSchema.index({ companyId: 1, sentAt: -1 });
emailLogSchema.index({ companyId: 1, emailType: 1 });
emailLogSchema.index(
  { companyId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string", $gt: "" } } }
);

const hideBcc = (value) => value?.map(({ name, email }) => ({ name, email })) || [];

emailLogSchema.methods.toSafeObject = function toSafeObject(includeDetails = false) {
  return {
    id: this._id.toString(),
    companyId: this.companyId,
    candidateId: this.candidateId,
    jobId: this.jobId,
    interviewId: this.interviewId,
    templateId: this.templateId,
    emailType: this.emailType,
    provider: this.provider,
    providerMessageId: this.providerMessageId,
    from: this.from,
    to: hideBcc(this.to),
    cc: hideBcc(this.cc),
    subject: this.subject,
    status: this.status,
    attempts: this.attempts,
    maxAttempts: this.maxAttempts,
    scheduledFor: this.scheduledFor,
    sentAt: this.sentAt,
    failedAt: this.failedAt,
    nextRetryAt: this.nextRetryAt,
    errorCode: this.errorCode,
    errorMessage: this.errorMessage,
    triggeredBy: this.triggeredBy,
    triggeredByType: this.triggeredByType,
    automationKey: this.automationKey,
    idempotencyKey: this.idempotencyKey,
    metadata: this.metadata,
    retryHistory: this.retryHistory,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    bodyAvailable: includeDetails ? Boolean(this.htmlBody || this.textBody) : undefined
  };
};

const EmailLog = mongoose.model("EmailLog", emailLogSchema);

export default EmailLog;
