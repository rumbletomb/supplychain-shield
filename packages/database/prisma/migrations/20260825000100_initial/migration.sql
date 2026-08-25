CREATE TYPE "ScanStatus" AS ENUM ('QUEUED', 'RUNNING', 'PASSED', 'WARNED', 'FAILED', 'ERRORED', 'CANCELLED');
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "githubLogin" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Installation" (
  "id" TEXT NOT NULL,
  "githubId" BIGINT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "suspendedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Installation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Repository" (
  "id" TEXT NOT NULL,
  "githubId" BIGINT NOT NULL,
  "owner" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "defaultBranch" TEXT NOT NULL DEFAULT 'main',
  "private" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "organizationId" TEXT NOT NULL,
  "installationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Policy" (
  "id" TEXT NOT NULL,
  "repositoryId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "blockAt" "Severity" NOT NULL DEFAULT 'HIGH',
  "warnAt" "Severity" NOT NULL DEFAULT 'MEDIUM',
  "blockVerifiedSecrets" BOOLEAN NOT NULL DEFAULT true,
  "deniedLicenses" TEXT[],
  "ignoredRules" TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Scan" (
  "id" TEXT NOT NULL,
  "repositoryId" TEXT NOT NULL,
  "pullRequest" INTEGER,
  "commitSha" TEXT NOT NULL,
  "ref" TEXT,
  "status" "ScanStatus" NOT NULL DEFAULT 'QUEUED',
  "source" TEXT NOT NULL DEFAULT 'github',
  "checkRunId" BIGINT,
  "durationMs" INTEGER,
  "errorMessage" TEXT,
  "summary" JSONB,
  "sbom" JSONB,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Finding" (
  "id" TEXT NOT NULL,
  "scanId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "engine" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "severity" "Severity" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "remediation" TEXT NOT NULL,
  "path" TEXT,
  "startLine" INTEGER,
  "packageName" TEXT,
  "installedVersion" TEXT,
  "fixedVersion" TEXT,
  "advisoryUrl" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Exception" (
  "id" TEXT NOT NULL,
  "findingId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "approvedBy" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Exception_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Artifact" (
  "id" TEXT NOT NULL,
  "scanId" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_githubLogin_key" ON "Organization"("githubLogin");
CREATE UNIQUE INDEX "Installation_githubId_key" ON "Installation"("githubId");
CREATE UNIQUE INDEX "Repository_githubId_key" ON "Repository"("githubId");
CREATE UNIQUE INDEX "Repository_fullName_key" ON "Repository"("fullName");
CREATE INDEX "Repository_organizationId_idx" ON "Repository"("organizationId");
CREATE UNIQUE INDEX "Policy_repositoryId_key" ON "Policy"("repositoryId");
CREATE INDEX "Scan_repositoryId_createdAt_idx" ON "Scan"("repositoryId", "createdAt" DESC);
CREATE INDEX "Scan_status_idx" ON "Scan"("status");
CREATE UNIQUE INDEX "Finding_scanId_fingerprint_key" ON "Finding"("scanId", "fingerprint");
CREATE INDEX "Finding_fingerprint_idx" ON "Finding"("fingerprint");
CREATE INDEX "Finding_severity_idx" ON "Finding"("severity");
CREATE INDEX "Exception_expiresAt_idx" ON "Exception"("expiresAt");
CREATE INDEX "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId", "createdAt" DESC);

ALTER TABLE "Installation" ADD CONSTRAINT "Installation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
