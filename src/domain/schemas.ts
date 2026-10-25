import * as z from "zod/v4";
import { ERROR_CODES } from "./errors.js";

export const sourceTypeSchema = z.enum(["web", "demo", "image_web_detection"]);
export const matchConfidenceSchema = z.enum(["high", "medium", "low", "unknown"]);
export const riskLevelSchema = z.enum(["low", "moderate", "high", "critical_review", "unknown"]);
export const authorRelationSchema = z.enum(["self", "other", "unknown"]);
export const evidenceSourceSchema = z.enum([
  "title",
  "snippet",
  "page_text",
  "user_confirmed",
  "image_provider",
]);
export const signalConfidenceSchema = z.enum(["high", "medium", "low"]);

export const signalSchema = z.object({
  code: z.string().min(1).max(80),
  category: z.string().min(1).max(80),
  description: z.string().min(1).max(300),
  evidenceSource: evidenceSourceSchema,
  confidence: signalConfidenceSchema,
});

export const searchResultSchema = z.object({
  id: z.string().min(1).max(80),
  sourceType: sourceTypeSchema,
  provider: z.string().min(1).max(80),
  title: z.string().min(1).max(300),
  url: z.string().url().max(2000),
  domain: z.string().min(1).max(253),
  snippet: z.string().max(500).optional(),
  publishedAt: z.string().max(40).optional(),
  retrievedAt: z.string().min(1).max(40),
  isDemo: z.boolean(),
});

export const findingSchema = z.object({
  id: z.string().min(1).max(80),
  auditId: z.string().min(1).max(80),
  sourceType: sourceTypeSchema,
  title: z.string().min(1).max(300),
  url: z.string().url().max(2000),
  domain: z.string().min(1).max(253),
  snippet: z.string().max(500).optional(),
  matchConfidence: matchConfidenceSchema,
  riskScore: z.number().int().min(0).max(100).nullable(),
  riskLevel: riskLevelSchema,
  signals: z.array(signalSchema).max(40),
  reasons: z.array(z.string().max(300)).max(20),
  unknowns: z.array(z.string().max(300)).max(20),
  authorRelation: authorRelationSchema,
  erasureRoute: z.string().max(80).optional(),
  recommendedNextSteps: z.array(z.string().max(300)).max(12),
  verificationRequired: z.boolean(),
  isDemo: z.boolean(),
  urgentHumanSupport: z.boolean(),
});

export const partialFailureSchema = z.object({
  provider: z.string().min(1).max(80),
  code: z.enum(ERROR_CODES),
  message: z.string().min(1).max(300),
  retryable: z.boolean(),
});

export const auditSummarySchema = z.object({
  low: z.number().int().nonnegative(),
  moderate: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
  criticalReview: z.number().int().nonnegative(),
  needsManualReview: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
});

export const auditResultSchema = z.object({
  auditId: z.string().min(1).max(80),
  mode: z.enum(["live", "demo"]),
  provider: z.string().min(1).max(80),
  searchedAt: z.string().min(1).max(40),
  queriesExecutedCount: z.number().int().nonnegative(),
  totalResults: z.number().int().nonnegative(),
  findings: z.array(findingSchema).max(200),
  summary: auditSummarySchema,
  partialFailures: z.array(partialFailureSchema).max(40),
  coverageNotice: z.string().min(1).max(500),
  nextSteps: z.array(z.string().max(300)).max(12),
});

export const toolFailureSchema = z.object({
  ok: z.literal(false),
  errorCode: z.enum(ERROR_CODES),
  message: z.string(),
  retryable: z.boolean(),
  nextAction: z.string(),
});

export type SearchResult = z.infer<typeof searchResultSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type AuditResult = z.infer<typeof auditResultSchema>;
export type Signal = z.infer<typeof signalSchema>;
