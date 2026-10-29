ALTER TYPE "CaseOrigin" ADD VALUE 'GHERKIN';
ALTER TABLE "TestCase"
  ADD COLUMN "format" TEXT NOT NULL DEFAULT 'STEPS',
  ADD COLUMN "gherkinSource" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "gherkinOriginalSource" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "gherkinKey" TEXT,
  ADD COLUMN "gherkinLanguage" TEXT NOT NULL DEFAULT 'pt',
  ADD COLUMN "requirementRef" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "automationRef" TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX "TestCase_projectId_gherkinKey_key" ON "TestCase"("projectId", "gherkinKey");
CREATE OR REPLACE FUNCTION qa_case_definition_before_write() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW."searchText" := concat_ws(' ', NEW."title", NEW."description", NEW."preconditions", NEW."expectedResult", NEW."steps"::text, array_to_string(NEW."tags", ' '), NEW."gherkinSource", NEW."requirementRef", NEW."automationRef");
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
