import mongoose from "mongoose";
import { ACCOUNT_STATUSES } from "../constants/analyticsConstants.js";

const statusHistorySchema = new mongoose.Schema(
  {
    previousStatus: { type: String, enum: ACCOUNT_STATUSES, default: null },
    newStatus: { type: String, enum: ACCOUNT_STATUSES, required: true },
    reason: { type: String, trim: true, maxlength: 1000, default: "" },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    changedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const emailSettingsSchema = new mongoose.Schema(
  {
    senderName: { type: String, trim: true, maxlength: 120, default: "HireSmart AI" },
    senderEmail: { type: String, trim: true, lowercase: true, maxlength: 160, default: "no-reply@example.com" },
    replyToEmail: { type: String, trim: true, lowercase: true, maxlength: 160, default: "" },
    provider: { type: String, enum: ["mock", "smtp"], default: "mock" },
    smtpConfigured: { type: Boolean, default: false },
    emailAutomationEnabled: { type: Boolean, default: true },
    interviewInvitationsEnabled: { type: Boolean, default: false },
    interviewRemindersEnabled: { type: Boolean, default: true },
    candidateStatusEmailsEnabled: { type: Boolean, default: false },
    defaultReminderHours: { type: Number, min: 1, max: 168, default: 24 },
    footerText: { type: String, trim: true, maxlength: 1000, default: "You are receiving this message about your HireSmart AI application." }
  },
  { _id: false }
);

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Company name is required"],
      trim: true,
      minlength: [2, "Company name must be at least 2 characters"],
      maxlength: [120, "Company name cannot exceed 120 characters"]
    },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    logo: {
      type: String,
      default: ""
    },
    website: {
      type: String,
      default: ""
    },
    industry: {
      type: String,
      required: [true, "Industry is required"],
      trim: true
    },
    size: {
      type: String,
      enum: ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"],
      required: [true, "Company size is required"]
    },
    address: {
      type: String,
      trim: true,
      maxlength: [250, "Address cannot exceed 250 characters"],
      default: ""
    },
    city: {
      type: String,
      required: [true, "City is required"],
      trim: true
    },
    state: {
      type: String,
      required: [true, "State is required"],
      trim: true
    },
    country: {
      type: String,
      required: [true, "Country is required"],
      trim: true
    },
    postalCode: {
      type: String,
      trim: true,
      default: ""
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
      default: ""
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: ""
    },
    contactPhone: {
      type: String,
      trim: true,
      default: ""
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    accountStatus: {
      type: String,
      enum: ACCOUNT_STATUSES,
      default: "Active",
      index: true
    },
    statusReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ""
    },
    statusChangedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    statusChangedAt: {
      type: Date,
      default: null
    },
    statusHistory: {
      type: [statusHistorySchema],
      default: []
    },
    emailSettings: { type: emailSettingsSchema, default: () => ({}) }
  },
  {
    timestamps: true
  }
);

companySchema.index({ slug: 1 }, { unique: true });
companySchema.index({ createdBy: 1 }, { unique: true });
companySchema.index({ name: 1 });
companySchema.index({ isActive: 1 });

companySchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    name: this.name,
    slug: this.slug,
    logo: this.logo,
    website: this.website,
    industry: this.industry,
    size: this.size,
    address: this.address,
    city: this.city,
    state: this.state,
    country: this.country,
    postalCode: this.postalCode,
    description: this.description,
    contactEmail: this.contactEmail,
    contactPhone: this.contactPhone,
    emailSettings: {
      senderName: this.emailSettings?.senderName || "HireSmart AI",
      senderEmail: this.emailSettings?.senderEmail || "no-reply@example.com",
      replyToEmail: this.emailSettings?.replyToEmail || "",
      provider: this.emailSettings?.provider || "mock",
      smtpConfigured: Boolean(this.emailSettings?.smtpConfigured),
      emailAutomationEnabled: this.emailSettings?.emailAutomationEnabled ?? true,
      interviewInvitationsEnabled: this.emailSettings?.interviewInvitationsEnabled ?? false,
      interviewRemindersEnabled: this.emailSettings?.interviewRemindersEnabled ?? true,
      candidateStatusEmailsEnabled: this.emailSettings?.candidateStatusEmailsEnabled ?? false,
      defaultReminderHours: this.emailSettings?.defaultReminderHours || 24,
      footerText: this.emailSettings?.footerText || ""
    },
    createdBy: this.createdBy,
    isActive: this.isActive,
    accountStatus: this.accountStatus || (this.isActive ? "Active" : "Disabled"),
    statusReason: this.statusReason || "",
    statusChangedBy: this.statusChangedBy,
    statusChangedAt: this.statusChangedAt,
    statusHistory: this.statusHistory || [],
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

const Company = mongoose.model("Company", companySchema);

export default Company;
