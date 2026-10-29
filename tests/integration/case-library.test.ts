import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCase, createProject, createRun, getRun, updateCase } from "@/server/services";
import { bulkUpdateCases, duplicateCase, getCaseLibrary, listCaseRevisions, saveSuite } from "@/server/case-library";

const user = `library-${randomUUID()}`;
const foreignUser = `library-foreign-${randomUUID()}`;
let projectId: string;
let otherProjectId: string;
const input = { title: "Validar checkout", steps: ["Comprar produto com cupom especial"], expectedResult: "Pedido registrado", tags: ["Smoke"], priority: "HIGH" };

beforeAll(async () => {
  await db.user.createMany({ data: [user, foreignUser].map(id => ({ id, name: "QA Library", email: `${id}@example.test` })) });
  projectId = (await createProject(user, { name: "Biblioteca", clientName: "Cliente A" })).id;
  otherProjectId = (await createProject(foreignUser, { name: "Biblioteca externa", clientName: "Cliente B" })).id;
});
afterAll(async () => {
  await db.testResult.deleteMany({ where: { projectId: { in: [projectId, otherProjectId] } } });
  await db.testRun.deleteMany({ where: { projectId: { in: [projectId, otherProjectId] } } });
  await db.testCase.deleteMany({ where: { projectId: { in: [projectId, otherProjectId] } } });
  await db.testSuite.updateMany({ where: { projectId: { in: [projectId, otherProjectId] } }, data: { parentId: null } });
  await db.testSuite.deleteMany({ where: { projectId: { in: [projectId, otherProjectId] } } });
  await db.project.deleteMany({ where: { id: { in: [projectId, otherProjectId] } } });
  await db.user.deleteMany({ where: { id: { in: [user, foreignUser] } } });
  await db.$disconnect();
});

it("gera códigos estáveis e distintos sob concorrência, inclusive para inserts de seed/importação", async () => {
  const cases = await Promise.all(Array.from({ length: 5 }, () => createCase(user, projectId, input)));
  expect(new Set(cases.map(value => value.number)).size).toBe(5);
  const first = cases[0];
  await updateCase(user, projectId, first.id, { title: "Renomeado sem trocar o código" });
  expect((await db.testCase.findUniqueOrThrow({ where: { id: first.id } })).number).toBe(first.number);
  const fixture = await db.testCase.create({ data: { projectId, title: "Seed direto", steps: [] } });
  expect(fixture.number).toBeGreaterThan(Math.max(...cases.map(value => value.number)));
  expect(await db.testCaseRevision.count({ where: { testCaseId: fixture.id } })).toBe(1);
});

it("mantém revisões e snapshots antigos ao editar ou arquivar uma definição", async () => {
  const testCase = await createCase(user, projectId, input);
  const run = await createRun(user, projectId, { name: "Snapshot original", testCaseIds: [testCase.id] });
  await updateCase(user, projectId, testCase.id, { title: "Título atual", state: "ARCHIVED" });
  const revisions = await listCaseRevisions(user, projectId, testCase.id);
  expect(revisions.map(value => value.revision)).toEqual([2, 1]);
  expect(revisions[1].snapshot).toMatchObject({ title: input.title, state: "READY" });
  expect((await getRun(user, projectId, run.id)).results[0].caseSnapshot).toMatchObject({ title: input.title, revision: 1 });
  await expect(createRun(user, projectId, { name: "Não executar arquivado", testCaseIds: [testCase.id] })).rejects.toThrow();
  const duplicate = await duplicateCase(user, projectId, testCase.id);
  expect(duplicate.id).not.toBe(testCase.id);
  expect(duplicate.number).not.toBe(testCase.number);
  expect(duplicate.state).toBe("DRAFT");
});

it("impede ciclos de pastas e referências cruzadas tanto no serviço quanto no PostgreSQL", async () => {
  const root = await saveSuite(user, projectId, { name: "Checkout" });
  const child = await saveSuite(user, projectId, { name: "Pagamento", parentId: root.id });
  const external = await saveSuite(foreignUser, otherProjectId, { name: "Privada" });
  await expect(saveSuite(user, projectId, { name: "Ciclo", parentId: child.id }, root.id)).rejects.toMatchObject({ status: 400 });
  await expect(createCase(user, projectId, { ...input, suiteId: external.id })).rejects.toMatchObject({ status: 400 });
  await expect(db.testCase.create({ data: { projectId, title: "Referência cruzada", suiteId: external.id } })).rejects.toMatchObject({ code: "P2003" });
  await expect(getCaseLibrary(foreignUser, projectId, {})).rejects.toMatchObject({ status: 404 });
  await expect(listCaseRevisions(foreignUser, projectId, "qualquer-id")).rejects.toMatchObject({ status: 404 });
});

it("valida o lote inteiro antes de alterar qualquer caso", async () => {
  const own = await createCase(user, projectId, input);
  const foreign = await createCase(foreignUser, otherProjectId, input);
  await expect(bulkUpdateCases(user, projectId, { ids: [own.id, foreign.id], changes: { state: "ARCHIVED" } })).rejects.toThrow();
  expect((await db.testCase.findUniqueOrThrow({ where: { id: own.id } })).state).toBe("READY");
  await bulkUpdateCases(user, projectId, { ids: [own.id], changes: { tags: ["regressao"], priority: "CRITICAL" } });
  expect((await listCaseRevisions(user, projectId, own.id))[0].snapshot).toMatchObject({ priority: "CRITICAL", tags: ["regressao"] });
});

it("combina filtros e busca conteúdo, inclusive passos, com paginação em dados representativos", async () => {
  const suite = await saveSuite(user, projectId, { name: "Volume representativo" });
  await db.testCase.createMany({ data: Array.from({ length: 240 }, (_, index) => ({
    projectId, suiteId: suite.id, title: `Validação ${index}`, priority: "HIGH" as const,
    steps: ["Cupom especial localizado no conteúdo"], type: "API", tags: ["smoke"],
  })) });
  const query = { q: "cupom especial", suiteId: suite.id, priority: "HIGH", origin: "MANUAL", type: "API", tag: "@smoke", state: "READY" };
  const first = await getCaseLibrary(user, projectId, query);
  const second = await getCaseLibrary(user, projectId, { ...query, page: 2 });
  expect(first.total).toBe(240);
  expect(first.cases).toHaveLength(50);
  expect(new Set([...first.cases, ...second.cases].map(value => value.id)).size).toBe(100);
  expect((await getCaseLibrary(user, projectId, { q: `TC-${first.cases[0].number}`, state: "ALL" })).cases[0].id).toBe(first.cases[0].id);
});
