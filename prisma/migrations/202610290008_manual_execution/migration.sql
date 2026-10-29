ALTER TABLE "TestResult" ADD COLUMN "actualResult" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "executorId" TEXT, ADD COLUMN "executorName" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "draft" JSONB;
CREATE TABLE "ResultEvent" (
  "id" TEXT PRIMARY KEY, "resultId" TEXT NOT NULL, "projectId" TEXT NOT NULL,
  "version" INTEGER NOT NULL, "actorId" TEXT, "actorName" TEXT,
  "operationId" TEXT, "requestHash" TEXT, "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResultEvent_resultId_projectId_fkey" FOREIGN KEY ("resultId", "projectId") REFERENCES "TestResult"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ResultEvent_resultId_version_key" ON "ResultEvent"("resultId", "version");
CREATE UNIQUE INDEX "ResultEvent_resultId_operationId_key" ON "ResultEvent"("resultId", "operationId");
-- Preserve existing results as the baseline for every later correction.
INSERT INTO "ResultEvent" ("id", "resultId", "projectId", "version", "snapshot")
SELECT 'baseline:' || "id", "id", "projectId", 0,
  jsonb_build_object('status', "status", 'notes', "notes", 'actualResult', "actualResult", 'durationMs', "durationMs", 'executedAt', "executedAt", 'executorId', NULL, 'executorName', NULL, 'draft', NULL)
FROM "TestResult";
ALTER TABLE "Bug" ADD COLUMN "creationKey" TEXT, ADD COLUMN "creationHash" TEXT;
CREATE UNIQUE INDEX "Bug_projectId_creationKey_key" ON "Bug"("projectId", "creationKey");
