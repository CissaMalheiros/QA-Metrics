import { z } from "zod";
import { db } from "@/lib/db";
import { requireProject, withProject } from "@/server/services";
import { ServiceError } from "@/server/errors";
import { Prisma } from "@/generated/prisma/client";

const name = z.string().trim().min(1, "Informe o nome.").max(120);
const baseUrl = z.string().trim().max(2000).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}, "Use uma URL HTTP/HTTPS sem usuário ou senha.");
export const environmentSchema = z.object({ name, baseUrl: baseUrl.default(""), archived: z.boolean().default(false) }).strict();
export const releaseSchema = z.object({ name, version: z.string().trim().min(1, "Informe a versão.").max(80), archived: z.boolean().default(false) }).strict();

export async function getPlanning(userId: string, projectId: string) {
  const project = await requireProject(userId, projectId);
  const [environments, releases, members] = await Promise.all([
    db.environment.findMany({ where: { projectId }, orderBy: [{ archived: "asc" }, { name: "asc" }] }),
    db.release.findMany({ where: { projectId }, orderBy: [{ archived: "asc" }, { createdAt: "desc" }] }),
    db.workspaceMember.findMany({ where: { workspaceId: project.workspaceId }, select: { user: { select: { id: true, name: true } } } }),
  ]);
  return { environments, releases, members: members.map(value => value.user) };
}

export async function listPlans(userId: string, projectId: string) {
  await requireProject(userId, projectId);
  return db.testPlan.findMany({ where: { projectId }, include: { items: { orderBy: { position: "asc" } } }, orderBy: [{ archived: "asc" }, { updatedAt: "desc" }] });
}

const planSchema = z.object({
  name, description: z.string().trim().max(5000).default(""), archived: z.boolean().default(false),
  expectedRevision: z.number().int().positive().optional(),
  items: z.array(z.object({ testCaseId: z.string().min(1).max(128), revision: z.number().int().positive(), category: z.string().trim().max(120).default("") }).strict()).max(1000)
    .refine(items => new Set(items.map(value => value.testCaseId)).size === items.length, "Inclua cada caso apenas uma vez."),
}).strict();

export async function savePlan(userId: string, projectId: string, input: unknown, planId?: string) {
  const data = planSchema.parse(input);
  return withProject(userId, projectId, planId ? "PLAN_UPDATED" : "PLAN_CREATED", async client => {
    if (planId) {
      const previous = await client.testPlan.findFirst({ where: { id: planId, projectId } });
      if (!previous) throw new ServiceError(404, "Plano não encontrado.");
      if (previous.revision !== data.expectedRevision) throw new ServiceError(409, "O plano foi alterado. Recarregue antes de editar.");
    }
    const revisions = await client.testCaseRevision.findMany({ where: { projectId, OR: data.items.map(value => ({ testCaseId: value.testCaseId, revision: value.revision })) } });
    if (revisions.length !== data.items.length) throw new ServiceError(400, "Casos e revisões devem pertencer a este projeto.");
    const items = data.items.map((value, position) => ({
      ...value, position, projectId,
      caseSnapshot: revisions.find(revision => revision.testCaseId === value.testCaseId && revision.revision === value.revision)!.snapshot as Prisma.InputJsonValue,
    }));
    const fields = { name: data.name, description: data.description, archived: data.archived };
    if (planId) await client.testPlanItem.deleteMany({ where: { planId, projectId } });
    const plan = planId
      ? await client.testPlan.update({ where: { id: planId }, data: { ...fields, revision: { increment: 1 } } })
      : await client.testPlan.create({ data: { ...fields, projectId } });
    await client.testPlanItem.createMany({ data: items.map(item => ({ ...item, planId: plan.id })) });
    return client.testPlan.findUniqueOrThrow({ where: { id: plan.id }, include: { items: { orderBy: { position: "asc" } } } });
  });
}

export async function clonePlan(userId: string, projectId: string, planId: string) {
  return withProject(userId, projectId, "PLAN_CLONED", async client => {
    const plan = await client.testPlan.findFirst({ where: { id: planId, projectId }, include: { items: { orderBy: { position: "asc" } } } });
    if (!plan) throw new ServiceError(404, "Plano não encontrado.");
    const clone = await client.testPlan.create({ data: { projectId, name: `${plan.name.slice(0, 110)} (cópia)`, description: plan.description } });
    await client.testPlanItem.createMany({ data: plan.items.map(item => ({ planId: clone.id, projectId, testCaseId: item.testCaseId, revision: item.revision, category: item.category, position: item.position, caseSnapshot: item.caseSnapshot as Prisma.InputJsonValue })) });
    return client.testPlan.findUniqueOrThrow({ where: { id: clone.id }, include: { items: { orderBy: { position: "asc" } } } });
  });
}

export async function saveEnvironment(userId: string, projectId: string, input: unknown, environmentId?: string) {
  const data = environmentId
    ? z.object({ name, baseUrl, archived: z.boolean() }).partial().strict().parse(input)
    : environmentSchema.parse(input);
  return withProject(userId, projectId, environmentId ? "ENVIRONMENT_UPDATED" : "ENVIRONMENT_CREATED", async client => {
    if (environmentId) {
      if (!await client.environment.findFirst({ where: { id: environmentId, projectId } })) throw new ServiceError(404, "Ambiente não encontrado.");
      return client.environment.update({ where: { id: environmentId }, data });
    }
    return client.environment.create({ data: { ...environmentSchema.parse(data), projectId } });
  });
}

export async function saveRelease(userId: string, projectId: string, input: unknown, releaseId?: string) {
  const data = releaseId
    ? z.object({ name, version: releaseSchema.shape.version, archived: z.boolean() }).partial().strict().parse(input)
    : releaseSchema.parse(input);
  return withProject(userId, projectId, releaseId ? "RELEASE_UPDATED" : "RELEASE_CREATED", async client => {
    if (releaseId) {
      if (!await client.release.findFirst({ where: { id: releaseId, projectId } })) throw new ServiceError(404, "Versão não encontrada.");
      return client.release.update({ where: { id: releaseId }, data });
    }
    return client.release.create({ data: { ...releaseSchema.parse(data), projectId } });
  });
}
