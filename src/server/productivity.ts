import { z } from "zod";
import { db } from "@/lib/db";
import { getOverview, getProject } from "@/server/services";
import { automationHealth } from "@/server/integrations";
import { calculateMetrics } from "@/domain/metrics";
import { ServiceError } from "@/server/errors";

export async function myDay(userId: string) {
  const data = await getOverview(userId);
  const projectName = (id: string) => data.projects.find(value => value.id === id)?.name ?? "Projeto";
  const active = data.runs.filter(run => run.status === "OPEN" || run.status === "DRAFT");
  const item = (run: typeof data.runs[number], title: string, resultId?: string) => ({ projectId: run.projectId, projectName: projectName(run.projectId), runId: run.id, resultId, title, contextSnapshot: run.contextSnapshot });
  const pending = active.filter(run => run.source === "MANUAL").flatMap(run => run.results.filter(result => result.status === "NOT_RUN").map(result => item(run, result.caseTitle, result.id)));
  const latest = new Map<string, { run: typeof data.runs[number]; result: typeof data.runs[number]["results"][number] }>();
  for (const run of data.runs.filter(value => value.status !== "CANCELED")) for (const result of run.results) {
    const key = JSON.stringify([run.projectId, result.testCaseId, run.environmentId, run.releaseId]);
    if (!latest.has(key)) latest.set(key, { run, result });
  }
  const blocked = [...latest.values()].filter(value => value.result.status === "BLOCKED").map(({ run, result }) => item(run, result.caseTitle, result.id));
  const failures = data.runs.filter(run => run.source === "JUNIT_IMPORT" && run.createdAt.getTime() >= Date.now() - 7 * 86400000).flatMap(run => run.results.filter(result => result.status === "FAILED").map(result => item(run, result.caseTitle, result.id)));
  const retests = data.bugs.filter(bug => bug.status === "RESOLVED").map(bug => ({ projectId: bug.projectId, projectName: projectName(bug.projectId), bugId: bug.id, title: bug.title, contextSnapshot: bug.testResult?.run.contextSnapshot }));
  return { pending, blocked, failures, retests, cycles: active.map(run => ({ ...item(run, run.name), status: run.status, total: run.results.length, executed: run.results.filter(result => result.status !== "NOT_RUN").length })), generatedAt: new Date().toISOString() };
}
const querySchema = z.object({ environmentId: z.string().max(128).default(""), releaseId: z.string().max(128).default(""), from: z.iso.datetime().optional(), to: z.iso.datetime().optional() }).strict().refine(value => !value.from || !value.to || Date.parse(value.to) >= Date.parse(value.from), "Período inválido.");
export async function projectQuality(userId: string, projectId: string, input: unknown) {
  const query = querySchema.parse(input);
  const data = await getProject(userId, projectId);
  if (query.environmentId && !await db.environment.findFirst({ where: { id: query.environmentId, projectId } })) throw new ServiceError(400, "Ambiente não pertence ao projeto.");
  if (query.releaseId && !await db.release.findFirst({ where: { id: query.releaseId, projectId } })) throw new ServiceError(400, "Versão não pertence ao projeto.");
  const runs = data.runs.filter(run => run.status !== "CANCELED" && (!query.environmentId || run.environmentId === query.environmentId) && (!query.releaseId || run.releaseId === query.releaseId) && (!query.from || run.createdAt >= new Date(query.from)) && (!query.to || run.createdAt <= new Date(query.to)));
  const executedRuns = runs.filter(run => run.status !== "DRAFT");
  const allResults = executedRuns.flatMap(run => run.results);
  const relatedRetests = await db.bugRetest.findMany({ where: { projectId, result: { runId: { in: runs.map(run => run.id) } } }, select: { bugId: true } });
  const scopedResultIds = new Set(runs.flatMap(run => run.results.map(result => result.id)));
  const bugs = data.bugs.filter(bug => (!query.environmentId && !query.releaseId && !query.from && !query.to) || (!!bug.testResultId && scopedResultIds.has(bug.testResultId)) || relatedRetests.some(retest => retest.bugId === bug.id));
  const count = (values: string[]) => values.reduce<Record<string, number>>((result, value) => { result[value] = (result[value] ?? 0) + 1; return result; }, {});
  const buildKey = (run: typeof executedRuns[number]) => JSON.stringify([run.build, run.pipeline, run.integrationProvider, run.branch, run.environmentId, run.releaseId]);
  const builds = [...new Set(executedRuns.map(buildKey))].map(key => { const selected = executedRuns.filter(run => buildKey(run) === key); return { build: selected[0].build || "Sem build", contextSnapshot: selected[0].contextSnapshot, runs: selected.length, metrics: calculateMetrics(selected.flatMap(run => run.results)) }; });
  const contexts = [...new Set(executedRuns.map(run => JSON.stringify([run.environmentId, run.releaseId])))].map(key => {
    const selected = executedRuns.filter(run => JSON.stringify([run.environmentId, run.releaseId]) === key);
    const context = selected[0].contextSnapshot as { environment?: { name: string }; release?: { version: string } };
    return { environment: context.environment?.name ?? "Não informado", release: context.release?.version ?? "Não informada", metrics: calculateMetrics(selected.flatMap(run => run.results)) };
  });
  // A release uses the newest planned/result occurrence per case and environment.
  const latest = new Map<string, typeof allResults[number]>();
  for (const run of runs) for (const result of run.results) { const key = JSON.stringify([result.testCaseId, run.environmentId]); if (!latest.has(key)) latest.set(key, result); }
  const releaseResults = [...latest.values()];
  const releaseMetrics = calculateMetrics(releaseResults);
  const critical = releaseResults.filter(result => (result.caseSnapshot as { priority?: string }).priority === "CRITICAL");
  const blockers = bugs.filter(bug => bug.status !== "CLOSED" && ["HIGH", "CRITICAL"].includes(bug.severity));
  const criticalFailed = critical.filter(result => result.status === "FAILED");
  const releaseStatus = !releaseResults.length ? "Sem dados" : blockers.length || criticalFailed.length ? "Risco alto" : releaseMetrics.notRun || releaseMetrics.blocked || releaseMetrics.skipped || bugs.some(bug => bug.status === "RESOLVED") ? "Pendente" : releaseMetrics.failed ? "Requer atenção" : "Sem impedimentos identificados";
  return {
    project: { id: projectId, name: data.project.name }, generatedAt: new Date().toISOString(), scope: query,
    metrics: calculateMetrics(allResults), bugs: { severity: count(bugs.map(bug => bug.severity)), status: count(bugs.map(bug => bug.status)), priority: count(bugs.map(bug => bug.priority)) },
    inventory: { suite: count(data.cases.map(value => data.suites.find(suite => suite.id === value.suiteId)?.name ?? "Sem suíte")), priority: count(data.cases.map(value => value.priority)), type: count(data.cases.map(value => value.type)), state: count(data.cases.map(value => value.state)) },
    cycles: runs.map(run => ({ id: run.id, name: run.name, status: run.status, source: run.source, contextSnapshot: run.contextSnapshot, createdAt: run.createdAt, metrics: calculateMetrics(run.results) })), builds, contexts,
    release: { status: releaseStatus, metrics: releaseMetrics, criticalPlanned: critical.length, criticalExecuted: critical.filter(result => ["PASSED", "FAILED"].includes(result.status)).length, criticalFailed: criticalFailed.map(result => ({ title: result.caseTitle, runId: result.runId })), blockers: blockers.map(bug => ({ id: bug.id, title: bug.title, severity: bug.severity, status: bug.status })), awaitingRetest: bugs.filter(bug => bug.status === "RESOLVED").length },
    automation: await automationHealth(userId, projectId),
  };
}
