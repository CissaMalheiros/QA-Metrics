ALTER TABLE "TestRun" ADD COLUMN "creationKey" TEXT, ADD COLUMN "creationHash" TEXT;
CREATE UNIQUE INDEX "TestRun_projectId_creationKey_key" ON "TestRun"("projectId", "creationKey");
