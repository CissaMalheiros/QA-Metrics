import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createProject, deleteProject, createCase, updateCase, deleteCase, createRun, transitionRun, completeRun, updateResult, createBug, listBugs, getProject } from "@/server/services";
import { getPlanning, saveEnvironment, saveRelease, savePlan, clonePlan } from "@/server/planning";
import { calculateMetrics } from "@/domain/metrics";
import { saveFeature } from "@/server/gherkin";
import { getCaseLibrary } from "@/server/case-library";

const owner = `planning-${randomUUID()}`, other = `planning-other-${randomUUID()}`;
let projectId: string, foreignId: string;
beforeAll(async () => {
  await db.user.createMany({ data: [owner, other].map(id => ({ id, name: "QA Planning", email: `${id}@example.test` })) });
  projectId = (await createProject(owner, { name: "Planejamento A", clientName: "Cliente A" })).id;
  foreignId = (await createProject(other, { name: "Planejamento B", clientName: "Cliente B" })).id;
});
afterAll(async () => {
  await db.bug.deleteMany({ where: { projectId: { in: [projectId, foreignId] } } });
  await db.testRun.deleteMany({ where: { projectId: { in: [projectId, foreignId] } } });
  await db.testPlan.deleteMany({ where: { projectId: { in: [projectId, foreignId] } } });
  await db.project.deleteMany({ where: { id: { in: [projectId, foreignId] } } });
  await db.user.deleteMany({ where: { id: { in: [owner, other] } } });
  await db.$disconnect();
});

it("preserva revisões e ordem ao editar e clonar planos, sem acesso cruzado", async () => {
  const first = await createCase(owner, projectId, { title: "Primeiro caso", steps: ["Abrir"], expectedResult: "Pronto" });
  const second = await createCase(owner, projectId, { title: "Segundo caso", steps: ["Validar"], expectedResult: "OK" });
  const plan = await savePlan(owner, projectId, { name: "Plano ordenado", items: [{ testCaseId: second.id, revision: 1, category: "Pagamento" }, { testCaseId: first.id, revision: 1 }] });
  await expect(deleteCase(owner, projectId, first.id)).rejects.toMatchObject({ status: 409 });
  await updateCase(owner, projectId, first.id, { title: "Primeiro revisado" });
  const clone = await clonePlan(owner, projectId, plan.id);
  expect(clone.items.map(item => item.testCaseId)).toEqual([second.id, first.id]);
  expect(clone.items[1].caseSnapshot).toMatchObject({ title: "Primeiro caso", revision: 1 });
  expect(clone.items[0].category).toBe("Pagamento");
  const edited = await savePlan(owner, projectId, { name: "Plano arquivado", archived: true, expectedRevision: 1, items: [{ testCaseId: first.id, revision: 2, category: "Atualizado" }] }, plan.id);
  expect(edited.revision).toBe(2);
  expect(edited.items[0].caseSnapshot).toMatchObject({ title: "Primeiro revisado", revision: 2 });
  await expect(savePlan(owner, projectId, { name: "Escrita atrasada", expectedRevision: 1, items: [] }, plan.id)).rejects.toMatchObject({ status: 409 });
  await expect(createRun(owner, projectId, { name: "Plano arquivado", planId: plan.id })).rejects.toMatchObject({ status: 400 });
  await expect(clonePlan(other, foreignId, plan.id)).rejects.toMatchObject({ status: 404 });
  await expect(savePlan(other, foreignId, { name: "Caso estrangeiro", items: [{ testCaseId: first.id, revision: 1 }] })).rejects.toMatchObject({ status: 400 });
  await expect(savePlan(owner, projectId, { name: "Revisão inválida", items: [{ testCaseId: first.id, revision: 999 }] })).rejects.toMatchObject({ status: 400 });
  await expect(savePlan(owner, projectId, { name: "Duplicado", items: [{ testCaseId: first.id, revision: 1 }, { testCaseId: first.id, revision: 1 }] })).rejects.toThrow();
});

