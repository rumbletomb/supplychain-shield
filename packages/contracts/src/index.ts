import { z } from "zod";

export const severitySchema = z.enum(["critical", "high", "medium", "low", "info"]);
export type Severity = z.infer<typeof severitySchema>;

export const categorySchema = z.enum(["vulnerability", "secret", "license", "configuration"]);
export type FindingCategory = z.infer<typeof categorySchema>;

export const locationSchema = z.object({
  path: z.string().min(1),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
});
export type FindingLocation = z.infer<typeof locationSchema>;

export const findingSchema = z.object({
  fingerprint: z.string().min(8),
  ruleId: z.string().min(1),
  engine: z.string().min(1),
  category: categorySchema,
  severity: severitySchema,
  title: z.string().min(1),
  description: z.string().min(1),
  remediation: z.string().min(1),
  location: locationSchema.optional(),
  packageName: z.string().optional(),
  installedVersion: z.string().optional(),
  fixedVersion: z.string().optional(),
  advisoryUrl: z.string().url().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type Finding = z.infer<typeof findingSchema>;

export const scanStatusSchema = z.enum([
  "queued",
  "running",
  "passed",
  "warned",
  "failed",
  "errored",
  "cancelled",
]);
export type ScanStatus = z.infer<typeof scanStatusSchema>;

export const policySchema = z.object({
  version: z.literal(1),
  blockAt: severitySchema.default("high"),
  warnAt: severitySchema.default("medium"),
  blockVerifiedSecrets: z.boolean().default(true),
  deniedLicenses: z.array(z.string()).default([]),
  ignoredRules: z.array(z.string()).default([]),
});
export type Policy = z.infer<typeof policySchema>;

export const defaultPolicy: Policy = {
  version: 1,
  blockAt: "high",
  warnAt: "medium",
  blockVerifiedSecrets: true,
  deniedLicenses: [],
  ignoredRules: [],
};

export const scanJobSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("github"),
    scanId: z.string().min(1),
    installationId: z.number().int().positive(),
    owner: z.string().min(1),
    repository: z.string().min(1),
    sha: z.string().min(7),
    checkRunId: z.number().int().positive().optional(),
  }),
  z.object({
    source: z.literal("local"),
    scanId: z.string().min(1),
    path: z.string().min(1),
  }),
]);
export type ScanJob = z.infer<typeof scanJobSchema>;

export interface ScanResult {
  findings: Finding[];
  status: ScanStatus;
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  sbom: Record<string, unknown>;
  durationMs: number;
}
