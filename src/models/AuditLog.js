import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    actorName: { type: String, trim: true, maxlength: 120, default: "System" },
    actorRole: { type: String, enum: ["admin", "hr", "system"], default: "system", index: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null, index: true },
    action: { type: String, required: true, trim: true, maxlength: 160, index: true },
    entityType: { type: String, required: true, trim: true, maxlength: 80, index: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    entityLabel: { type: String, trim: true, maxlength: 200, default: "" },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, createdAt: -1 });

auditLogSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    actorId: this.actorId,
    actorName: this.actorName,
    actorRole: this.actorRole,
    companyId: this.companyId,
    action: this.action,
    entityType: this.entityType,
    entityId: this.entityId,
    entityLabel: this.entityLabel,
    description: this.description,
    metadata: this.metadata,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
