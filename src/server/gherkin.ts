import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { CASE_STATES, CASE_TYPES, PRIORITIES } from "@/domain/schemas";
import { featureWithKeys, GherkinImportError, originalFeatureSource, parseFeature } from "@/importers/gherkin";
import { requireProject, validateSuiteId, withProject } from "@/server/services";
import { ServiceError } from "@/server/errors";
import { caseCode } from "@/domain/cases";

const sourceSchema = z.string().max(102400);
function parse(source: string) {
  try { return parseFeature(source); }
  catch (error) { if (error instanceof GherkinImportError) throw new ServiceError(400, error.message); throw error; }
}
function internalNumber(key: string | null) {
  if (!key || !/^TC-\d+$/.test(key)) return null;
  const number = Number(key.slice(3));
  return Number.isSafeInteger(number) && number > 0 && number <= 2147483647 ? number : null;
}

export async function previewFeature(userId: string, projectId: string, input: unknown) {
  await requireProject(userId, projectId);
  const { source } = z.object({ source: sourceSchema }).parse(input);
  const preview = parse(source);
  const keys = preview.scenarios.flatMap(value => value.key ? [value.key] : []);
  const numbers = keys.flatMap(key => internalNumber(key) ?? []);
  const cases = await db.testCase.findMany({ where: { projectId, OR: [{ gherkinKey: { in: keys } }, { number: { in: numbers } }] }, select: { id: true, number: true, title: true, gherkinKey: true } });
  return { ...preview, scenarios: preview.scenarios.map(value => ({ ...value,
    matchedCase: cases.find(testCase => testCase.gherkinKey === value.key && value.key !== null) ?? cases.find(testCase => testCase.number === internalNumber(value.key)) ?? null,
  })) };
}

export async function saveFeature(userId: string, projectId: string, input: unknown) {
  const data = z.object({
    source: sourceSchema,
    assignments: z.array(z.object({ index: z.number().int().min(0).max(199), targetNumber: z.number().int().positive().max(2147483647).nullable() })).min(1).max(200),
    suiteId: z.string().max(128).nullable().optional(),
    priority: z.enum(PRIORITIES).optional(), type: z.enum(CASE_TYPES).optional(), state: z.enum(CASE_STATES).optional(),
  }).parse(input);
  const preview = parse(data.source);
  if (new Set(data.assignments.map(value => value.index)).size !== data.assignments.length)
    throw new ServiceError(400, "Selecione cada cenário apenas uma vez.");
  return withProject(userId, projectId, "FEATURE_SAVED", async client => {
    await validateSuiteId(client, projectId, data.suiteId);
    const keys = preview.scenarios.map(value => value.key ?? `qa:${randomUUID()}`);
    const targets = new Map<number, Awaited<ReturnType<typeof client.testCase.findFirstOrThrow>>>();
    const targetIds = new Set<string>();
    for (const assignment of data.assignments) {
      const scenario = preview.scenarios[assignment.index];
      if (!scenario) throw new ServiceError(400, "Cenário inexistente na fonte enviada.");
      const existing = scenario.key ? await client.testCase.findFirst({ where: { projectId, gherkinKey: scenario.key } }) : null;
      if (assignment.targetNumber !== null) {
        const target = await client.testCase.findFirst({ where: { projectId, number: assignment.targetNumber } });
        if (!target) throw new ServiceError(400, "O código de destino não existe neste projeto.");
        if (existing && existing.id !== target.id) throw new ServiceError(409, "A chave BDD já está vinculada a outro caso. Concilie a identidade antes de salvar.");
        if (targetIds.has(target.id)) throw new ServiceError(400, "Dois cenários não podem substituir o mesmo caso.");
        targetIds.add(target.id); targets.set(assignment.index, target);
        keys[assignment.index] = scenario.key ?? target.gherkinKey ?? keys[assignment.index];
      } else if (existing || internalNumber(scenario.key) && await client.testCase.findFirst({ where: { projectId, number: internalNumber(scenario.key)! } })) {
        throw new ServiceError(409, "Já existe um caso com esta identidade. Selecione seu código para atualizar a definição, preservando o histórico.");
      }
    }
    const canonical = featureWithKeys(data.source, preview.scenarios, keys);
    const parsed = parse(canonical);
    const saved = [];
    for (const assignment of data.assignments) {
      const scenario = parsed.scenarios[assignment.index];
      const target = targets.get(assignment.index);
      const previousTags = target?.format === "BDD" ? parse(target.gherkinSource).scenarios.find(value => value.key === target.gherkinKey)?.tags.map(tag => tag.slice(1).toLowerCase()) ?? [] : [];
      const tags = [...new Set([...(target?.tags.filter(tag => !previousTags.includes(tag)) ?? []), ...scenario.tags.map(tag => tag.slice(1).toLowerCase())])];
      if (tags.length > 30) throw new ServiceError(400, "Use até 30 tags combinadas entre a classificação e o Gherkin.");
      const fields = {
        title: z.string().min(1).max(200, "O nome do cenário deve ter até 200 caracteres.").parse(scenario.name),
        description: scenario.description, preconditions: scenario.background.join("\n"),
        steps: scenario.steps, expectedResult: scenario.expectedResult,
        // shortcut: cases retain the full source file; deduplicate documents if measured storage growth requires it.
        format: "BDD", gherkinSource: canonical, gherkinOriginalSource: originalFeatureSource(data.source, target),
        gherkinKey: keys[assignment.index], gherkinLanguage: parsed.language,
        tags,
        requirementRef: scenario.requirementRef, automationRef: scenario.automationRef, updatedBy: userId,
        ...(data.suiteId !== undefined ? { suiteId: data.suiteId || null } : {}),
        ...(data.priority ? { priority: data.priority } : {}), ...(data.type ? { type: data.type } : {}), ...(data.state ? { state: data.state } : {}),
      };
      saved.push(target
        ? await client.testCase.update({ where: { id: target.id }, data: fields })
        : await client.testCase.create({ data: { ...fields, projectId, origin: "GHERKIN" } }));
    }
    return { cases: saved, saved: saved.length, source: canonical };
  });
}

export async function exportFeature(userId: string, projectId: string, caseId: string) {
  await requireProject(userId, projectId);
  const testCase = await db.testCase.findFirst({ where: { id: caseId, projectId, format: "BDD" } });
  if (!testCase) throw new ServiceError(404, "Caso BDD não encontrado.");
  return { source: testCase.gherkinSource, name: `${caseCode(testCase.number)}.feature` };
}
