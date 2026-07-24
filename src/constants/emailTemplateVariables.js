export const EMAIL_TEMPLATE_CATEGORIES = [
  "Interview Invitation",
  "Interview Reminder",
  "Interview Rescheduled",
  "Interview Cancelled",
  "Shortlisted",
  "Rejected",
  "Selected",
  "On Hold",
  "Follow Up",
  "Custom"
];

export const EMAIL_TYPES = [
  "Manual",
  "Interview Invitation",
  "Interview Reminder",
  "Interview Rescheduled",
  "Interview Cancelled",
  "Shortlisted",
  "Rejected",
  "Selected",
  "On Hold",
  "Follow Up",
  "Test Email",
  "Custom"
];

export const EMAIL_LOG_STATUSES = ["Pending", "Processing", "Sent", "Failed", "Cancelled", "Skipped"];

export const EMAIL_VARIABLE_GROUPS = {
  Candidate: ["candidateName", "candidateFirstName", "candidateEmail", "applicationId", "candidateStatus"],
  Job: ["jobTitle", "department", "jobLocation", "employmentType", "workMode"],
  Company: ["companyName", "companyWebsite", "companyAddress", "senderName", "replyToEmail"],
  Interview: [
    "interviewTitle",
    "interviewRound",
    "interviewType",
    "interviewMode",
    "interviewDate",
    "interviewStartTime",
    "interviewEndTime",
    "interviewDuration",
    "interviewTimezone",
    "meetingLink",
    "interviewLocation",
    "interviewerNames",
    "interviewInstructions",
    "interviewAgenda"
  ],
  Links: ["frontendUrl", "applicationStatusUrl"]
};

export const APPROVED_EMAIL_VARIABLES = Object.values(EMAIL_VARIABLE_GROUPS).flat();

const baseHtml = (content) => `
  <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;max-width:640px;margin:0 auto">
    ${content}
    <hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0" />
    <p style="font-size:13px;color:#64748b">{{companyName}}<br />{{replyToEmail}}</p>
  </div>
`;

