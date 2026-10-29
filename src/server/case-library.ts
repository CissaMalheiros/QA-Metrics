import { z } from "zod";
import { db } from "@/lib/db";
import { CASE_ORIGINS, CASE_STATES, CASE_TYPES, PRIORITIES, testCaseUpdateSchema } from "@/domain/schemas";
import { requireProject, validateSuiteId, withProject } from "@/server/services";
import { ServiceError } from "@/server/errors";
import { randomUUID } from "node:crypto";
import { replaceFeatureKey } from "@/importers/gherkin";

const id = z.string().trim().min(1).max(128);
const suiteSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da suíte.").max(120),
  parentId: z.union([id, z.literal("")]).nullable().optional().transform(value => value || null),
});
const querySchema = z.object({
  q: z.string().trim().max(200).default(""),
  suiteId: z.string().max(128).default(""),
  priority: z.union([z.enum(PRIORITIES), z.literal("")]).default(""),
  origin: z.union([z.enum(CASE_ORIGINS), z.literal("")]).default(""),
  type: z.union([z.enum(CASE_TYPES), z.literal("")]).default(""),
  format: z.union([z.enum(["STEPS", "BDD"]), z.literal("")]).default(""),
  state: z.union([z.enum(CASE_STATES), z.literal("ALL")]).default("READY"),
  tag: z.string().trim().max(50).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});

export async function getCaseLibrary(userId: string, projectId: string, input: unknown) {
  await requireProject(userId, projectId);
  const query = querySchema.parse(input);
  const code = /^TC-(\d+)$/i.exec(query.q)?.[1];
  const where = {
    projectId,
    ...(query.suiteId ? { suiteId: query.suiteId === "none" ? null : query.suiteId } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.origin ? { origin: query.origin } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.format ? { format: query.format } : {}),
    ...(query.state !== "ALL" ? { state: query.state } : {}),
    ...(query.tag ? { tags: { has: query.tag.replace(/^@/, "").toLowerCase() } } : {}),
    ...(query.q ? { OR: [
      { searchText: { contains: query.q, mode: "insensitive" as const } },
      ...(code && Number.isSafeInteger(Number(code)) && Number(code) <= 2147483647 ? [{ number: Number(code) }] : []),
    ] } : {}),
  };
  const [cases, total, suites] = await Promise.all([
    db.testCase.findMany({ where, orderBy: { number: "asc" }, skip: (query.page - 1) * 50, take: 50 }),
    db.testCase.count({ where }),
    db.testSuite.findMany({ where: { projectId }, orderBy: { name: "asc" } }),
  ]);
  return { cases, total, page: query.page, pageSize: 50, suites };
}

export async function saveSuite(userId: string, projectId: string, input: unknown, suiteId?: string) {
  const data = suiteSchema.parse(input);
  return withProject(userId, projectId, suiteId ? "SUITE_UPDATED" : "SUITE_CREATED", async client => {
    if (suiteId && !await client.testSuite.findFirst({ where: { id: suiteId, projectId } }))
      throw new ServiceError(404, "Suíte não encontrada.");
    const seen = new Set(suiteId ? [suiteId] : []);
    let parentId = data.parentId;
    while (parentId) {
      if (seen.has(parentId) || seen.size >= 20) throw new ServiceError(400, "A hierarquia não pode conter ciclos ou mais de 20 níveis.");
      seen.add(parentId);
      const parent = await client.testSuite.findFirst({ where: { id: parentId, projectId } });
      if (!parent) throw new ServiceError(400, "A pasta superior deve pertencer ao mesmo projeto.");
      parentId = parent.parentId;
    }
    return suiteId
      ? client.testSuite.update({ where: { id: suiteId }, data })
      : client.testSuite.create({ data: { ...data, projectId } });
  });
}

export async function deleteSuite(userId: string, projectId: string, suiteId: string) {
  return withProject(userId, projectId, "SUITE_DELETED", async client => {
    const suite = await client.testSuite.findFirst({ where: { id: suiteId, projectId }, include: { _count: { select: { cases: true, children: true } } } });
    if (!suite) throw new ServiceError(404, "Suíte não encontrada.");
    if (suite._count.cases || suite._count.children) throw new ServiceError(409, "Mova os casos e subpastas antes de excluir a suíte.");
    await client.testSuite.delete({ where: { id: suiteId } });
    return { id: suiteId, deleted: true };
  });
}

export async function bulkUpdateCases(userId: string, projectId: string, input: unknown) {
  const { ids, changes } = z.object({
    ids: z.array(id).min(1).max(1000).refine(values => new Set(values).size === values.length),
    changes: testCaseUpdateSchema.pick({ priority: true, type: true, state: true, tags: true, suiteId: true }).strict().refine(value => Object.keys(value).length > 0, "Escolha uma alteração."),
  }).parse(input);
  return withProject(userId, projectId, "CASES_BULK_UPDATED", async client => {
    if (await client.testCase.count({ where: { projectId, id: { in: ids } } }) !== ids.length)
      throw new ServiceError(400, "Todos os casos selecionados devem pertencer a este projeto.");
    await validateSuiteId(client, projectId, changes.suiteId);
    await client.testCase.updateMany({ where: { projectId, id: { in: ids } }, data: { ...changes, updatedBy: userId } });
    return { updated: ids.length };
  });
}

export async function duplicateCase(userId: string, projectId: string, caseId: string) {
  return withProject(userId, projectId, "CASE_DUPLICATED", async client => {
    const source = await client.testCase.findFirst({ where: { id: caseId, projectId } });
    if (!source) throw new ServiceError(404, "Caso de teste não encontrado.");
    const key = `qa:${randomUUID()}`;
    return client.testCase.create({ data: {
      projectId, title: `${source.title.slice(0, 190)} (cópia)`, description: source.description,
      preconditions: source.preconditions, steps: source.steps ?? [], expectedResult: source.expectedResult,
      priority: source.priority, origin: source.origin, suiteId: source.suiteId, tags: source.tags,
      type: source.type, state: "DRAFT", updatedBy: userId,
      ...(source.format === "BDD" && source.gherkinKey ? {
        format: "BDD", gherkinKey: key, gherkinLanguage: source.gherkinLanguage,
        gherkinSource: replaceFeatureKey(source.gherkinSource, source.gherkinKey, key),
        gherkinOriginalSource: source.gherkinOriginalSource, requirementRef: source.requirementRef,
        automationRef: source.automationRef,
        tags: source.tags.map(tag => tag === source.gherkinKey!.toLowerCase() ? key : tag),
      } : {}),
    } });
  });
}

export async function listCaseRevisions(userId: string, projectId: string, caseId: string) {
  await requireProject(userId, projectId);
  if (!await db.testCase.findFirst({ where: { id: caseId, projectId }, select: { id: true } }))
    throw new ServiceError(404, "Caso de teste não encontrado.");
  return db.testCaseRevision.findMany({ where: { projectId, testCaseId: caseId }, orderBy: { revision: "desc" }, take: 100 });
}
