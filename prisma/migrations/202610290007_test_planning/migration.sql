ALTER TYPE "RunStatus" ADD VALUE 'DRAFT';
ALTER TYPE "RunStatus" ADD VALUE 'CANCELED';
CREATE TABLE "TestPlan" (
  "id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '', "archived" BOOLEAN NOT NULL DEFAULT false,
  "revision" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TestPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TestPlan_id_projectId_key" ON "TestPlan"("id", "projectId");
CREATE INDEX "TestPlan_projectId_archived_idx" ON "TestPlan"("projectId", "archived");
CREATE TABLE "TestPlanItem" (
  "id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL, "planId" TEXT NOT NULL, "testCaseId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL, "caseSnapshot" JSONB NOT NULL, "position" INTEGER NOT NULL,
  "category" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "TestPlanItem_planId_projectId_fkey" FOREIGN KEY ("planId", "projectId") REFERENCES "TestPlan"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TestPlanItem_testCaseId_projectId_fkey" FOREIGN KEY ("testCaseId", "projectId") REFERENCES "TestCase"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TestPlanItem_planId_testCaseId_key" ON "TestPlanItem"("planId", "testCaseId");
CREATE UNIQUE INDEX "TestPlanItem_planId_position_key" ON "TestPlanItem"("planId", "position");
ALTER TABLE "TestRun" ALTER COLUMN "startedAt" DROP NOT NULL;
ALTER TABLE "TestRun"
  ADD COLUMN "planId" TEXT, ADD COLUMN "environmentId" TEXT, ADD COLUMN "releaseId" TEXT,
  ADD COLUMN "build" TEXT NOT NULL DEFAULT '', ADD COLUMN "responsibleId" TEXT,
  ADD COLUMN "scheduledStart" TIMESTAMP(3), ADD COLUMN "scheduledEnd" TIMESTAMP(3),
  ADD COLUMN "notes" TEXT NOT NULL DEFAULT '', ADD COLUMN "entryCriteria" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "exitCriteria" TEXT NOT NULL DEFAULT '', ADD COLUMN "contextSnapshot" JSONB NOT NULL DEFAULT '{}',
  ADD CONSTRAINT "TestRun_planId_projectId_fkey" FOREIGN KEY ("planId", "projectId") REFERENCES "TestPlan"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TestRun_environmentId_projectId_fkey" FOREIGN KEY ("environmentId", "projectId") REFERENCES "Environment"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TestRun_releaseId_projectId_fkey" FOREIGN KEY ("releaseId", "projectId") REFERENCES "Release"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TestResult" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "category" TEXT NOT NULL DEFAULT '';