export const DEFAULT_EMAIL_TEMPLATES = [
  {
    name: "Interview Invitation",
    slug: "interview-invitation",
    category: "Interview Invitation",
    subject: "Interview Invitation - {{jobTitle}} at {{companyName}}",
    htmlBody: baseHtml(`
      <p>Hello {{candidateFirstName}},</p>
      <p>We would like to invite you to interview for the <strong>{{jobTitle}}</strong> role at {{companyName}}.</p>
      <p><strong>Round:</strong> {{interviewRound}}<br />
      <strong>Date:</strong> {{interviewDate}}<br />
      <strong>Time:</strong> {{interviewStartTime}} - {{interviewEndTime}} {{interviewTimezone}}<br />
      <strong>Mode:</strong> {{interviewMode}}</p>
      <p><strong>Meeting link or location:</strong> {{meetingLink}}{{interviewLocation}}</p>
      <p><strong>Interviewers:</strong> {{interviewerNames}}</p>
      <p>{{interviewInstructions}}</p>
      <p>Please reply to this email if you need any changes.</p>
      <p>Regards,<br />{{senderName}}</p>
    `),
    textBody:
      "Hello {{candidateFirstName}},\n\nWe would like to invite you to interview for {{jobTitle}} at {{companyName}}.\nRound: {{interviewRound}}\nDate: {{interviewDate}}\nTime: {{interviewStartTime}} - {{interviewEndTime}} {{interviewTimezone}}\nMode: {{interviewMode}}\nMeeting link or location: {{meetingLink}}{{interviewLocation}}\nInterviewers: {{interviewerNames}}\n\n{{interviewInstructions}}\n\nRegards,\n{{senderName}}"
  },
  {
    name: "Interview Reminder",
    slug: "interview-reminder",
    category: "Interview Reminder",
    subject: "Reminder: {{interviewRound}} for {{jobTitle}}",
    htmlBody: baseHtml(`
      <p>Hello {{candidateFirstName}},</p>
      <p>This is a reminder for your upcoming interview for <strong>{{jobTitle}}</strong>.</p>
      <p>{{interviewDate}}, {{interviewStartTime}} - {{interviewEndTime}} {{interviewTimezone}}</p>
      <p>{{meetingLink}}{{interviewLocation}}</p>
      <p>Regards,<br />{{senderName}}</p>
    `),
    textBody:
      "Hello {{candidateFirstName}},\n\nThis is a reminder for your upcoming {{interviewRound}} for {{jobTitle}} on {{interviewDate}}, {{interviewStartTime}} - {{interviewEndTime}} {{interviewTimezone}}.\n{{meetingLink}}{{interviewLocation}}\n\nRegards,\n{{senderName}}"
  },
  {
    name: "Interview Rescheduled",
    slug: "interview-rescheduled",
    category: "Interview Rescheduled",
    subject: "Interview Rescheduled - {{jobTitle}} at {{companyName}}",
    htmlBody: baseHtml(`
      <p>Hello {{candidateFirstName}},</p>
      <p>Your interview for <strong>{{jobTitle}}</strong> has been rescheduled.</p>
      <p><strong>New time:</strong> {{interviewDate}}, {{interviewStartTime}} - {{interviewEndTime}} {{interviewTimezone}}</p>
      <p><strong>Mode:</strong> {{interviewMode}}<br />{{meetingLink}}{{interviewLocation}}</p>
      <p>Regards,<br />{{senderName}}</p>
    `),
    textBody:
      "Hello {{candidateFirstName}},\n\nYour interview for {{jobTitle}} has been rescheduled to {{interviewDate}}, {{interviewStartTime}} - {{interviewEndTime}} {{interviewTimezone}}.\nMode: {{interviewMode}}\n{{meetingLink}}{{interviewLocation}}\n\nRegards,\n{{senderName}}"
  },
  {
    name: "Interview Cancelled",
    slug: "interview-cancelled",
    category: "Interview Cancelled",
    subject: "Interview Cancelled - {{jobTitle}} at {{companyName}}",
    htmlBody: baseHtml(`
      <p>Hello {{candidateFirstName}},</p>
      <p>Your interview for <strong>{{jobTitle}}</strong> has been cancelled.</p>
      <p>Our team will follow up separately if a new conversation is needed.</p>
      <p>Regards,<br />{{senderName}}</p>
    `),
    textBody:
      "Hello {{candidateFirstName}},\n\nYour interview for {{jobTitle}} at {{companyName}} has been cancelled. Our team will follow up separately if needed.\n\nRegards,\n{{senderName}}"
  },
  {
    name: "Shortlist Notification",
    slug: "shortlist-notification",
    category: "Shortlisted",
    subject: "Update on your {{jobTitle}} application",
    htmlBody: baseHtml(`
      <p>Hello {{candidateFirstName}},</p>
      <p>Thank you for your interest in the <strong>{{jobTitle}}</strong> role. We are pleased to let you know that your application has been shortlisted for the next stage.</p>
      <p>Our team will contact you with next steps.</p>
      <p>Regards,<br />{{senderName}}</p>
    `),
    textBody:
      "Hello {{candidateFirstName}},\n\nThank you for your interest in {{jobTitle}}. Your application has been shortlisted for the next stage. Our team will contact you with next steps.\n\nRegards,\n{{senderName}}"
  },
  {
    name: "Rejection Notification",
    slug: "rejection-notification",
    category: "Rejected",
    subject: "Update on your {{jobTitle}} application",
    htmlBody: baseHtml(`
      <p>Hello {{candidateFirstName}},</p>
      <p>Thank you for taking the time to apply for the <strong>{{jobTitle}}</strong> role at {{companyName}}.</p>
      <p>After careful review, we will not be moving forward with your application for this role at this time.</p>
      <p>We appreciate your interest and wish you the best in your search.</p>
      <p>Regards,<br />{{senderName}}</p>
    `),
    textBody:
      "Hello {{candidateFirstName}},\n\nThank you for applying for {{jobTitle}} at {{companyName}}. After careful review, we will not be moving forward with your application for this role at this time.\n\nWe appreciate your interest and wish you the best.\n\nRegards,\n{{senderName}}"
  },
  {
    name: "Selection Notification",
    slug: "selection-notification",
    category: "Selected",
    subject: "Selection update for {{jobTitle}} at {{companyName}}",
    htmlBody: baseHtml(`
      <p>Hello {{candidateFirstName}},</p>
      <p>We are pleased to let you know that you have been selected to move forward for the <strong>{{jobTitle}}</strong> role.</p>
      <p>Our team will contact you with next steps and any required documentation.</p>
      <p>Regards,<br />{{senderName}}</p>
    `),
    textBody:
      "Hello {{candidateFirstName}},\n\nWe are pleased to let you know that you have been selected to move forward for {{jobTitle}}. Our team will contact you with next steps.\n\nRegards,\n{{senderName}}"
  },
  {
    name: "On Hold Notification",
    slug: "on-hold-notification",
    category: "On Hold",
    subject: "Update on your {{jobTitle}} application",
    htmlBody: baseHtml(`
      <p>Hello {{candidateFirstName}},</p>
      <p>Your application for <strong>{{jobTitle}}</strong> is currently on hold while our team completes review.</p>
      <p>We will contact you if there is a change in status.</p>
      <p>Regards,<br />{{senderName}}</p>
    `),
    textBody:
      "Hello {{candidateFirstName}},\n\nYour application for {{jobTitle}} is currently on hold while our team completes review. We will contact you if there is a change in status.\n\nRegards,\n{{senderName}}"
  },
  {
    name: "Custom Follow Up",
    slug: "custom-follow-up",
    category: "Follow Up",
    subject: "Following up on your {{jobTitle}} application",
    htmlBody: baseHtml(`
      <p>Hello {{candidateFirstName}},</p>
      <p>We are following up about your application for <strong>{{jobTitle}}</strong> at {{companyName}}.</p>
      <p>Please reply to this email if you have any questions.</p>
      <p>Regards,<br />{{senderName}}</p>
    `),
    textBody:
      "Hello {{candidateFirstName}},\n\nWe are following up about your application for {{jobTitle}} at {{companyName}}. Please reply to this email if you have any questions.\n\nRegards,\n{{senderName}}"
  }
];
