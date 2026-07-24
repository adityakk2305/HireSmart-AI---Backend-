export const ANALYTICS_PRESETS = [
  "today",
  "yesterday",
  "last-7-days",
  "last-30-days",
  "last-90-days",
  "this-month",
  "last-month",
  "this-quarter",
  "this-year",
  "custom"
];

export const ANALYTICS_GROUPINGS = ["day", "week", "month"];

export const ANALYTICS_EXPORT_TYPES = [
  "overview",
  "hiring-funnel",
  "candidates",
  "jobs",
  "interviews",
  "interviewers",
  "emails",
  "recruiters",
  "skills"
];

export const ANALYTICS_JOB_SORTS = [
  "most-applications",
  "least-applications",
  "highest-selection-rate",
  "lowest-selection-rate",
  "highest-average-score",
  "fastest-time-to-hire",
  "newest",
  "oldest"
];

export const ACCOUNT_STATUSES = ["Active", "Suspended", "Disabled"];

export const STATUS_HISTORY_ACTIONS = {
  COMPANY_STATUS_CHANGED: "company.status_changed",
  USER_STATUS_CHANGED: "user.status_changed"
};

export const SCORE_RANGES = [
  { label: "0-29", min: 0, max: 29 },
  { label: "30-49", min: 30, max: 49 },
  { label: "50-69", min: 50, max: 69 },
  { label: "70-84", min: 70, max: 84 },
  { label: "85-100", min: 85, max: 100 }
];

export const DEFAULT_TIMEZONE = "Asia/Kolkata";
export const MAX_ANALYTICS_RANGE_DAYS = 731;
export const ANALYTICS_EXPORT_ROW_LIMIT = 5000;
