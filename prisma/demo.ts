import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { DEMO_EMAIL, DEMO_PASSWORD, demoEnabled } from "../src/lib/demo";
import type { Prisma, ResultStatus, TestCase, TestResult } from "../src/generated/prisma/client";
import { parseJUnit } from "../src/importers/junit";
import { randomUUID, createHash } from "node:crypto";
const ago = (days: number) => new Date(Date.now() - days * 86400000);
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function seedDemo() {
  if (!demoEnabled() || !new URL(process.env.DATABASE_URL ?? "").pathname.endsWith("_demo")) throw new Error("Seed demo exige DEMO_MODE=true e banco exclusivo _demo.");
  let user = await db.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (user && user.name !== "QA Demonstração · dados fictícios") throw new Error("Conta reservada já existe; seed não altera usuários existentes.");
  if (!user) { const created = await auth.api.signUpEmail({ body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: "QA Demonstração · dados fictícios" } }); user = await db.user.findUniqueOrThrow({ where: { id: created.user.id } }); }
  const owner = user.id;
  const workspace = await db.workspace.upsert({ where: { ownerId: owner }, update: {}, create: { name: "Demonstração · dados inteiramente fictícios", ownerId: owner, members: { create: { userId: owner, role: "OWNER" } } } });
  const projects = [
    ["Aurora Commerce", "Aurora Digital (fictício)", ["Catálogo", "Carrinho", "Checkout", "Pedidos", "Cupons"]],
    ["Portal Aurora", "Aurora Digital (fictício)", ["Acesso", "Perfil", "Atendimento", "Documentos", "Notificações"]],
    ["Horizonte Pay API", "Horizonte Fintech (fictício)", ["Autenticação", "Cobrança", "Estorno", "Webhook", "Conciliação"]],
    ["Clínica Vida Agenda", "Vida Saúde (fictício)", ["Login", "Pacientes", "Agendamentos", "Confirmações", "Disponibilidade"]],
  ] as const;
  for (const [projectIndex, [name, clientName, modules]] of projects.entries()) await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspace.id} FOR UPDATE`;
    const stableId = `demo-${owner}-${projectIndex}`;
    const previous = await tx.project.findFirst({ where: { workspaceId: workspace.id, OR: [{ id: stableId }, { name: `${name} · DEMO` }] } });
    if (previous) return;
    const project = await tx.project.create({ data: { id: stableId, workspaceId: workspace.id, name: `${name} · DEMO`, clientName, description: "Histórico fictício de demonstração. Nenhum cliente, paciente ou transação é real.", environment: "QA" } });
    const projectId = project.id;
    const environments = await Promise.all(["Dev", "QA", "Staging"].map(name => tx.environment.create({ data: { projectId, name, baseUrl: `https://${name.toLowerCase()}.example.test` } })));
    const releases = await Promise.all(["2.3.0", "2.4.0"].map(version => tx.release.create({ data: { projectId, name: `Entrega ${version} · fictícia`, version } })));
    const root = await tx.testSuite.create({ data: { projectId, name: "Jornadas do produto" } });
    const cases: TestCase[] = [];
    for (const [moduleIndex, module] of modules.entries()) {
      const suite = await tx.testSuite.create({ data: { projectId, name: module, parentId: root.id } });
      for (let variant = 0; variant < 4; variant++) {
        const titles = [`Concluir fluxo válido de ${module}`, `Recusar dados inválidos em ${module}`, `Validar contrato e autorização de ${module}`, `Explorar recuperação de falhas em ${module}`];
        const key = `qa:${randomUUID()}`;
        const source = `# language: pt\n@demo @smoke @${key}\nFuncionalidade: ${module}\n  Cenário: ${titles[variant]}\n    Dado que estou autenticado no ambiente de demonstração\n    Quando realizo a operação de ${module}\n    Então recebo uma confirmação consistente sem duplicar dados\n`;
        cases.push(await tx.testCase.create({ data: { projectId, suiteId: suite.id, title: titles[variant], description: `Dados fictícios: jornada de ${name}, módulo ${module}.`, preconditions: "Usuário fictício autenticado; ambiente QA disponível.", steps: ["Preparar os dados fictícios", `Acessar ${module}`, variant === 1 ? "Enviar dados incompletos" : "Confirmar a operação", "Conferir resposta e persistência"], expectedResult: variant === 1 ? "Exibir validação sem gravar dados inválidos." : "Operação consistente, autorizada e sem duplicações.", tags: variant === 0 ? ["demo", "smoke", "regressao"] : ["demo", "regressao", ...(variant === 3 ? ["exploratorio"] : [])], priority: moduleIndex < 2 ? "CRITICAL" : variant === 1 ? "HIGH" : "MEDIUM", type: variant === 2 ? "API" : variant === 3 ? "EXPLORATORY" : variant === 1 ? "UI" : "FUNCTIONAL", format: variant === 0 ? "BDD" : "STEPS", gherkinSource: variant === 0 ? source : "", gherkinOriginalSource: variant === 0 ? source : "", gherkinKey: variant === 0 ? key : null, updatedBy: owner } }));
      }
    }
    for (const [planName, selected] of [["Smoke", cases.filter(value => value.tags.includes("smoke"))], ["Regressão", cases], ["Homologação", cases.filter(value => value.type === "FUNCTIONAL" || value.type === "UI")]] as const) {
      const plan = await tx.testPlan.create({ data: { projectId, name: `${planName} · ${name}`, description: "Plano reutilizável com revisões e dados fictícios." } });
      await tx.testPlanItem.createMany({ data: selected.map((value, position) => ({ projectId, planId: plan.id, testCaseId: value.id, revision: value.revision, caseSnapshot: json(value), category: modules[Math.floor(cases.indexOf(value) / 4)], position })) });
    }
    const smoke = await tx.testPlan.findFirstOrThrow({ where: { projectId, name: { startsWith: "Regressão" } } });
    const context = (build: string, releaseIndex = 1) => json({ build, environment: { id: environments[1].id, name: "QA", baseUrl: environments[1].baseUrl }, release: { id: releases[releaseIndex].id, name: releases[releaseIndex].name, version: releases[releaseIndex].version }, responsible: { id: owner, name: "QA Demonstração" } });
    const originalResults: TestResult[] = [];
    for (const [index, status] of ["COMPLETED", "OPEN", "DRAFT"].entries()) {
      const build = `24${index + 1}`;
      const run = await tx.testRun.create({ data: { projectId, planId: smoke.id, name: `${index === 0 ? "Regressão concluída" : index === 1 ? "Regressão em andamento" : "Regressão planejada"} · build ${build}`, status: status as "COMPLETED" | "OPEN" | "DRAFT", environmentId: environments[1].id, releaseId: releases[1].id, build, responsibleId: owner, contextSnapshot: context(build), createdAt: ago(5 - index * 2), startedAt: status === "DRAFT" ? null : ago(5 - index * 2), finishedAt: status === "COMPLETED" ? ago(4) : null, notes: "Execução fictícia para explorar a plataforma.", entryCriteria: "Build implantada e dados fictícios preparados.", exitCriteria: "Smoke aprovado e defeitos críticos retestados." } });
      for (const [position, value] of cases.entries()) {
        const resultStatus: ResultStatus = status === "DRAFT" || (index === 1 && position > 6) ? "NOT_RUN" : (["FAILED", "PASSED", "BLOCKED", "SKIPPED", "PASSED"] as ResultStatus[])[position % 5];
        const result = await tx.testResult.create({ data: { projectId, runId: run.id, testCaseId: value.id, caseTitle: value.title, caseSnapshot: json(value), position, category: modules[Math.floor(position / 4)], status: resultStatus, actualResult: resultStatus === "FAILED" ? "Confirmação não exibida após resposta do serviço (falha fictícia)." : resultStatus === "PASSED" ? "Comportamento esperado confirmado com dados fictícios." : "", notes: resultStatus === "BLOCKED" ? "Dependência externa simulada indisponível." : "Registro de demonstração.", durationMs: resultStatus === "NOT_RUN" ? null : (position + 1) * 2400, executedAt: resultStatus === "NOT_RUN" ? null : ago(index === 0 ? 4 : 2), executorId: resultStatus === "NOT_RUN" ? null : owner, executorName: resultStatus === "NOT_RUN" ? null : "QA Demonstração" } });
        if (index === 0) originalResults.push(result);
      }
    }
    for (let index = 0; index < 5; index++) {
      const result = originalResults[index * 4];
      // Every defect starts from a concrete failed result, retained for retest history.
      await tx.testResult.update({ where: { id: result.id }, data: { status: "FAILED", actualResult: "Falha fictícia reproduzida durante a regressão." } });
      const status = (["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "OPEN"] as const)[index];
      const history = [{ at: ago(4).toISOString(), actorName: "QA Demonstração", status: "OPEN", comment: "Defeito fictício identificado na regressão." }, ...(index >= 2 ? [{ at: ago(2).toISOString(), actorName: "QA Demonstração", before: "OPEN", status: "RESOLVED", comment: "Correção disponível na build 244." }] : [])];
      const bug = await tx.bug.create({ data: { projectId, testResultId: result.id, title: `${modules[index]}: ${index === 4 ? "falha reaberta após reteste" : index === 3 ? "correção validada" : "confirmação inconsistente"} · DEMO`, description: "Defeito e informações inteiramente fictícios para demonstração.", severity: index < 2 ? "CRITICAL" : "MEDIUM", priority: index < 3 ? "HIGH" : "LOW", status, responsibleId: owner, stepsToReproduce: `Acessar ${modules[index]} com dados fictícios e confirmar a operação.`, expectedResult: "Confirmação consistente sem duplicações.", actualResult: "Resposta inconsistente simulada.", fixedInBuild: index >= 2 ? "244" : "", history } });
      const content = Buffer.from(`DEMONSTRAÇÃO FICTÍCIA\nProjeto: ${name}\nMódulo: ${modules[index]}\nBuild 241: resposta simulada 500; correlação demo-${index}.\nNenhuma informação real ou segredo.\n`);
      await tx.evidence.create({ data: { projectId, bugId: bug.id, resultId: result.id, name: `evidencia-ficticia-${index + 1}.log`, mime: "text/plain; charset=utf-8", content: new Uint8Array(content), size: content.length, sha256: createHash("sha256").update(content).digest("hex"), actorId: owner } });
      if (index >= 3) {
        const run = await tx.testRun.create({ data: { projectId, name: `Reteste ${modules[index]} · build 244 · DEMO`, status: "COMPLETED", build: "244", environmentId: environments[1].id, releaseId: releases[1].id, contextSnapshot: context("244"), createdAt: ago(1), startedAt: ago(1), finishedAt: ago(1) } });
        const retested = await tx.testResult.create({ data: { projectId, runId: run.id, testCaseId: result.testCaseId, caseTitle: result.caseTitle, caseSnapshot: result.caseSnapshot as Prisma.InputJsonValue, status: index === 3 ? "PASSED" : "FAILED", actualResult: index === 3 ? "Correção fictícia validada." : "Falha fictícia continua reproduzível.", executorId: owner, executorName: "QA Demonstração", executedAt: ago(1), durationMs: 18000 } });
        const retest = await tx.bugRetest.create({ data: { projectId, bugId: bug.id, resultId: retested.id, completedAt: ago(1) } });
        await tx.bug.update({ where: { id: bug.id }, data: { history: [...history, { at: ago(1).toISOString(), actorName: "QA Demonstração", before: "RESOLVED", status, retestId: retest.id, comment: index === 3 ? "Correção aprovada." : "Defeito reaberto com evidência preservada." }] } });
      }
    }
    for (let index = 0; index < 3; index++) {
      const build = `ci-${240 + index}`;
      const report = parseJUnit(`<testsuite name="Demo">${[0,1,2,3,4].map(position => `<testcase classname="Demo.${projectIndex}" name="Cenario ${position}" time="1.2">${position === 0 && index !== 1 ? '<failure message="Timeout ficticio">Falha simulada de confirmacao</failure>' : ''}</testcase>`).join("")}</testsuite>`);
      const run = await tx.testRun.create({ data: { reportSha256: report.sha256, projectId, name: `Pipeline ${name} · ${build} · DEMO`, source: "JUNIT_IMPORT", status: "COMPLETED", integrationProvider: "jenkins", externalRunId: `demo-${projectId}-${index}`, pipeline: `${name}/regressao`, branch: "release/2.4", commit: String(index + 1).repeat(40), build, buildUrl: "https://ci.example.test/job/demo", environmentId: environments[2].id, releaseId: releases[index === 0 ? 0 : 1].id, contextSnapshot: json({ build, environment: { id: environments[2].id, name: "Staging" }, release: { id: releases[index === 0 ? 0 : 1].id, version: releases[index === 0 ? 0 : 1].version }, pipeline: `${name}/regressao`, branch: "release/2.4", commit: String(index + 1).repeat(40) }), createdAt: ago(6 - index * 2), startedAt: ago(6 - index * 2), finishedAt: ago(6 - index * 2) } });
      for (let position = 0; position < 5; position++) {
        const value = cases[position * 4];
        await tx.testResult.create({ data: { projectId, runId: run.id, testCaseId: value.id, caseTitle: value.title, caseSnapshot: json(value), status: report.cases[position].status, errorMessage: report.cases[position].errorMessage, durationMs: report.cases[position].durationMs, executedAt: ago(6 - index * 2) } });
      }
    }
  }, { timeout: 60000 });
  console.log("Demonstração pronta: conta pública isolada; 4 projetos e 80 casos fictícios. Reinicializações preservam os dados existentes.");
}
