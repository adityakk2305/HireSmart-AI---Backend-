export const INTERVIEW_STATUSES = ["Scheduled", "Rescheduled", "In Progress", "Completed", "Cancelled", "No Show"];

export const ACTIVE_INTERVIEW_STATUSES = ["Scheduled", "Rescheduled", "In Progress"];

export const interviewStatusTransitions = {
  Scheduled: ["Rescheduled", "In Progress", "Completed", "Cancelled", "No Show"],
  Rescheduled: ["Rescheduled", "In Progress", "Completed", "Cancelled", "No Show"],
  "In Progress": ["Completed", "Cancelled"],
  Completed: [],
  Cancelled: ["Rescheduled"],
  "No Show": ["Rescheduled", "Cancelled"]
};

export const getAllowedInterviewStatuses = (status) => interviewStatusTransitions[status] || [];
