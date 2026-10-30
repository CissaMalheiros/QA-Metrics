import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireProject, withProject, importJUnit } from "@/server/services";
import { ServiceError } from "@/server/errors";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const selection = { id: true, name: true, prefix: true, expiresAt: true, revokedAt: true, createdAt: true, lastUsedAt: true } as const;
export async function listTokens(userId: string, projectId: string) { await requireProject(userId, projectId); return db.integrationToken.findMany({ where: { projectId }, select: selection, orderBy: { createdAt: "desc" } }); }
export async function createToken(userId: string, projectId: string, input: unknown) {
  const data = z.object({ name: z.string().trim().min(1).max(100), days: z.number().int().min(1).max(365).default(30) }).strict().parse(input);
  return withProject(userId, projectId, "INTEGRATION_TOKEN_CREATED", async client => {
    if (await client.integrationToken.count({ where: { projectId, revokedAt: null, expiresAt: { gt: new Date() } } }) >= 20) throw new ServiceError(409, "Revogue tokens antigos antes de criar outro (limite 20). ");
    const secret = `qm_${randomBytes(32).toString("hex")}`;
    const token = await client.integrationToken.create({ data: { projectId, name: data.name, hash: digest(secret), prefix: secret.slice(0, 11), expiresAt: new Date(Date.now() + data.days * 86400000) }, select: selection });
    return { ...token, secret };
  });
}
export async function revokeToken(userId: string, projectId: string, id: string) { return withProject(userId, projectId, "INTEGRATION_TOKEN_REVOKED", async client => {
  if (!await client.integrationToken.findFirst({ where: { id, projectId } })) throw new ServiceError(404, "Token não encontrado.");
  return client.integrationToken.update({ where: { id }, data: { revokedAt: new Date() }, select: selection });
}); }
export async function authorizeIntegration(header: string | null) {
  if (!header || !/^Bearer qm_[a-f0-9]{64}$/.test(header)) throw new ServiceError(401, "Token de integração inválido.");
  return db.$transaction(async client => {
    const hash = digest(header.slice(7));
    await client.$queryRaw`SELECT id FROM "IntegrationToken" WHERE hash = ${hash} FOR UPDATE`;
    const token = await client.integrationToken.findUnique({ where: { hash }, include: { project: { include: { workspace: { select: { ownerId: true } } } } } });
    if (!token || token.revokedAt || token.expiresAt <= new Date()) throw new ServiceError(401, "Token expirado ou revogado.");
    const reset = Date.now() - token.windowStart.getTime() >= 3600000;
    if (!reset && token.requests >= 60) throw new ServiceError(429, "Limite de 60 relatórios por hora por token.");
    await client.integrationToken.update({ where: { id: token.id }, data: { requests: reset ? 1 : { increment: 1 }, ...(reset ? { windowStart: new Date() } : {}), lastUsedAt: new Date() } });
    return { projectId: token.projectId, userId: token.project.workspace.ownerId };
  });
}
const text = (max: number) => z.string().trim().max(max).default("");
const metadata = z.object({ provider: z.enum(["jenkins", "github-actions", "other"]), externalRunId: z.string().trim().min(1).max(250), pipeline: text(200), build: text(120), branch: text(200), commit: z.string().trim().regex(/^(?:[a-fA-F0-9]{7,64})?$/).default(""), environment: text(120), release: text(80), buildUrl: text(2000).refine(value => { if (!value) return true; try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; } }), startedAt: z.iso.datetime().optional(), finishedAt: z.iso.datetime().optional() }).strict().refine(value => !value.startedAt || !value.finishedAt || Date.parse(value.finishedAt) >= Date.parse(value.startedAt), "Datas da execução inválidas.");
export async function ingestJUnit(identity: { userId: string; projectId: string }, input: Buffer, fields: unknown) {
  const data = metadata.parse(fields);
  return importJUnit(identity.userId, identity.projectId, input, `${data.pipeline || data.provider} · ${data.build || data.externalRunId}`, data);
}

export async function automationHealth(userId: string, projectId: string) {
  await requireProject(userId, projectId);
  const runs = await db.testRun.findMany({ where: { projectId, integrationProvider: { not: null }, status: "COMPLETED" }, orderBy: { createdAt: "desc" }, take: 20, include: { results: true } });
  const groups = new Map<string, { testCaseId: string; title: string; branch: string; environmentId: string | null; statuses: string[] }>();
  for (const run of runs) for (const result of run.results) {
    if (!["PASSED", "FAILED"].includes(result.status)) continue;
    const key = JSON.stringify([result.testCaseId, run.branch, run.environmentId]);
    const group = groups.get(key) ?? { testCaseId: result.testCaseId, title: result.caseTitle, branch: run.branch, environmentId: run.environmentId, statuses: [] };
    group.statuses.push(result.status); groups.set(key, group);
  }
  const unstable = [...groups.values()].filter(group => group.statuses.length >= 3 && group.statuses.slice(1).filter((status, index) => status !== group.statuses[index]).length >= 2);
  return { sampledRuns: runs.length, unstable, runs: runs.map(run => ({ id: run.id, name: run.name, build: run.build, branch: run.branch, commit: run.commit, buildUrl: run.buildUrl, createdAt: run.createdAt, failed: run.results.filter(result => result.status === "FAILED").length })) };
}