it("seleciona BDD por tag e mantém fonte e revisão no plano e na execução", async () => {
  const source = "# language: pt\n@smoke @regressao\nFuncionalidade: Compra BDD\n  Cenário: Comprar com sucesso\n    Dado um carrinho válido\n    Quando confirmo a compra\n    Então o pedido é criado\n";
  const result = await saveFeature(owner, projectId, { source, assignments: [{ index: 0, targetNumber: null }] });
  const filtered = await getCaseLibrary(owner, projectId, { format: "BDD", tag: "@regressao" });
  expect(filtered.cases.map(value => value.id)).toContain(result.cases[0].id);
  const plan = await savePlan(owner, projectId, { name: "Regressão BDD", items: filtered.cases.map(value => ({ testCaseId: value.id, revision: value.revision })) });
  const run = await createRun(owner, projectId, { name: "Execução do plano BDD", planId: plan.id });
  expect(run.results[0].caseSnapshot).toMatchObject({ format: "BDD", revision: 1, gherkinSource: result.cases[0].gherkinSource, tags: expect.arrayContaining(["smoke", "regressao"]) });
});

it("executa um plano em duas builds com resultados e contexto independentes", async () => {
  const testCase = await createCase(owner, projectId, { title: "Checkout histórico", steps: ["Comprar"], expectedResult: "Confirmado" });
  const plan = await savePlan(owner, projectId, { name: "Regressão checkout", items: [{ testCaseId: testCase.id, revision: 1, category: "Compra" }] });
  const environment = await saveEnvironment(owner, projectId, { name: "Staging", baseUrl: "https://staging.example.test" });
  const release = await saveRelease(owner, projectId, { name: "Checkout", version: "3.0" });
  const input = { name: "Regressão build", planId: plan.id, environmentId: environment.id, releaseId: release.id, responsibleId: owner, entryCriteria: "Ambiente disponível", exitCriteria: "Smoke aprovado", notes: "Acompanhar checkout", scheduledStart: "2026-10-29T10:00:00.000Z", scheduledEnd: "2026-10-30T10:00:00.000Z" };
  const first = await createRun(owner, projectId, { ...input, build: "100" });
  await updateCase(owner, projectId, testCase.id, { title: "Checkout novo", steps: ["Novo passo"] });
  const second = await createRun(owner, projectId, { ...input, build: "101" });
  expect(second.results[0].caseSnapshot).toMatchObject({ title: "Checkout histórico", revision: 1, steps: ["Comprar"] });
  expect(second.results[0].category).toBe("Compra");
  await updateResult(owner, projectId, first.id, first.results[0].id, { status: "FAILED", notes: "Falha da build 100" });
  await completeRun(owner, projectId, first.id);
  await updateResult(owner, projectId, second.id, second.results[0].id, { status: "PASSED" });
  await createBug(owner, projectId, { title: "Checkout falha", description: "Compra não conclui", testResultId: first.results[0].id });
  await saveEnvironment(owner, projectId, { name: "Staging renomeado", archived: true }, environment.id);
  await saveRelease(owner, projectId, { version: "3.1", archived: true }, release.id);
  const project = await getProject(owner, projectId);
  const historical = project.runs.find(run => run.id === first.id)!;
  const current = project.runs.find(run => run.id === second.id)!;
  expect(historical.contextSnapshot).toMatchObject({ build: "100", environment: { name: "Staging" }, release: { version: "3.0" }, responsible: { id: owner } });
  expect(current.contextSnapshot).toMatchObject({ build: "101" });
  expect(calculateMetrics(historical.results).passRate).toBe(0);
  expect(calculateMetrics(current.results).passRate).toBe(100);
  expect((await listBugs(owner, projectId)).find(bug => bug.testResultId === first.results[0].id)?.testResult?.run.contextSnapshot).toMatchObject({ build: "100", release: { version: "3.0" }, environment: { name: "Staging" } });
  await expect(updateResult(owner, projectId, first.id, first.results[0].id, { status: "PASSED" })).rejects.toMatchObject({ status: 409 });
  await expect(transitionRun(owner, projectId, first.id, "cancel")).rejects.toMatchObject({ status: 409 });
  await expect(createRun(owner, projectId, input)).rejects.toMatchObject({ status: 400 });
});

