export const candidateStatusTransitions = {
  Applied: ["Under Review", "Rejected", "On Hold"],
  "Resume Parsed": ["AI Screening Completed", "Under Review", "Rejected", "On Hold"],
  "AI Screening Completed": ["Under Review", "Shortlisted", "Rejected", "On Hold"],
  "Under Review": ["Shortlisted", "Rejected", "On Hold"],
  "On Hold": ["Under Review", "Shortlisted", "Rejected"],
  Shortlisted: ["Under Review", "Rejected", "On Hold", "Interview Scheduled"],
  "Interview Scheduled": ["Interview Completed", "Rejected", "On Hold"],
  "Interview Completed": ["Selected", "Rejected", "On Hold"],
  Selected: ["On Hold"],
  Rejected: ["Under Review"]
};

export const getAllowedCandidateStatuses = (status) => candidateStatusTransitions[status] || [];

export const requiresCandidateStatusNote = (previousStatus, nextStatus) =>
  nextStatus === "Rejected" ||
  (previousStatus === "Rejected" && nextStatus === "Under Review") ||
  (previousStatus === "Selected" && nextStatus === "On Hold");
