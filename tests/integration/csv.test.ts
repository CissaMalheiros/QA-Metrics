import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createProject, createRun, getRun } from "@/server/services";
import { exportCSV, importCSV, inspectCSV, previewCSV } from "@/server/csv";
import { saveFeature } from "@/server/gherkin";

const user = `csv-${randomUUID()}`;
const foreign = `csv-foreign-${randomUUID()}`;
let projectId: string;
const source = readFileSync("tests/fixtures/cases.csv", "utf8");
const mapping = { externalId: "Identificador", title: "Nome", steps: "Etapas", expectedResult: "Esperado", priority: "Prioridade", suite: "Pasta", tags: "Tags" };
beforeAll(async () => {
  await db.user.createMany({ data: [user, foreign].map(id => ({ id, name: "QA CSV", email: `${id}@example.test` })) });
  projectId = (await createProject(user, { name: "CSV de QA", clientName: "Cliente" })).id;
});
afterAll(async () => {
  await db.testResult.deleteMany({ where: { projectId } });
  await db.testRun.deleteMany({ where: { projectId } });
  await db.testCase.deleteMany({ where: { projectId } });
  await db.testSuite.updateMany({ where: { projectId }, data: { parentId: null } });
  await db.testSuite.deleteMany({ where: { projectId } });
  await db.project.deleteMany({ where: { id: projectId } });
  await db.user.deleteMany({ where: { id: { in: [user, foreign] } } });
  await db.$disconnect();
});

it("pré-visualiza sem gravar, mapeia colunas e cria hierarquia em uma transação", async () => {
  const before = await db.testCase.count({ where: { projectId } });
  const inspection = await inspectCSV(user, projectId, { source });
  expect(inspection).toMatchObject({ records: 2, delimiter: ";" });
  const preview = await previewCSV(user, projectId, { source, mapping, mode: "CREATE" });
  expect(preview.valid).toBe(true);
  expect(preview.newSuites).toBe(3);
  expect(await db.testCase.count({ where: { projectId } })).toBe(before);
  expect(await importCSV(user, projectId, { source, mapping, mode: "CREATE" })).toMatchObject({ imported: 2, created: 2, updated: 0 });
  expect(await db.testSuite.count({ where: { projectId } })).toBe(3);
  expect(await db.testCase.findFirstOrThrow({ where: { projectId, externalKey: "csv:checkout-001" } })).toMatchObject({ origin: "CSV", priority: "HIGH", tags: ["smoke", "regressao"], steps: ["Abrir carrinho", "Confirmar pedido"] });
});

it("reconcilia por ID externo, mantém códigos e preserva snapshot anterior", async () => {
  const original = await db.testCase.findFirstOrThrow({ where: { projectId, externalKey: "csv:checkout-001" } });
  const run = await createRun(user, projectId, { name: "Antes do CSV", testCaseIds: [original.id] });
  const changed = source.replace("Validar compra", "Validar compra revisada");
  const result = await importCSV(user, projectId, { source: changed, mapping, mode: "UPSERT" });
  expect(result).toMatchObject({ created: 0, updated: 2 });
  const current = await db.testCase.findUniqueOrThrow({ where: { id: original.id } });
  expect(current.number).toBe(original.number);
  expect(current.revision).toBe(original.revision + 1);
  expect((await getRun(user, projectId, run.id)).results[0].caseTitle).toBe("Validar compra");
});

it("informa erros por linha e rejeita o lote inteiro, inclusive suítes novas", async () => {
  const invalid = "title,steps,expectedResult,suite\nCaso válido,Verificar,Correto,Pasta Nova\nCaso inválido,Verificar,,Outra Pasta\n";
  const map = { title: "title", steps: "steps", expectedResult: "expectedResult", suite: "suite" };
  const before = await db.testCase.count({ where: { projectId } });
  const preview = await previewCSV(user, projectId, { source: invalid, mapping: map, mode: "CREATE" });
  expect(preview.valid).toBe(false);
  expect(preview.rows[1]).toMatchObject({ line: 3, action: "ERROR" });
  expect(preview.rows[1].errors[0]).toContain("resultado esperado");
  await expect(importCSV(user, projectId, { source: invalid, mapping: map, mode: "CREATE" })).rejects.toMatchObject({ status: 400 });
  expect(await db.testCase.count({ where: { projectId } })).toBe(before);
  expect(await db.testSuite.count({ where: { projectId, name: "Pasta Nova" } })).toBe(0);
});

