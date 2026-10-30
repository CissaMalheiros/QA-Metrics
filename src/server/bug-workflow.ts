import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireProject, withProject, resolveRunContext } from "@/server/services";
import { ServiceError } from "@/server/errors";

const fields = z.object({ priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]), responsibleId: z.string().max(128).nullable(), expectedResult: z.string().max(10000), actualResult: z.string().max(10000), fixedInBuild: z.string().max(120), status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]), comment: z.string().trim().max(5000) }).partial().strict();
export async function getBugWorkflow(userId: string, projectId: string, bugId: string) {
  await requireProject(userId, projectId);
  const bug = await db.bug.findFirst({ where: { id: bugId, projectId }, include: { testResult: { include: { run: true } }, retests: { include: { result: { include: { run: true } } }, orderBy: { createdAt: "desc" } } } });
  if (!bug) throw new ServiceError(404, "Defeito não encontrado.");
  const evidence = await db.evidence.findMany({ where: { projectId, OR: [{ bugId }, ...(bug.testResultId ? [{ resultId: bug.testResultId }] : [])] }, select: { id: true, name: true, size: true, mime: true, createdAt: true } });
  return { bug, evidence };
}
export async function changeBug(userId: string, projectId: string, bugId: string, input: unknown) {
  const { comment, ...data } = fields.parse(input);
  return withProject(userId, projectId, "BUG_WORKFLOW_UPDATED", async client => {
    const bug = await client.bug.findFirst({ where: { id: bugId, projectId } });
    if (!bug) throw new ServiceError(404, "Defeito não encontrado.");
    if (data.responsibleId) await resolveRunContext(client, projectId, { responsibleId: data.responsibleId, build: "" });
    const actor = await client.user.findUniqueOrThrow({ where: { id: userId } });
    const history = Array.isArray(bug.history) ? bug.history : [];
    return client.bug.update({ where: { id: bugId }, data: { ...data, history: [...history, { at: new Date().toISOString(), actorId: userId, actorName: actor.name, before: { status: bug.status, priority: bug.priority, responsibleId: bug.responsibleId, fixedInBuild: bug.fixedInBuild, expectedResult: bug.expectedResult, actualResult: bug.actualResult }, changes: data, comment: comment ?? "" }] as Prisma.InputJsonArray } });
  });
}
export async function createRetest(userId: string, projectId: string, bugId: string, input: unknown) {
  const data = z.object({ name: z.string().trim().min(3).max(200), build: z.string().trim().min(1).max(120), environmentId: z.string().min(1).max(128).optional(), releaseId: z.string().min(1).max(128).optional(), creationKey: z.string().uuid() }).strict().parse(input);
  return withProject(userId, projectId, "BUG_RETEST_CREATED", async client => {
    const existing = await client.testRun.findUnique({ where: { projectId_creationKey: { projectId, creationKey: data.creationKey } } });
    const hash = createHash("sha256").update(JSON.stringify({ bugId, ...data })).digest("hex");
    if (existing) { if (existing.creationHash !== hash) throw new ServiceError(409, "Chave já utilizada."); return existing; }
    const bug = await client.bug.findFirst({ where: { id: bugId, projectId }, include: { testResult: { include: { run: true } } } });
    if (!bug?.testResult || bug.status !== "RESOLVED") throw new ServiceError(409, "Vincule uma execução e marque a correção disponível antes de retestar.");
    const context = await resolveRunContext(client, projectId, data);
    const run = await client.testRun.create({ data: { projectId, name: data.name, build: data.build, environmentId: data.environmentId, releaseId: data.releaseId, creationKey: data.creationKey, creationHash: hash, contextSnapshot: context } });
    const result = await client.testResult.create({ data: { projectId, runId: run.id, testCaseId: bug.testResult.testCaseId, caseTitle: bug.testResult.caseTitle, caseSnapshot: bug.testResult.caseSnapshot as Prisma.InputJsonValue } });
    const retest = await client.bugRetest.create({ data: { projectId, bugId, resultId: result.id } });
    await client.bug.update({ where: { id: bugId }, data: { history: [...(Array.isArray(bug.history) ? bug.history : []), { at: new Date().toISOString(), actorId: userId, action: "RETEST_CREATED", retestId: retest.id, build: data.build }] as Prisma.InputJsonArray } });
    return run;
  });
}
export async function finishRetest(userId: string, projectId: string, bugId: string, retestId: string) {
  return withProject(userId, projectId, "BUG_RETEST_VALIDATED", async client => {
    const retest = await client.bugRetest.findFirst({ where: { id: retestId, projectId, bugId }, include: { result: { include: { run: true } }, bug: true } });
    if (!retest) throw new ServiceError(404, "Reteste não encontrado.");
    if (retest.completedAt) return retest.bug;
    if (retest.result.draft || retest.result.run.status !== "COMPLETED" || !["PASSED", "FAILED"].includes(retest.result.status)) throw new ServiceError(409, "Conclua o ciclo do reteste com aprovado ou reprovado.");
    const status = retest.result.status === "PASSED" ? "CLOSED" : "OPEN";
    await client.bugRetest.update({ where: { id: retestId }, data: { completedAt: new Date() } });
    const history = Array.isArray(retest.bug.history) ? retest.bug.history : [];
    return client.bug.update({ where: { id: bugId }, data: { status, history: [...history, { at: new Date().toISOString(), actorId: userId, before: retest.bug.status, status, retestId, resultId: retest.resultId }] as Prisma.InputJsonArray } });
  });
}