it("controla rascunho, início, cancelamento e datas sem alterar resultados encerrados", async () => {
  const testCase = await createCase(owner, projectId, { title: "Ciclo com estados", steps: ["Validar"], expectedResult: "OK" });
  const input = { name: "Rascunho controlado", testCaseIds: [testCase.id] };
  const draft = await createRun(owner, projectId, { ...input, draft: true });
  expect(draft.status).toBe("DRAFT"); expect(draft.startedAt).toBeNull();
  await expect(updateResult(owner, projectId, draft.id, draft.results[0].id, { status: "PASSED" })).rejects.toMatchObject({ status: 409 });
  await expect(completeRun(owner, projectId, draft.id)).rejects.toMatchObject({ status: 409 });
  expect((await transitionRun(owner, projectId, draft.id, "start")).startedAt).toBeInstanceOf(Date);
  await transitionRun(owner, projectId, draft.id, "start");
  await updateResult(owner, projectId, draft.id, draft.results[0].id, { status: "BLOCKED" });
  const canceled = await transitionRun(owner, projectId, draft.id, "cancel");
  expect(canceled.results[0].status).toBe("BLOCKED");
  await expect(completeRun(owner, projectId, draft.id)).rejects.toMatchObject({ status: 409 });
  await expect(transitionRun(owner, projectId, draft.id, "start")).rejects.toMatchObject({ status: 409 });
  await expect(updateResult(owner, projectId, draft.id, draft.results[0].id, { status: "PASSED" })).rejects.toMatchObject({ status: 409 });
  await expect(createRun(owner, projectId, { ...input, responsibleId: other })).rejects.toMatchObject({ status: 400 });
  const foreignEnv = await saveEnvironment(other, foreignId, { name: "Produção privada" });
  await expect(createRun(owner, projectId, { ...input, environmentId: foreignEnv.id })).rejects.toMatchObject({ status: 400 });
  await expect(createRun(owner, projectId, { ...input, scheduledStart: "2026-10-30T10:00:00.000Z", scheduledEnd: "2026-10-29T10:00:00.000Z" })).rejects.toThrow();
  await expect(transitionRun(other, foreignId, draft.id, "cancel")).rejects.toMatchObject({ status: 404 });
});

it("cadastra, edita e arquiva sem excluir contexto ou redefinir campos omitidos", async () => {
  const environment = await saveEnvironment(owner, projectId, { name: "QA", baseUrl: "https://qa.example.test" });
  const release = await saveRelease(owner, projectId, { name: "Checkout", version: "2.0.0" });
  expect(await saveEnvironment(owner, projectId, { archived: true }, environment.id)).toMatchObject({ name: "QA", baseUrl: "https://qa.example.test", archived: true });
  expect(await saveRelease(owner, projectId, { archived: true }, release.id)).toMatchObject({ version: "2.0.0", archived: true });
  const context = await getPlanning(owner, projectId);
  expect(context.environments).toEqual(expect.arrayContaining([expect.objectContaining({ id: environment.id, archived: true })]));
  expect(context.releases).toEqual(expect.arrayContaining([expect.objectContaining({ id: release.id, archived: true })]));
  await expect(deleteProject(owner, projectId)).rejects.toMatchObject({ status: 409 });
});

it("recusa outro usuário e referências de contexto de outro projeto", async () => {
  const external = await saveEnvironment(other, foreignId, { name: "Privado" });
  const release = await saveRelease(other, foreignId, { name: "Privada", version: "1.0" });
  await expect(getPlanning(other, projectId)).rejects.toMatchObject({ status: 404 });
  await expect(saveEnvironment(owner, projectId, { name: "Tentativa" }, external.id)).rejects.toMatchObject({ status: 404 });
  await expect(saveRelease(owner, projectId, { name: "Tentativa" }, release.id)).rejects.toMatchObject({ status: 404 });
});

it("valida URLs sem credenciais e evita versões duplicadas por projeto", async () => {
  await expect(saveEnvironment(owner, projectId, { name: "Inseguro", baseUrl: "javascript:alert(1)" })).rejects.toThrow();
  await expect(saveEnvironment(owner, projectId, { name: "Credencial", baseUrl: "https://user:secret@example.test" })).rejects.toThrow();
  await expect(saveRelease(owner, projectId, { name: "Duplicada", version: "2.0.0" })).rejects.toMatchObject({ code: "P2002" });
});
