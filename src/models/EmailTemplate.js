import mongoose from "mongoose";
import { EMAIL_TEMPLATE_CATEGORIES } from "../constants/emailTemplateVariables.js";

const emailTemplateSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 180 },
    category: { type: String, enum: EMAIL_TEMPLATE_CATEGORIES, required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 300 },
    htmlBody: { type: String, required: true, maxlength: 30000 },
    textBody: { type: String, required: true, maxlength: 30000 },
    availableVariables: { type: [String], default: [] },
    isDefault: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    version: { type: Number, default: 1, min: 1 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

emailTemplateSchema.index({ companyId: 1, slug: 1 }, { unique: true });
emailTemplateSchema.index({ companyId: 1, category: 1 });
emailTemplateSchema.index({ companyId: 1, isActive: 1 });

emailTemplateSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    companyId: this.companyId,
    name: this.name,
    slug: this.slug,
    category: this.category,
    subject: this.subject,
    htmlBody: this.htmlBody,
    textBody: this.textBody,
    availableVariables: this.availableVariables,
    isDefault: this.isDefault,
    isActive: this.isActive,
    version: this.version,
    createdBy: this.createdBy,
    updatedBy: this.updatedBy,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

const EmailTemplate = mongoose.model("EmailTemplate", emailTemplateSchema);

export default EmailTemplate;
