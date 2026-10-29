import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { afterAll, expect, it } from "vitest";
import { db } from "@/lib/db";

const execute = promisify(execFile);
const email = `seed-integration-${randomUUID()}@example.test`;
const password = `Seed-${randomUUID()}`;

afterAll(async () => {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (user) {
    const projects = await db.project.findMany({
      where: { workspace: { ownerId: user.id } },
      select: { id: true },
    });
    const projectIds = projects.map((project) => project.id);
    await db.$transaction(async (tx) => {
      await tx.bug.deleteMany({ where: { projectId: { in: projectIds } } });
      await tx.testResult.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await tx.testRun.deleteMany({ where: { projectId: { in: projectIds } } });
      await tx.testCase.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await tx.project.deleteMany({ where: { id: { in: projectIds } } });
      await tx.user.delete({ where: { id: user.id } });
    });
  }
  await db.$disconnect();
});

it("seed usa Better Auth, cria 3 projetos/2 clientes e é idempotente", async () => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "development",
    DEMO_EMAIL: email,
    DEMO_PASSWORD: password,
  };
  const args = [
    path.resolve("node_modules/tsx/dist/cli.mjs"),
    path.resolve("prisma/seed.ts"),
  ];
  await execute(process.execPath, args, {
    cwd: process.cwd(),
    env,
    timeout: 30_000,
  });
  const user = await db.user.findUniqueOrThrow({
    where: { email },
    include: { accounts: true },
  });
  expect(
    user.accounts.some(
      (account) =>
        account.providerId === "credential" &&
        (account.password?.length ?? 0) > 40,
    ),
  ).toBe(true);
  const projects = await db.project.findMany({
    where: { workspace: { ownerId: user.id } },
    orderBy: { id: "asc" },
  });
  expect(projects).toHaveLength(3);
  expect(new Set(projects.map((project) => project.clientName)).size).toBe(2);
  const ids = projects.map((project) => project.id);
  expect(await db.testCase.count({ where: { projectId: { in: ids } } })).toBe(
    12,
  );
  expect(await db.testRun.count({ where: { projectId: { in: ids } } })).toBe(6);
  expect(await db.bug.count({ where: { projectId: { in: ids } } })).toBe(6);
  await execute(process.execPath, args, {
    cwd: process.cwd(),
    env,
    timeout: 30_000,
  });
  const repeated = await db.project.findMany({
    where: { workspace: { ownerId: user.id } },
    orderBy: { id: "asc" },
  });
  expect(repeated.map((project) => project.id)).toEqual(ids);
  expect(await db.testRun.count({ where: { projectId: { in: ids } } })).toBe(6);
  expect(await db.bug.count({ where: { projectId: { in: ids } } })).toBe(6);
}, 60_000);
