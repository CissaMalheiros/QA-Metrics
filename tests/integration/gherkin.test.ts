import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCase, createProject, createRun, updateCase } from "@/server/services";
import { duplicateCase } from "@/server/case-library";
import { exportFeature, previewFeature, saveFeature } from "@/server/gherkin";
import { parseFeature } from "@/importers/gherkin";

const user = `bdd-${randomUUID()}`;
const stranger = `bdd-stranger-${randomUUID()}`;
let projectId: string;
const source = readFileSync("tests/fixtures/login.feature", "utf8");
beforeAll(async () => {
  await db.user.createMany({ data: [user, stranger].map(id => ({ id, name: "QA BDD", email: `${id}@example.test` })) });
  projectId = (await createProject(user, { name: "BDD Português", clientName: "Cliente" })).id;
});
afterAll(async () => {
  await db.testResult.deleteMany({ where: { projectId } });
  await db.testRun.deleteMany({ where: { projectId } });
  await db.testCase.deleteMany({ where: { projectId } });
  await db.project.deleteMany({ where: { id: projectId } });
  await db.user.deleteMany({ where: { id: { in: [user, stranger] } } });
  await db.$disconnect();
});

it("importa, edita e exporta português por chave estável sem mudar resultados antigos", async () => {
  const first = await saveFeature(user, projectId, { source, assignments: [{ index: 0, targetNumber: null }] });
  const testCase = first.cases[0];
  expect(testCase).toMatchObject({ format: "BDD", origin: "GHERKIN", gherkinLanguage: "pt", requirementRef: "REQ-LOGIN", automationRef: "login-principal" });
  const run = await createRun(user, projectId, { name: "Execução manual BDD", testCaseIds: [testCase.id] });
  const changed = source.replace("Entrar com credenciais válidas", "Entrar e conferir o painel");
  const preview = await previewFeature(user, projectId, { source: changed });
  expect(preview.scenarios[0].matchedCase?.id).toBe(testCase.id);
  const edited = await saveFeature(user, projectId, { source: changed, assignments: [{ index: 0, targetNumber: testCase.number }] });
  expect(edited.cases[0].id).toBe(testCase.id);
  expect(edited.cases[0].revision).toBe(2);
  expect((await exportFeature(user, projectId, testCase.id)).source).toBe(changed);
  const old = await db.testResult.findFirstOrThrow({ where: { runId: run.id } });
  expect(old.caseSnapshot).toMatchObject({ title: "Entrar com credenciais válidas", gherkinSource: source });
  await expect(updateCase(user, projectId, testCase.id, { title: "Título sem alterar a fonte" })).rejects.toMatchObject({ status: 409 });
});

it("não confunde especificação BDD com execução ou automação e duplica com outra identidade", async () => {
  const original = await db.testCase.findFirstOrThrow({ where: { projectId, gherkinKey: "id:login-principal" } });
  const before = await db.testRun.count({ where: { projectId } });
  const copy = await duplicateCase(user, projectId, original.id);
  expect(copy.format).toBe("BDD");
  expect(copy.gherkinKey).not.toBe(original.gherkinKey);
  expect(parseFeature(copy.gherkinSource).scenarios[0].key).toBe(copy.gherkinKey);
  expect(await db.testRun.count({ where: { projectId } })).toBe(before);
});

it("oferece conciliação explícita sem usar título/linha e preserva classificação omitida", async () => {
  const target = await createCase(user, projectId, { title: "Caso existente", steps: ["Verificar"], expectedResult: "Correto", priority: "CRITICAL", state: "ARCHIVED", tags: ["cliente"] });
  const raw = "Feature: Reconciliation\n Scenario: Renamed\n  Given valid input\n  Then output is correct\n";
  expect((await previewFeature(user, projectId, { source: raw })).scenarios[0].matchedCase).toBeNull();
  const result = await saveFeature(user, projectId, { source: raw, assignments: [{ index: 0, targetNumber: target.number }] });
  expect(result.cases[0]).toMatchObject({ id: target.id, state: "ARCHIVED", priority: "CRITICAL", gherkinOriginalSource: raw });
  expect(result.cases[0].tags).toContain("cliente");
  expect(parseFeature(result.source).scenarios[0].key).toBe(result.cases[0].gherkinKey);
  expect((await previewFeature(user, projectId, { source: result.source })).scenarios[0].matchedCase?.id).toBe(target.id);
});

it("recusa chave duplicada, destino externo e lote inválido sem persistência parcial", async () => {
  const before = await db.testCase.count({ where: { projectId } });
  await expect(saveFeature(user, projectId, { source, assignments: [{ index: 0, targetNumber: null }] })).rejects.toMatchObject({ status: 409 });
  await expect(saveFeature(stranger, projectId, { source, assignments: [{ index: 0, targetNumber: null }] })).rejects.toMatchObject({ status: 404 });
  await expect(exportFeature(stranger, projectId, "qualquer-id")).rejects.toMatchObject({ status: 404 });
  await expect(previewFeature(stranger, projectId, { source })).rejects.toMatchObject({ status: 404 });
  const multi = "Feature: Atomic\n @id:new-atomic\n Scenario: One\n  Given step\n @id:missing-target\n Scenario: Two\n  Given step\n";
  await expect(saveFeature(user, projectId, { source: multi, assignments: [{ index: 0, targetNumber: null }, { index: 1, targetNumber: 2147483647 }] })).rejects.toThrow();
  expect(await db.testCase.count({ where: { projectId } })).toBe(before);
});
