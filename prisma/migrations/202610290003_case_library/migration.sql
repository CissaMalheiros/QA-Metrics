ALTER TABLE "Project" ADD COLUMN "nextCaseNumber" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "TestSuite" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "parentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TestSuite_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TestSuite_id_projectId_key" UNIQUE ("id", "projectId"),
  CONSTRAINT "TestSuite_parentId_projectId_fkey" FOREIGN KEY ("parentId", "projectId") REFERENCES "TestSuite"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "TestSuite_projectId_parentId_idx" ON "TestSuite"("projectId", "parentId");
ALTER TABLE "TestCase"
  ADD COLUMN "number" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "suiteId" TEXT,
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "type" TEXT NOT NULL DEFAULT 'FUNCTIONAL',
  ADD COLUMN "state" TEXT NOT NULL DEFAULT 'READY',
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "updatedBy" TEXT,
  ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '';
-- Assign existing definitions once, preserving their IDs and historical snapshots.
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "createdAt", "id") AS n FROM "TestCase"
) UPDATE "TestCase" c SET "number" = numbered.n FROM numbered WHERE c."id" = numbered."id";
UPDATE "Project" p SET "nextCaseNumber" = COALESCE((SELECT MAX(c."number") + 1 FROM "TestCase" c WHERE c."projectId" = p."id"), 1);
UPDATE "TestCase" SET "searchText" = concat_ws(' ', "title", "description", "preconditions", "expectedResult", "steps"::text, array_to_string("tags", ' '));
ALTER TABLE "TestCase"
  ADD CONSTRAINT "TestCase_projectId_number_key" UNIQUE ("projectId", "number"),
  ADD CONSTRAINT "TestCase_number_positive" CHECK ("number" > 0),
  ADD CONSTRAINT "TestCase_suiteId_projectId_fkey" FOREIGN KEY ("suiteId", "projectId") REFERENCES "TestSuite"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "TestCase_projectId_state_suiteId_idx" ON "TestCase"("projectId", "state", "suiteId");
CREATE INDEX "TestCase_tags_gin_idx" ON "TestCase" USING GIN ("tags");
CREATE TABLE "TestCaseRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "testCaseId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TestCaseRevision_testCaseId_revision_key" UNIQUE ("testCaseId", "revision"),
  CONSTRAINT "TestCaseRevision_testCaseId_projectId_fkey" FOREIGN KEY ("testCaseId", "projectId") REFERENCES "TestCase"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TestCaseRevision_projectId_testCaseId_idx" ON "TestCaseRevision"("projectId", "testCaseId");
INSERT INTO "TestCaseRevision" ("id", "projectId", "testCaseId", "revision", "snapshot", "createdAt")
  SELECT "id" || ':1', "projectId", "id", 1, to_jsonb(c), "updatedAt" FROM "TestCase" c;

-- A project row lock allocates codes safely for services, seeds and bulk imports.
CREATE FUNCTION qa_case_definition_before_write() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW."searchText" := concat_ws(' ', NEW."title", NEW."description", NEW."preconditions", NEW."expectedResult", NEW."steps"::text, array_to_string(NEW."tags", ' '));
  IF TG_OP = 'INSERT' THEN
    UPDATE "Project" SET "nextCaseNumber" = "nextCaseNumber" + 1 WHERE "id" = NEW."projectId"
      RETURNING "nextCaseNumber" - 1 INTO NEW."number";
    NEW."revision" := 1;
  ELSE
    IF NEW."projectId" <> OLD."projectId" OR NEW."number" <> OLD."number" THEN
      RAISE EXCEPTION 'Test case identity cannot change';
    END IF;
    IF (to_jsonb(NEW) - 'updatedAt' - 'updatedBy' - 'revision') IS DISTINCT FROM (to_jsonb(OLD) - 'updatedAt' - 'updatedBy' - 'revision') THEN
      NEW."revision" := OLD."revision" + 1;
    ELSE NEW."revision" := OLD."revision";
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qa_case_definition_before_write BEFORE INSERT OR UPDATE ON "TestCase" FOR EACH ROW EXECUTE FUNCTION qa_case_definition_before_write();
CREATE FUNCTION qa_case_revision_after_write() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "TestCaseRevision" ("id", "projectId", "testCaseId", "revision", "snapshot", "actorId")
    VALUES (NEW."id" || ':' || NEW."revision", NEW."projectId", NEW."id", NEW."revision", to_jsonb(NEW), NEW."updatedBy")
    ON CONFLICT ("testCaseId", "revision") DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER qa_case_revision_after_write AFTER INSERT OR UPDATE ON "TestCase" FOR EACH ROW EXECUTE FUNCTION qa_case_revision_after_write();
