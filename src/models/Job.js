import mongoose from "mongoose";

const screeningQuestionSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true
    },
    question: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    type: {
      type: String,
      enum: ["text", "textarea", "number", "select", "yes-no"],
      default: "text"
    },
    required: {
      type: Boolean,
      default: false
    },
    options: {
      type: [String],
      default: []
    },
    order: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

const jobSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120
    },
    department: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    employmentType: {
      type: String,
      enum: ["Full-time", "Part-time", "Contract", "Internship", "Temporary"],
      required: true
    },
    workMode: {
      type: String,
      enum: ["On-site", "Remote", "Hybrid"],
      required: true
    },
    location: {
      type: String,
      trim: true,
      maxlength: 150,
      default: ""
    },
    minimumExperience: {
      type: Number,
      min: 0,
      default: 0
    },
    maximumExperience: {
      type: Number,
      min: 0,
      default: 0
    },
    requiredSkills: {
      type: [String],
      required: true,
      validate: [(value) => value.length > 0, "At least one required skill is needed"]
    },
    preferredSkills: {
      type: [String],
      default: []
    },
    education: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 50,
      maxlength: 10000
    },
    responsibilities: {
      type: [String],
      required: true,
      validate: [(value) => value.length > 0, "At least one responsibility is needed"]
    },
    salaryMin: {
      type: Number,
      min: 0,
      default: null
    },
    salaryMax: {
      type: Number,
      min: 0,
      default: null
    },
    salaryCurrency: {
      type: String,
      enum: ["INR", "USD", "EUR", "GBP", "AED", "Other"],
      default: "INR"
    },
    salaryPeriod: {
      type: String,
      enum: ["Yearly", "Monthly", "Hourly", "Project-based"],
      default: "Yearly"
    },
    openings: {
      type: Number,
      required: true,
      min: 1,
      max: 1000
    },
    deadline: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: ["Draft", "Active", "Closed", "Archived"],
      default: "Draft",
      index: true
    },
    screeningQuestions: {
      type: [screeningQuestionSchema],
      default: []
    },
    publicApplicationSlug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true
    },
    candidateCount: {
      type: Number,
      default: 0
    },
    publishedAt: Date,
    closedAt: Date,
    archivedAt: Date
  },
  {
    timestamps: true
  }
);

jobSchema.index({ companyId: 1, status: 1 });
jobSchema.index({ companyId: 1, createdAt: -1 });
jobSchema.index({ companyId: 1, department: 1 });
jobSchema.index({ companyId: 1, title: 1 });
jobSchema.index({ deadline: 1 });
jobSchema.index({ location: 1 });

jobSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    companyId: this.companyId,
    createdBy: this.createdBy,
    title: this.title,
    department: this.department,
    employmentType: this.employmentType,
    workMode: this.workMode,
    location: this.location,
    minimumExperience: this.minimumExperience,
    maximumExperience: this.maximumExperience,
    requiredSkills: this.requiredSkills,
    preferredSkills: this.preferredSkills,
    education: this.education,
    description: this.description,
    responsibilities: this.responsibilities,
    salaryMin: this.salaryMin,
    salaryMax: this.salaryMax,
    salaryCurrency: this.salaryCurrency,
    salaryPeriod: this.salaryPeriod,
    openings: this.openings,
    deadline: this.deadline,
    status: this.status,
    screeningQuestions: this.screeningQuestions,
    publicApplicationSlug: this.publicApplicationSlug,
    candidateCount: this.candidateCount,
    publishedAt: this.publishedAt,
    closedAt: this.closedAt,
    archivedAt: this.archivedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

const Job = mongoose.model("Job", jobSchema);

export default Job;
