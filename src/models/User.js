import bcrypt from "bcryptjs";
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

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [80, "Name cannot exceed 80 characters"]
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address"]
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false
    },
    role: {
      type: String,
      enum: ["admin", "hr"],
      default: "hr"
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null
    },
    phone: {
      type: String,
      trim: true,
      default: "",
      match: [/^$|^\+[1-9]\d{7,14}$/, "Enter a valid international phone number"]
    },
    profileImage: {
      type: String,
      default: ""
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
    refreshTokenHash: {
      type: String,
      select: false
    },
    resetPasswordToken: {
      type: String,
      select: false
    },
    resetPasswordExpire: {
      type: Date,
      select: false
    },
    lastLoginAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) {
    return next();
  }

  this.password = await bcrypt.hash(this.password, 12);
  return next();
});

userSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    companyId: this.companyId,
    phone: this.phone,
    profileImage: this.profileImage,
    isActive: this.isActive,
    accountStatus: this.accountStatus || (this.isActive ? "Active" : "Disabled"),
    statusReason: this.statusReason || "",
    statusChangedBy: this.statusChangedBy,
    statusChangedAt: this.statusChangedAt,
    statusHistory: this.statusHistory || [],
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

const User = mongoose.model("User", userSchema);

export default User;
