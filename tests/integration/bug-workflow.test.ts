import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import { db } from "@/lib/db";
import { createProject, createCase, createRun, updateResult, completeRun, createBug } from "@/server/services";
import { changeBug, createRetest, finishRetest, getBugWorkflow, saveEvidence, readEvidence, deleteEvidence, evidenceFormat } from "@/server/bug-workflow";
const owner = randomUUID(), other = randomUUID(); let projectId: string, bugId: string, originalId: string;
beforeAll(async () => {
  await db.user.createMany({ data: [owner, other].map(id => ({ id, name: "QA Reteste", email: `${id}@example.test` })) });
  projectId = (await createProject(owner, { name: "Retestes reais", clientName: "Cliente" })).id;
  const testCase = await createCase(owner, projectId, { title: "Comprar produto", steps: ["Confirmar"], expectedResult: "Pedido criado" });
  const run = await createRun(owner, projectId, { name: "Falha original", testCaseIds: [testCase.id] }); originalId = run.results[0].id;
  await updateResult(owner, projectId, run.id, originalId, { status: "FAILED", actualResult: "Erro 500" }); await completeRun(owner, projectId, run.id);
  bugId = (await createBug(owner, projectId, { title: "Compra retorna erro", description: "Falha ao comprar", testResultId: originalId })).id;
});
afterAll(async () => { await db.evidence.deleteMany({ where: { projectId } }); await db.bugRetest.deleteMany({ where: { projectId } }); await db.bug.deleteMany({ where: { projectId } }); await db.testRun.deleteMany({ where: { projectId } }); await db.project.deleteMany({ where: { id: projectId } }); await db.user.deleteMany({ where: { id: { in: [owner, other] } } }); await db.$disconnect(); });
it("fecha ou reabre após reteste independente sem sobrescrever a falha", async () => {
  expect((await getBugWorkflow(owner, projectId, bugId)).bug).toMatchObject({ expectedResult: "Pedido criado", actualResult: "Erro 500" });
  for (const outcome of ["FAILED", "PASSED"] as const) {
    await changeBug(owner, projectId, bugId, { status: "RESOLVED", fixedInBuild: outcome, priority: "HIGH", responsibleId: owner, comment: "Correção liberada" });
    const input = { name: `Reteste ${outcome}`, build: outcome, creationKey: randomUUID() };
    const run = await createRetest(owner, projectId, bugId, input); expect((await createRetest(owner, projectId, bugId, input)).id).toBe(run.id);
    await expect(createRetest(owner, projectId, bugId, { ...input, creationKey: randomUUID() })).rejects.toMatchObject({ status: 409 });
    const retest = (await getBugWorkflow(owner, projectId, bugId)).bug.retests[0];
    await expect(finishRetest(owner, projectId, bugId, retest.id)).rejects.toMatchObject({ status: 409 });
    await updateResult(owner, projectId, run.id, retest.resultId, { status: outcome }); await completeRun(owner, projectId, run.id);
    expect((await finishRetest(owner, projectId, bugId, retest.id)).status).toBe(outcome === "PASSED" ? "CLOSED" : "OPEN");
  }
  expect((await db.testResult.findUniqueOrThrow({ where: { id: originalId } })).status).toBe("FAILED");
  await expect(getBugWorkflow(other, projectId, bugId)).rejects.toMatchObject({ status: 404 });
  await expect(changeBug(owner, projectId, bugId, { responsibleId: other })).rejects.toMatchObject({ status: 400 });
});
it("armazena evidência privada com formato real, limites e remoção autorizada", async () => {
  const file = await saveEvidence(owner, projectId, { bugId, resultId: originalId, name: "checkout.log", content: Buffer.from("Erro 500 no checkout") });
  expect((await readEvidence(owner, projectId, file.id)).size).toBe(20);
  await expect(readEvidence(other, projectId, file.id)).rejects.toMatchObject({ status: 404 });
  expect(() => evidenceFormat("fake.png", Buffer.from("<script>bad</script>"))).toThrow();
  expect(() => evidenceFormat("huge.log", Buffer.alloc(5 * 1024 * 1024 + 1))).toThrow();
  await expect(deleteEvidence(other, projectId, file.id)).rejects.toMatchObject({ status: 404 });
  await deleteEvidence(owner, projectId, file.id); await expect(readEvidence(owner, projectId, file.id)).rejects.toMatchObject({ status: 404 });
});
