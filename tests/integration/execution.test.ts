import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createProject, createCase, createRun, updateResult, getRun, completeRun, listResultEvents, createBug, getProject } from "@/server/services";

const owner = `execution-${randomUUID()}`, stranger = `execution-other-${randomUUID()}`;
let projectId: string, resultId: string, runId: string;
beforeAll(async () => {
  await db.user.createMany({ data: [owner, stranger].map(id => ({ id, name: "QA Executor", email: `${id}@example.test` })) });
  projectId = (await createProject(owner, { name: "Execução profissional", clientName: "Cliente QA" })).id;
  const testCase = await createCase(owner, projectId, { title: "Compra manual", preconditions: "Carrinho válido", steps: ["Confirmar compra"], expectedResult: "Pedido criado" });
  const run = await createRun(owner, projectId, { name: "Smoke manual", testCaseIds: [testCase.id] });
  runId = run.id; resultId = run.results[0].id;
});
afterAll(async () => {
  await db.bug.deleteMany({ where: { projectId } });
  await db.testRun.deleteMany({ where: { projectId } });
  await db.project.deleteMany({ where: { id: projectId } });
  await db.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
  await db.$disconnect();
});

it("retoma rascunho sem contar resultado definitivo e registra autoria/duração ao finalizar", async () => {
  const draft = await updateResult(owner, projectId, runId, resultId, { status: "FAILED", notes: "Investigar", actualResult: "Erro no checkout", durationMs: 12500, saveDraft: true, expectedVersion: 0, operationId: randomUUID() });
  expect(draft).toMatchObject({ status: "NOT_RUN", executedAt: null, executorId: null, version: 1, draft: { status: "FAILED", actualResult: "Erro no checkout", durationMs: 12500 } });
  expect((await getRun(owner, projectId, runId)).results[0].draft).toEqual(draft.draft);
  expect((await getProject(owner, projectId)).metrics).toMatchObject({ failed: 0, notRun: 1 });
  await expect(completeRun(owner, projectId, runId)).rejects.toMatchObject({ status: 409 });
  const saved = await updateResult(owner, projectId, runId, resultId, { status: "FAILED", notes: "Falha confirmada", actualResult: "Erro no checkout", durationMs: 12500, expectedVersion: 1, operationId: randomUUID() });
  expect(saved).toMatchObject({ status: "FAILED", notes: "Falha confirmada", actualResult: "Erro no checkout", durationMs: 12500, executorId: owner, executorName: "QA Executor", draft: null, version: 2 });
  expect(saved.executedAt).toBeInstanceOf(Date);
});

it("repete uma operação sem novas versões e preserva correções e rascunhos descartados", async () => {
  const operation = { status: "PASSED", notes: "Correção validada", actualResult: "Pedido criado", expectedVersion: 2, operationId: randomUUID() };
  const [first, repeated] = await Promise.all([updateResult(owner, projectId, runId, resultId, operation), updateResult(owner, projectId, runId, resultId, operation)]);
  expect(first.version).toBe(3); expect(repeated.version).toBe(3);
  await expect(updateResult(owner, projectId, runId, resultId, { ...operation, notes: "Payload trocado" })).rejects.toMatchObject({ status: 409 });
  await expect(updateResult(owner, projectId, runId, resultId, { status: "BLOCKED", expectedVersion: 2 })).rejects.toMatchObject({ status: 409 });
  await updateResult(owner, projectId, runId, resultId, { status: "BLOCKED", notes: "Dúvida temporária", saveDraft: true, expectedVersion: 3 });
  const discarded = await updateResult(owner, projectId, runId, resultId, { discardDraft: true, expectedVersion: 4 });
  expect(discarded).toMatchObject({ status: "PASSED", notes: "Correção validada", actualResult: "Pedido criado", draft: null, version: 5 });
  const events = await listResultEvents(owner, projectId, runId, resultId);
  expect(events.map(event => event.version)).toEqual([5, 4, 3, 2, 1, 0]);
  expect(events.find(event => event.version === 2)?.snapshot).toMatchObject({ status: "FAILED", actualResult: "Erro no checkout", notes: "Falha confirmada" });
  expect(events.find(event => event.version === 4)?.snapshot).toMatchObject({ status: "PASSED", draft: { status: "BLOCKED", notes: "Dúvida temporária" } });
});

it("isola histórico, valida duração e mantém resultados após conclusão", async () => {
  await expect(listResultEvents(stranger, projectId, runId, resultId)).rejects.toMatchObject({ status: 404 });
  await expect(listResultEvents(owner, projectId, "outro-ciclo", resultId)).rejects.toMatchObject({ status: 404 });
  await expect(updateResult(owner, projectId, runId, resultId, { durationMs: -1 })).rejects.toThrow();
  await expect(updateResult(owner, projectId, runId, resultId, { saveDraft: true, discardDraft: true })).rejects.toThrow();
  await completeRun(owner, projectId, runId);
  await expect(updateResult(owner, projectId, runId, resultId, { status: "FAILED" })).rejects.toMatchObject({ status: 409 });
  expect((await listResultEvents(owner, projectId, runId, resultId))[0].snapshot).toMatchObject({ status: "PASSED" });
});

it("não duplica defeitos em retries concorrentes e recusa reaproveitar chave com outro conteúdo", async () => {
  const data = { title: "Falha contextual", description: "Erro original", testResultId: resultId, creationKey: randomUUID() };
  const [first, second] = await Promise.all([createBug(owner, projectId, data), createBug(owner, projectId, data)]);
  expect(first.id).toBe(second.id);
  expect(await db.bug.count({ where: { projectId, creationKey: data.creationKey } })).toBe(1);
  await expect(createBug(owner, projectId, { ...data, description: "Outra falha" })).rejects.toMatchObject({ status: 409 });
});

it("cria uma única execução em retries concorrentes, mantendo resultados separados", async () => {
  const previous = await getRun(owner, projectId, runId);
  const data = { name: "Nova execução idempotente", testCaseIds: [previous.results[0].testCaseId], creationKey: randomUUID() };
  const [first, second] = await Promise.all([createRun(owner, projectId, data), createRun(owner, projectId, data)]);
  expect(first.id).toBe(second.id); expect(first.results).toHaveLength(1);
  expect(first.results[0].status).toBe("NOT_RUN");
  expect(first.results[0].id).not.toBe(resultId);
  await expect(createRun(owner, projectId, { ...data, name: "Conteúdo trocado" })).rejects.toMatchObject({ status: 409 });
  await updateResult(owner, projectId, first.id, first.results[0].id, { status: "PASSED" });
  expect(await updateResult(owner, projectId, first.id, first.results[0].id, { status: "NOT_RUN" })).toMatchObject({ executorId: null, executorName: null, executedAt: null });
});
