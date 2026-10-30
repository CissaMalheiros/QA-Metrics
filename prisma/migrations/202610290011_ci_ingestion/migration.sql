-- AlterTable
ALTER TABLE "TestRun" ADD COLUMN     "branch" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "buildUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "commit" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "externalRunId" TEXT,
ADD COLUMN     "integrationPayloadHash" TEXT,
ADD COLUMN     "integrationProvider" TEXT,
ADD COLUMN     "pipeline" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "reportSha256" TEXT;

-- CreateTable
CREATE TABLE "IntegrationToken" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationToken_hash_key" ON "IntegrationToken"("hash");

-- CreateIndex
CREATE INDEX "IntegrationToken_projectId_idx" ON "IntegrationToken"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "TestRun_projectId_integrationProvider_externalRunId_key" ON "TestRun"("projectId", "integrationProvider", "externalRunId");

-- AddForeignKey
ALTER TABLE "IntegrationToken" ADD CONSTRAINT "IntegrationToken_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