export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
export function evidenceFormat(name: string, content: Buffer) {
  if (!content.length || content.length > MAX_EVIDENCE_BYTES) throw new ServiceError(413, "Envie um arquivo de até 5 MiB.");
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "png" && content.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && content.length >= 33 && content.subarray(12,16).toString() === "IHDR" && content.subarray(-8,-4).toString() === "IEND") return "image/png";
  if (["jpg", "jpeg"].includes(ext ?? "") && content[0] === 255 && content[1] === 216 && content[2] === 255 && content.subarray(-2).equals(Buffer.from([255,217]))) return "image/jpeg";
  if (ext === "pdf" && content.subarray(0,5).toString() === "%PDF-" && content.subarray(-1024).includes(Buffer.from("%%EOF"))) return "application/pdf";
  if (["txt", "log"].includes(ext ?? "")) {
    try { const text = new TextDecoder("utf-8", { fatal: true }).decode(content); if (!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) return "text/plain; charset=utf-8"; } catch { /* Invalid UTF-8 is not a text evidence. */ }
  }
  throw new ServiceError(400, "Formato inválido. Use PNG, JPEG, PDF ou texto UTF-8 (.txt/.log).");
}
export async function saveEvidence(userId: string, projectId: string, input: { bugId?: string; resultId?: string; name: string; content: Buffer }) {
  const mime = evidenceFormat(input.name, input.content);
  if (!input.bugId && !input.resultId) throw new ServiceError(400, "Vincule a um defeito ou resultado.");
  return withProject(userId, projectId, "EVIDENCE_ATTACHED", async client => {
    if (input.bugId) {
      const bug = await client.bug.findFirst({ where: { id: input.bugId, projectId } });
      if (!bug) throw new ServiceError(404, "Defeito não encontrado.");
      if (input.resultId && bug.testResultId && bug.testResultId !== input.resultId) throw new ServiceError(400, "A evidência deve usar o resultado vinculado ao defeito.");
    }
    if (input.resultId && !await client.testResult.findFirst({ where: { id: input.resultId, projectId } })) throw new ServiceError(404, "Resultado não encontrado.");
    const usage = await client.evidence.aggregate({ where: { projectId }, _sum: { size: true }, _count: true });
    if (usage._count >= 100 || (usage._sum.size ?? 0) + input.content.length > 25 * 1024 * 1024) throw new ServiceError(409, "Limite do projeto: 100 evidências ou 25 MiB. Remova arquivos desnecessários.");
    return client.evidence.create({ data: { id: randomUUID(), projectId, bugId: input.bugId, resultId: input.resultId, name: input.name.replace(/[\r\n\\/\x00-\x1f]/g, "_").slice(-180), mime, size: input.content.length, content: new Uint8Array(input.content), sha256: createHash("sha256").update(input.content).digest("hex"), actorId: userId }, select: { id: true, name: true, size: true } });
  });
}
export async function readEvidence(userId: string, projectId: string, id: string) {
  await requireProject(userId, projectId);
  const value = await db.evidence.findFirst({ where: { id, projectId } });
  if (!value) throw new ServiceError(404, "Evidência não encontrada.");
  return value;
}
export async function deleteEvidence(userId: string, projectId: string, id: string) {
  return withProject(userId, projectId, "EVIDENCE_DELETED", async client => {
    const value = await client.evidence.findFirst({ where: { id, projectId } });
    if (!value) throw new ServiceError(404, "Evidência não encontrada.");
    await client.evidence.delete({ where: { id } }); return { id, deleted: true };
  });
}
