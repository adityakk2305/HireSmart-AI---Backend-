import env from "../config/env.js";

const bearerAuth = [{ bearerAuth: [] }];

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "HireSmart AI API",
    version: env.appVersion,
    description: "Production API documentation for HireSmart AI, an AI resume screening and interview scheduling SaaS."
  },
  servers: [
    { url: `${env.backendUrl}/api/v1`, description: "Configured API v1 base URL" },
    { url: "http://localhost:5000/api/v1", description: "Local development" }
  ],
  tags: [
    { name: "Auth" },
    { name: "Jobs" },
    { name: "Candidates" },
    { name: "AI" },
    { name: "Interviews" },
    { name: "Emails" },
    { name: "Analytics" },
    { name: "Admin" },
    { name: "Health" }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    },
    schemas: {
      ApiResponse: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          statusCode: { type: "integer" },
          message: { type: "string" },
          data: { type: "object", nullable: true },
          requestId: { type: "string" },
          timestamp: { type: "string", format: "date-time" }
        }
      },
      ApiError: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          message: { type: "string" },
          requestId: { type: "string" },
          errorCode: { type: "string" },
          timestamp: { type: "string", format: "date-time" },
          errors: { type: "array", items: { type: "object" } }
        }
      }
    }
  },
  paths: {
    "/auth/register": { post: { tags: ["Auth"], summary: "Register an HR user", responses: { 201: { description: "Registered" } } } },
    "/auth/login": { post: { tags: ["Auth"], summary: "Login and receive an access token plus secure refresh cookie", responses: { 200: { description: "Logged in" } } } },
    "/auth/refresh-token": { post: { tags: ["Auth"], summary: "Rotate refresh token and issue a new access token", responses: { 200: { description: "Refreshed" } } } },
    "/auth/logout": { post: { tags: ["Auth"], summary: "Clear refresh cookie and revoke stored refresh token", responses: { 200: { description: "Logged out" } } } },
    "/auth/forgot-password": { post: { tags: ["Auth"], summary: "Request password reset", responses: { 200: { description: "Accepted" } } } },
    "/auth/reset-password/{token}": { post: { tags: ["Auth"], summary: "Reset password with one-time token", parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Reset" } } } },
    "/auth/me": { get: { tags: ["Auth"], security: bearerAuth, summary: "Get current user", responses: { 200: { description: "Current user" } } } },
    "/jobs": { get: { tags: ["Jobs"], security: bearerAuth, summary: "List company jobs", responses: { 200: { description: "Jobs" } } }, post: { tags: ["Jobs"], security: bearerAuth, summary: "Create a job", responses: { 201: { description: "Created" } } } },
    "/jobs/{id}": { get: { tags: ["Jobs"], security: bearerAuth, summary: "Get job details", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Job" } } }, put: { tags: ["Jobs"], security: bearerAuth, summary: "Update a job", responses: { 200: { description: "Updated" } } }, delete: { tags: ["Jobs"], security: bearerAuth, summary: "Delete a job", responses: { 200: { description: "Deleted" } } } },
    "/jobs/public/{slug}": { get: { tags: ["Jobs"], summary: "Get public job posting", parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Public job" } } } },
    "/candidates": { get: { tags: ["Candidates"], security: bearerAuth, summary: "List candidates", responses: { 200: { description: "Candidates" } } } },
    "/candidates/upload/{jobId}": { post: { tags: ["Candidates"], security: bearerAuth, summary: "Upload candidate resume", parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }], responses: { 201: { description: "Uploaded" } } } },
    "/candidates/apply/{jobSlug}": { post: { tags: ["Candidates"], summary: "Public job application with resume upload", parameters: [{ name: "jobSlug", in: "path", required: true, schema: { type: "string" } }], responses: { 201: { description: "Applied" } } } },
    "/candidates/{id}/parse-resume": { post: { tags: ["AI"], security: bearerAuth, summary: "Parse or force re-parse a candidate resume", responses: { 200: { description: "Parsed" } } } },
    "/candidates/{id}/ai-screen": { post: { tags: ["AI"], security: bearerAuth, summary: "Run AI candidate screening", responses: { 200: { description: "Screened" } } } },
    "/candidates/bulk-ai-screen": { post: { tags: ["AI"], security: bearerAuth, summary: "Bulk screen candidates", responses: { 200: { description: "Bulk screening complete" } } } },
    "/interviews": { get: { tags: ["Interviews"], security: bearerAuth, summary: "List interviews", responses: { 200: { description: "Interviews" } } }, post: { tags: ["Interviews"], security: bearerAuth, summary: "Schedule interview", responses: { 201: { description: "Scheduled" } } } },
    "/interviews/{id}/generate-questions": { post: { tags: ["Interviews", "AI"], security: bearerAuth, summary: "Generate mock or provider-backed interview questions", responses: { 200: { description: "Questions generated" } } } },
    "/emails/summary": { get: { tags: ["Emails"], security: bearerAuth, summary: "Email automation summary", responses: { 200: { description: "Summary" } } } },
    "/emails/manual-candidate": { post: { tags: ["Emails"], security: bearerAuth, summary: "Send manual candidate email", responses: { 200: { description: "Sent or queued" } } } },
    "/analytics/overview": { get: { tags: ["Analytics"], security: bearerAuth, summary: "Company analytics overview", responses: { 200: { description: "Overview" } } } },
    "/analytics/export": { get: { tags: ["Analytics"], security: bearerAuth, summary: "Export aggregate analytics CSV", responses: { 200: { description: "CSV" } } } },
    "/admin/analytics/overview": { get: { tags: ["Admin"], security: bearerAuth, summary: "Platform admin dashboard", responses: { 200: { description: "Overview" } } } },
    "/admin/companies": { get: { tags: ["Admin"], security: bearerAuth, summary: "List companies", responses: { 200: { description: "Companies" } } } },
    "/admin/users": { get: { tags: ["Admin"], security: bearerAuth, summary: "List users", responses: { 200: { description: "Users" } } } },
    "/admin/audit-logs": { get: { tags: ["Admin"], security: bearerAuth, summary: "List audit logs", responses: { 200: { description: "Audit logs" } } } },
    "/admin/system-health": { get: { tags: ["Admin"], security: bearerAuth, summary: "Admin system health", responses: { 200: { description: "System health" } } } },
    "/health": { get: { tags: ["Health"], summary: "Full health status", responses: { 200: { description: "Healthy" }, 503: { description: "Not healthy" } } } },
    "/health/live": { get: { tags: ["Health"], summary: "Liveness probe", responses: { 200: { description: "Live" } } } },
    "/health/ready": { get: { tags: ["Health"], summary: "Readiness probe", responses: { 200: { description: "Ready" }, 503: { description: "Not ready" } } } }
  }
};