it("preserva uma fonte BDD iniciada com tag ao exportar e reimportar CSV", async () => {
  const feature = "@id:csv-bdd\nFeature: CSV BDD\n Scenario: Keep source\n  Given valid input\n  Then valid output\n";
  const created = (await saveFeature(user, projectId, { source: feature, assignments: [{ index: 0, targetNumber: null }] })).cases[0];
  const output = await exportCSV(user, projectId, { q: `TC-${created.number}`, state: "ALL" });
  expect(output).toContain("apostrophe-v1");
  const inspected = await inspectCSV(user, projectId, { source: output });
  expect((await previewCSV(user, projectId, { source: output, mapping: inspected.mapping, mode: "UPSERT" })).valid).toBe(true);
  await importCSV(user, projectId, { source: output, mapping: inspected.mapping, mode: "UPSERT" });
  const after = await db.testCase.findUniqueOrThrow({ where: { id: created.id } });
  expect(after.gherkinSource).toBe(feature);
  expect(after.number).toBe(created.number);
});

it("não permite acessar CSV ou atualizar casos de outro projeto por identificadores manipulados", async () => {
  await expect(inspectCSV(foreign, projectId, { source })).rejects.toMatchObject({ status: 404 });
  await expect(exportCSV(foreign, projectId, {})).rejects.toMatchObject({ status: 404 });
  await expect(importCSV(foreign, projectId, { source, mapping, mode: "CREATE" })).rejects.toMatchObject({ status: 404 });
  await expect(previewCSV(user, projectId, { source, mapping: { projectId: "Identificador" }, mode: "CREATE" })).rejects.toThrow();
  await expect(previewCSV(user, projectId, { source, mapping: { title: "coluna inexistente" }, mode: "CREATE" })).rejects.toMatchObject({ status: 400 });
});

it("preserva fonte original sem tags geradas ao reimportar uma exportação sem mudanças", async () => {
  const raw = "Feature: Original\n Scenario: Preserve original\n  Given input\n  Then output\n";
  const created = (await saveFeature(user, projectId, { source: raw, assignments: [{ index: 0, targetNumber: null }] })).cases[0];
  const output = await exportCSV(user, projectId, { q: `TC-${created.number}`, state: "ALL" });
  const inspected = await inspectCSV(user, projectId, { source: output });
  await importCSV(user, projectId, { source: output, mapping: inspected.mapping, mode: "UPSERT" });
  const after = await db.testCase.findUniqueOrThrow({ where: { id: created.id } });
  expect(after.gherkinOriginalSource).toBe(raw);
  expect(after.revision).toBe(created.revision);
});

it("rejeita IDs duplicados e não usa título para conciliação silenciosa", async () => {
  const duplicate = "externalId,title,steps,expectedResult\nsame,Caso um,Verificar,Correto\nsame,Caso dois,Verificar,Correto\n";
  const inspected = await inspectCSV(user, projectId, { source: duplicate });
  const preview = await previewCSV(user, projectId, { source: duplicate, mapping: inspected.mapping, mode: "CREATE" });
  expect(preview.valid).toBe(false);
  expect(preview.rows[1].errors[0]).toContain("repetida");
  const withoutKey = "title,steps,expectedResult\nValidar compra,Verificar,Correto\n";
  const own = await inspectCSV(user, projectId, { source: withoutKey });
  const keyed = await previewCSV(user, projectId, { source: withoutKey, mapping: own.mapping, mode: "UPSERT" });
  expect(keyed.valid).toBe(false);
});
