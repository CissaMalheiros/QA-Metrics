-- AlterTable
ALTER TABLE "Bug" ADD COLUMN     "actualResult" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "expectedResult" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "fixedInBuild" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "history" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "responsibleId" TEXT;

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "bugId" TEXT,
    "resultId" TEXT,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BugRetest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BugRetest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Evidence_projectId_idx" ON "Evidence"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "BugRetest_resultId_key" ON "BugRetest"("resultId");

-- CreateIndex
CREATE UNIQUE INDEX "Bug_id_projectId_key" ON "Bug"("id", "projectId");

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_bugId_projectId_fkey" FOREIGN KEY ("bugId", "projectId") REFERENCES "Bug"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_resultId_projectId_fkey" FOREIGN KEY ("resultId", "projectId") REFERENCES "TestResult"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugRetest" ADD CONSTRAINT "BugRetest_bugId_projectId_fkey" FOREIGN KEY ("bugId", "projectId") REFERENCES "Bug"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugRetest" ADD CONSTRAINT "BugRetest_resultId_projectId_fkey" FOREIGN KEY ("resultId", "projectId") REFERENCES "TestResult"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
