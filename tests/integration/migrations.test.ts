import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";

it("aplica a migração de auditoria sobre o MVP sem alterar registros históricos", async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const schema = `migration_${randomUUID().replaceAll("-", "")}`;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query(readFileSync("prisma/migrations/202610290001_initial/migration.sql", "utf8"));
    await client.query(`
      INSERT INTO "User" (id, name, email, "updatedAt") VALUES ('u', 'Migration QA', 'migration@example.test', now());
      INSERT INTO "Workspace" (id, name, "ownerId") VALUES ('w', 'Workspace', 'u');
      INSERT INTO "Project" (id, "workspaceId", name, "clientName", "updatedAt") VALUES ('p', 'w', 'Projeto', 'Cliente', now());
      INSERT INTO "TestCase" (id, "projectId", title, "updatedAt") VALUES ('c', 'p', 'Caso original', now());
      INSERT INTO "TestRun" (id, "projectId", name, status) VALUES ('r', 'p', 'Ciclo histórico', 'COMPLETED');
      INSERT INTO "TestResult" (id, "projectId", "runId", "testCaseId", "caseTitle", "caseSnapshot", status) VALUES ('x', 'p', 'r', 'c', 'Caso original', '{"steps":["Passo original"]}', 'FAILED');
    `);
    const before = (await client.query('SELECT row_to_json(r) AS value FROM "TestResult" r')).rows;
    await client.query(readFileSync("prisma/migrations/202610290002_audit/migration.sql", "utf8"));
    expect((await client.query('SELECT row_to_json(r) AS value FROM "TestResult" r')).rows).toEqual(before);
    await client.query(`INSERT INTO "AuditLog" (id, "workspaceId", "projectId", "actorId", action) VALUES ('a', 'w', 'p', 'u', 'MIGRATION_VERIFIED')`);
    expect((await client.query('SELECT COUNT(*)::int AS count FROM "AuditLog"')).rows[0].count).toBe(1);
    await client.query(readFileSync("prisma/migrations/202610290003_case_library/migration.sql", "utf8"));
    expect((await client.query('SELECT row_to_json(r) AS value FROM "TestResult" r')).rows).toEqual(before);
    expect((await client.query('SELECT "number", "revision" FROM "TestCase" WHERE id = $1', ['c'])).rows[0]).toEqual({ number: 1, revision: 1 });
    expect((await client.query('SELECT snapshot FROM "TestCaseRevision" WHERE "testCaseId" = $1', ['c'])).rows[0].snapshot.title).toBe("Caso original");
    await client.query(readFileSync("prisma/migrations/202610290004_gherkin/migration.sql", "utf8"));
    expect((await client.query('SELECT row_to_json(r) AS value FROM "TestResult" r')).rows).toEqual(before);
    expect((await client.query('SELECT format FROM "TestCase" WHERE id = $1', ['c'])).rows[0].format).toBe("STEPS");
    await client.query(readFileSync("prisma/migrations/202610290005_csv_origin/migration.sql", "utf8"));
    await client.query(readFileSync("prisma/migrations/202610290006_execution_context/migration.sql", "utf8"));
    await client.query(readFileSync("prisma/migrations/202610290007_test_planning/migration.sql", "utf8"));
    expect((await client.query('SELECT row_to_json(r)::jsonb - \'position\' - \'category\' AS value FROM "TestResult" r')).rows).toEqual(before);
    await client.query(readFileSync("prisma/migrations/202610290008_manual_execution/migration.sql", "utf8"));
    await client.query(readFileSync("prisma/migrations/202610290009_run_idempotency/migration.sql", "utf8"));
    expect((await client.query('SELECT "snapshot" FROM "ResultEvent" WHERE "resultId" = $1', ['x'])).rows[0].snapshot).toMatchObject({ status: "FAILED", notes: "", executedAt: null });
    expect((await client.query('SELECT "caseSnapshot" FROM "TestResult" WHERE id = $1', ['x'])).rows[0].caseSnapshot).toEqual(before[0].value.caseSnapshot);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
