import { z } from "zod";
import {
  ACCOUNT_STATUSES,
  ANALYTICS_EXPORT_TYPES,
  ANALYTICS_GROUPINGS,
  ANALYTICS_JOB_SORTS,
  ANALYTICS_PRESETS
} from "../constants/analyticsConstants.js";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");
const emptyToUndefined = (value) => (value === "" || value === null ? undefined : value);

export const analyticsQuerySchema = z
  .object({
    preset: z.enum(ANALYTICS_PRESETS).optional(),
    dateFrom: z.preprocess(emptyToUndefined, z.string().trim().optional()),
    dateTo: z.preprocess(emptyToUndefined, z.string().trim().optional()),
    timezone: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()),
    comparePrevious: z.coerce.boolean().optional().default(false),
    jobId: z.preprocess(emptyToUndefined, objectId.optional()),
    department: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
    recruiterId: z.preprocess(emptyToUndefined, objectId.optional()),
    status: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(10),
    sort: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()),
    grouping: z.enum(ANALYTICS_GROUPINGS).optional().default("day"),
    minOccurrence: z.coerce.number().int().min(1).max(100).optional().default(1),
    search: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional())
  })
  .strict();

export const analyticsJobQuerySchema = analyticsQuerySchema.extend({
  sort: z.enum(ANALYTICS_JOB_SORTS).optional().default("most-applications")
});

export const analyticsExportQuerySchema = analyticsQuerySchema.extend({
  reportType: z.enum(ANALYTICS_EXPORT_TYPES),
  format: z.enum(["csv", "json"]).optional().default("csv")
});

export const jobAnalyticsParamsSchema = z.object({
  jobId: objectId
});

export const adminListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(10),
    search: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
    status: z.preprocess(emptyToUndefined, z.enum(ACCOUNT_STATUSES).optional()),
    role: z.preprocess(emptyToUndefined, z.enum(["admin", "hr"]).optional()),
    industry: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
    companyId: z.preprocess(emptyToUndefined, objectId.optional()),
    action: z.preprocess(emptyToUndefined, z.string().trim().max(160).optional()),
    entityType: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()),
    actorId: z.preprocess(emptyToUndefined, objectId.optional()),
    dateFrom: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
    dateTo: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
    sort: z.preprocess(emptyToUndefined, z.enum(["newest", "oldest", "name", "most-users"]).optional().default("newest"))
  })
  .strict();

export const adminIdParamsSchema = z.object({
  id: objectId
});

export const accountStatusUpdateSchema = z
  .object({
    status: z.enum(ACCOUNT_STATUSES),
    reason: z.string().trim().min(3).max(1000)
  })
  .strict();
