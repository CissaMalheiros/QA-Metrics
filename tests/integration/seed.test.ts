import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { afterAll, beforeAll, expect, it } from "vitest";
import { DEMO_EMAIL } from "@/lib/demo";

const execute = promisify(execFile);
const testUrl = process.env.DATABASE_URL!;
const databaseName = `qa_metrics_seed_${randomUUID().replaceAll("-", "")}_demo`;
const demoUrl = new URL(testUrl);
demoUrl.pathname = `/${databaseName}`;
const admin = new Client({ connectionString: testUrl });
const demoDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: demoUrl.toString() }) });
const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development", DEMO_MODE: "true", DATABASE_URL: demoUrl.toString() };
const seedArgs = [path.resolve("node_modules/tsx/dist/cli.mjs"), path.resolve("prisma/seed.ts")];
let created = false;

beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  await execute(process.execPath, [path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], { env, timeout: 30_000 });
});

afterAll(async () => {
  await demoDb.$disconnect();
  // Only drop the unique database created by this test, never the application or shared test database.
  if (created) await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await admin.end();
});

it("recusa seed desabilitado e banco sem sufixo _demo", async () => {
  for (const unsafeEnv of [{ ...env, DEMO_MODE: "false" }, { ...env, DATABASE_URL: testUrl }]) {
    await expect(execute(process.execPath, seedArgs, { env: unsafeEnv, timeout: 30_000 }))
      .rejects.toMatchObject({ stderr: expect.stringContaining("Seed demo exige DEMO_MODE=true e banco exclusivo _demo.") });
  }
  expect(await demoDb.user.count()).toBe(0);
}, 60_000);

it("cria demonstração completa com Better Auth e preserva alterações ao reiniciar", async () => {
  await execute(process.execPath, seedArgs, { env, timeout: 60_000 });
  const user = await demoDb.user.findUniqueOrThrow({ where: { email: DEMO_EMAIL }, include: { accounts: true } });
  expect(user.accounts.some(account => account.providerId === "credential" && (account.password?.length ?? 0) > 40)).toBe(true);
  const projects = await demoDb.project.findMany({ where: { workspace: { ownerId: user.id } }, orderBy: { id: "asc" } });
  expect(projects).toHaveLength(4);
  expect(new Set(projects.map(project => project.clientName)).size).toBe(3);
  const ids = projects.map(project => project.id);
  const counts = async () => Promise.all([
    demoDb.testCase.count(), demoDb.testRun.count(), demoDb.bug.count(),
    demoDb.testPlan.count(), demoDb.bugRetest.count(), demoDb.evidence.count(),
  ]);
  expect(await counts()).toEqual([80, 32, 20, 12, 8, 20]);
  const testCase = await demoDb.testCase.findFirstOrThrow();
  await demoDb.testCase.update({ where: { id: testCase.id }, data: { title: "Alteração preservada pela demonstração" } });
  await execute(process.execPath, seedArgs, { env, timeout: 60_000 });
  expect((await demoDb.project.findMany({ orderBy: { id: "asc" } })).map(project => project.id)).toEqual(ids);
  expect(await counts()).toEqual([80, 32, 20, 12, 8, 20]);
  expect((await demoDb.testCase.findUniqueOrThrow({ where: { id: testCase.id } })).title).toBe("Alteração preservada pela demonstração");
}, 120_000);
