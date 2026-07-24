const trendInsight = (label, metric) => {
  if (!metric || metric.direction === "unavailable" || metric.change === 0) return null;
  const verb = metric.direction === "up" ? "increased" : "decreased";
  const severity = metric.direction === "up" ? "positive" : "info";
  return {
    severity,
    message: `${label} ${verb} by ${Math.abs(metric.changePercent || 0)}% compared with the previous period.`
  };
};

export const generateAnalyticsInsights = ({
  overview = {},
  skills = {},
  interviews = {},
  jobs = {},
  emails = {}
} = {}) => {
  const insights = [];
  const applications = trendInsight("Applications", overview.newApplications);
  if (applications) insights.push(applications);

  const missingSkill = skills?.mostMissingRequiredSkills?.[0];
  if (missingSkill?.skill) {
    insights.push({
      severity: "warning",
      message: `${missingSkill.skill} is the most frequently missing required skill.`
    });
  }

  if ((interviews.interviewsMissingFeedback || 0) > 0) {
    insights.push({
      severity: "warning",
      message: `${interviews.interviewsMissingFeedback} interviews are missing feedback.`
    });
  }

  const inactiveJobs = jobs?.jobs?.filter((job) => job.status === "Active" && job.applicationsInRange === 0).length || 0;
  if (inactiveJobs > 0) {
    insights.push({
      severity: "warning",
      message: `${inactiveJobs} active jobs received no applications in the selected period.`
    });
  }

  if ((emails.failed || 0) > 0) {
    insights.push({
      severity: (emails.failureRate || 0) > 20 ? "critical" : "warning",
      message: `${emails.failed} emails failed in the selected period.`
    });
  }

  if ((overview.emailDeliveryRate?.value || 0) >= 95) {
    insights.push({
      severity: "positive",
      message: "Email delivery rate is healthy for the selected period."
    });
  }

  return insights.slice(0, 8);
};
