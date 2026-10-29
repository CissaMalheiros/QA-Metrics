import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as service from "@/server/services";

const userA = `integration-a-${randomUUID()}`;
const userB = `integration-b-${randomUUID()}`;
let projectA: string;
let secondProjectA: string;
let projectB: string;
let caseA: string;
let caseB: string;
let caseOtherProject: string;
let runA: string;
let resultA: string;
let resultB: string;
const caseInput = {
  title: "Validar operação principal",
  description: "Fluxo de teste de integração",
  preconditions: "Ambiente disponível",
  steps: ["Acessar a tela", "Confirmar a operação"],
  expectedResult: "Operação registrada",
  priority: "HIGH",
};
const bugInput = {
  title: "Falha demonstrada pelo teste",
  description: "Resultado diferente do esperado",
  stepsToReproduce: "Abrir a tela e confirmar a operação.",
  severity: "HIGH",
  status: "OPEN",
};
const xml =
  '<?xml version="1.0"?><testsuites><testsuite name="Integração"><testcase classname="checkout" name="concluir compra" time="0.25"/><testcase classname="checkout" name="validar erro" time="0.5"><failure message="Falha esperada">Detalhes de diagnóstico</failure></testcase></testsuite></testsuites>';

beforeAll(async () => {
  await db.user.createMany({
    data: [
      {
        id: userA,
        name: "Conta A de integração",
        email: `${userA}@example.test`,
      },
      {
        id: userB,
        name: "Conta B de integração",
        email: `${userB}@example.test`,
      },
    ],
  });
  const a = await service.createProject(userA, {
    name: "Projeto A",
    clientName: "Cliente A",
    description: "",
    environment: "Teste",
    status: "ACTIVE",
  });
  const other = await service.createProject(userA, {
    name: "Outro projeto A",
    clientName: "Outro cliente",
    description: "",
    environment: "Teste",
    status: "ACTIVE",
  });
  const b = await service.createProject(userB, {
    name: "Projeto B",
    clientName: "Cliente B",
    description: "",
    environment: "Teste",
    status: "ACTIVE",
  });
  projectA = a.id;
  secondProjectA = other.id;
  projectB = b.id;
  caseA = (await service.createCase(userA, projectA, caseInput)).id;
  caseB = (await service.createCase(userB, projectB, caseInput)).id;
  caseOtherProject = (
    await service.createCase(userA, secondProjectA, caseInput)
  ).id;
  const firstRun = await service.createRun(userA, projectA, {
    name: "Ciclo da conta A",
    testCaseIds: [caseA],
  });
  runA = firstRun.id;
  resultA = (await service.getRun(userA, projectA, runA)).results[0].id;
  const otherRun = await service.createRun(userB, projectB, {
    name: "Ciclo da conta B",
    testCaseIds: [caseB],
  });
  resultB = (await service.getRun(userB, projectB, otherRun.id)).results[0].id;
});

afterAll(async () => {
  // Remove somente os registros identificados por usuários criados por este arquivo.
  const projects = await db.project.findMany({
    where: { workspace: { ownerId: { in: [userA, userB] } } },
    select: { id: true },
  });
  const projectIds = projects.map((project) => project.id);
  await db.$transaction(async (tx) => {
    await tx.bug.deleteMany({ where: { projectId: { in: projectIds } } });
    await tx.testResult.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await tx.testRun.deleteMany({ where: { projectId: { in: projectIds } } });
    await tx.testCase.deleteMany({ where: { projectId: { in: projectIds } } });
    await tx.project.deleteMany({ where: { id: { in: projectIds } } });
    await tx.user.deleteMany({ where: { id: { in: [userA, userB] } } });
  });
  await db.$disconnect();
});

describe("isolamento real entre contas e projetos", () => {
  it("lista somente os projetos da conta autenticada", async () => {
    const projects = await service.listProjects(userA);
    expect(projects.map((project) => project.id)).toEqual(
      expect.arrayContaining([projectA, secondProjectA]),
    );
    expect(projects.some((project) => project.id === projectB)).toBe(false);
    const overview = await service.getOverview(userA);
    expect(overview.projects.some((project) => project.id === projectB)).toBe(
      false,
    );
  });

  it("recusa leitura, edição e exclusão de projeto de outra conta", async () => {
    await expect(service.getProject(userA, projectB)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      service.updateProject(userA, projectB, {
        name: "Tentativa indevida",
        clientName: "Cliente B",
        description: "",
        environment: "",
        status: "ACTIVE",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(service.deleteProject(userA, projectB)).rejects.toMatchObject({
      status: 404,
    });
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: projectB } })).name,
    ).toBe("Projeto B");
  });

  it("recusa leitura e mutação de caso de projeto diferente", async () => {
    expect(
      (await service.listCases(userA, projectA)).map((testCase) => testCase.id),
    ).toEqual([caseA]);
    await expect(service.getCase(userA, projectA, caseB)).rejects.toMatchObject(
      { status: 404 },
    );
    await expect(
      service.updateCase(userA, projectA, caseOtherProject, caseInput),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.deleteCase(userA, projectA, caseB),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.createCase(userA, projectB, caseInput),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("não cria ciclo com casos de outro projeto, mesmo pertencendo à mesma conta", async () => {
    await expect(
      service.createRun(userA, projectA, {
        name: "Ciclo inválido",
        testCaseIds: [caseA, caseOtherProject],
      }),
    ).rejects.toThrow();
    await expect(
      service.createRun(userA, projectA, {
        name: "Ciclo de conta externa",
        testCaseIds: [caseB],
      }),
    ).rejects.toThrow();
    expect(
      await db.testRun.count({
        where: { projectId: projectA, name: "Ciclo inválido" },
      }),
    ).toBe(0);
  });

  it("não vincula bug a resultado de outro projeto ou conta", async () => {
    await expect(
      service.createBug(userA, projectA, {
        ...bugInput,
        testResultId: resultB,
      }),
    ).rejects.toThrow();
    const runOther = await service.createRun(userA, secondProjectA, {
      name: "Ciclo segundo projeto",
      testCaseIds: [caseOtherProject],
    });
    const foreignResult = (
      await service.getRun(userA, secondProjectA, runOther.id)
    ).results[0];
    await expect(
      service.createBug(userA, projectA, {
        ...bugInput,
        testResultId: foreignResult.id,
      }),
    ).rejects.toThrow();
    const bug = await service.createBug(userA, projectA, {
      ...bugInput,
      testResultId: resultA,
    });
    expect(bug.projectId).toBe(projectA);
    await expect(
      service.updateBug(userA, projectA, bug.id, {
        ...bugInput,
        testResultId: resultB,
      }),
    ).rejects.toThrow();
    expect(
      (await db.bug.findUniqueOrThrow({ where: { id: bug.id } })).testResultId,
    ).toBe(resultA);
    await expect(service.getBug(userB, projectA, bug.id)).rejects.toMatchObject(
      { status: 404 },
    );
  });

  it("o PostgreSQL também recusa referências de resultado entre projetos", async () => {
    await expect(
      db.testResult.create({
        data: {
          projectId: projectA,
          runId: runA,
          testCaseId: caseOtherProject,
          caseTitle: "Referência inválida",
          caseSnapshot: {},
          status: "NOT_RUN",
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("rejeita usuários inexistentes antes de criar workspace", async () => {
    await expect(
      service.getWorkspace(`unknown-${randomUUID()}`),
    ).rejects.toThrow();
  });

  it("PATCH parcial preserva campos omitidos em projeto, caso e bug", async () => {
    const project = await service.createProject(userA, {
      name: "Projeto para PATCH",
      clientName: "Cliente preservado",
      description: "Descrição preservada",
      environment: "Sandbox",
      status: "PAUSED",
    });
    const changedProject = await service.updateProject(userA, project.id, {
      name: "Projeto renomeado",
    });
    expect(changedProject).toMatchObject({
      name: "Projeto renomeado",
      clientName: "Cliente preservado",
      description: "Descrição preservada",
      environment: "Sandbox",
      status: "PAUSED",
    });
    const testCase = await service.createCase(userA, project.id, {
      ...caseInput,
      priority: "CRITICAL",
    });
    const changedCase = await service.updateCase(
      userA,
      project.id,
      testCase.id,
      { title: "Título renomeado" },
    );
    expect(changedCase).toMatchObject({
      title: "Título renomeado",
      description: caseInput.description,
      preconditions: caseInput.preconditions,
      expectedResult: caseInput.expectedResult,
      priority: "CRITICAL",
      steps: caseInput.steps,
    });
    const run = await service.createRun(userA, project.id, {
      name: "Ciclo para vínculo",
      testCaseIds: [testCase.id],
    });
    const resultId = run.results[0].id;
    await service.updateResult(userA, project.id, run.id, resultId, {
      status: "FAILED",
      notes: "Observação preservada",
    });
    const changedStatus = await service.updateResult(
      userA,
      project.id,
      run.id,
      resultId,
      { status: "PASSED" },
    );
    expect(changedStatus).toMatchObject({
      status: "PASSED",
      notes: "Observação preservada",
    });
    const changedNotes = await service.updateResult(
      userA,
      project.id,
      run.id,
      resultId,
      { notes: "Nova observação" },
    );
    expect(changedNotes).toMatchObject({
      status: "PASSED",
      notes: "Nova observação",
    });
    expect(changedNotes.executedAt).toEqual(changedStatus.executedAt);
    const bug = await service.createBug(userA, project.id, {
      ...bugInput,
      severity: "CRITICAL",
      testResultId: run.results[0].id,
    });
    const changedBug = await service.updateBug(userA, project.id, bug.id, {
      status: "RESOLVED",
    });
    expect(changedBug).toMatchObject({
      status: "RESOLVED",
      title: bugInput.title,
      description: bugInput.description,
      stepsToReproduce: bugInput.stepsToReproduce,
      severity: "CRITICAL",
      testResultId: run.results[0].id,
    });
  });
});

describe("histórico e importações persistidos", () => {
  it("recusa exclusão de projeto com histórico e permite arquivar sem perder resultados", async () => {
    const before = await db.testResult.count({ where: { projectId: projectA } });
    await expect(service.deleteProject(userA, projectA)).rejects.toMatchObject({ status: 409 });
    await service.updateProject(userA, projectA, { status: "ARCHIVED" });
    expect(await db.testResult.count({ where: { projectId: projectA } })).toBe(before);
    await service.updateProject(userA, projectA, { status: "ACTIVE" });
  });

  it("audita mudanças na mesma transação e isola a consulta entre contas", async () => {
    const before = await service.listAuditLogs(userA, projectA);
    await expect(service.createRun(userA, projectA, { name: "Inválido", testCaseIds: [caseB] })).rejects.toThrow();
    expect(await service.listAuditLogs(userA, projectA)).toHaveLength(before.length);
    await service.updateCase(userA, projectA, caseA, { priority: "CRITICAL" });
    const events = await service.listAuditLogs(userA, projectA);
    expect(events.some(event => event.action === "CASE_UPDATED" && event.subjectId === caseA && event.actorId === userA)).toBe(true);
    await expect(service.listAuditLogs(userB, projectA)).rejects.toMatchObject({ status: 404 });
    await expect(service.listAuditLogs(userA, projectA, "data inválida")).rejects.toMatchObject({ status: 400 });
  });

  it("exclui projeto vazio preservando o evento de exclusão", async () => {
    const project = await service.createProject(userA, { name: "Projeto vazio", clientName: "Cliente A" });
    await service.deleteProject(userA, project.id);
    expect(await db.project.findUnique({ where: { id: project.id } })).toBeNull();
    expect(await db.auditLog.count({ where: { projectId: project.id, action: "PROJECT_DELETED" } })).toBe(1);
  });

  it("pagina auditoria sem perder eventos com a mesma data", async () => {
    const project = await service.createProject(userA, { name: "Auditoria paginada", clientName: "Cliente A" });
    await db.auditLog.createMany({ data: Array.from({ length: 101 }, () => ({
      id: randomUUID(), workspaceId: project.workspaceId, projectId: project.id,
      actorId: userA, action: "PAGINATION_FIXTURE", createdAt: new Date(0),
    })) });
    const first = await service.listAuditLogs(userA, project.id);
    const second = await service.listAuditLogs(userA, project.id, first.at(-1)!.id);
    expect(first).toHaveLength(100);
    expect(second).toHaveLength(2);
    expect(new Set([...first, ...second].map(event => event.id)).size).toBe(102);
  });

  it("serializa atualização concorrente com encerramento e preserva o resultado final", async () => {
    const run = await service.createRun(userA, projectA, {
      name: "Ciclo com concorrência",
      testCaseIds: [caseA],
    });
    const result = run.results[0];
    const operations = await Promise.allSettled([
      service.completeRun(userA, projectA, run.id),
      service.updateResult(userA, projectA, run.id, result.id, {
        status: "PASSED",
        notes: "Atualização concorrente",
      }),
    ]);
    expect(operations[0].status).toBe("fulfilled");
    const saved = await service.getRun(userA, projectA, run.id);
    expect(saved.status).toBe("COMPLETED");
    if (operations[1].status === "rejected") {
      expect(operations[1].reason).toMatchObject({ status: 409 });
      expect(saved.results[0].status).toBe("NOT_RUN");
    } else {
      expect(saved.results[0].status).toBe("PASSED");
    }
    const finalStatus = saved.results[0].status;
    await expect(
      service.updateResult(userA, projectA, run.id, result.id, {
        status: "FAILED",
        notes: "Alteração depois do encerramento",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await service.getRun(userA, projectA, run.id)).results[0].status,
    ).toBe(finalStatus);
  });

  it("preserva o snapshot e bloqueia mudanças em ciclo encerrado", async () => {
    await service.updateResult(userA, projectA, runA, resultA, {
      status: "FAILED",
      notes: "Falha preservada no histórico.",
    });
    await service.completeRun(userA, projectA, runA);
    await service.updateCase(userA, projectA, caseA, {
      ...caseInput,
      title: "Título alterado após encerramento",
    });
    await expect(
      service.updateResult(userA, projectA, runA, resultA, {
        status: "PASSED",
        notes: "Tentativa tardia",
      }),
    ).rejects.toMatchObject({ status: 409 });
    const result = await db.testResult.findUniqueOrThrow({
      where: { id: resultA },
    });
    expect(result.status).toBe("FAILED");
    expect(result.notes).toBe("Falha preservada no histórico.");
    expect(result.caseTitle).toBe(caseInput.title);
    expect(result.caseSnapshot).toMatchObject({ title: caseInput.title });
    await expect(
      service.deleteCase(userA, projectA, caseA),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("deduplica o mesmo XML no projeto e permite importar em outro projeto", async () => {
    const first = await service.importJUnit(
      userA,
      projectA,
      xml,
      "Execução importada",
    );
    const duplicate = await service.importJUnit(
      userA,
      projectA,
      xml,
      "Não deve criar novo ciclo",
    );
    const differentProject = await service.importJUnit(
      userA,
      secondProjectA,
      xml,
      "Importação independente",
    );
    expect(first.duplicate).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.run.id).toBe(first.run.id);
    expect(differentProject.run.id).not.toBe(first.run.id);
    const imported = await service.getRun(userA, projectA, first.run.id);
    expect(imported.source).toBe("JUNIT_IMPORT");
    expect(imported.status).toBe("COMPLETED");
    expect(imported.results).toHaveLength(2);
    expect(imported.results.map((result) => result.status).sort()).toEqual([
      "FAILED",
      "PASSED",
    ]);
    expect(
      imported.results
        .map((result) => result.durationMs)
        .sort((a, b) => (a ?? 0) - (b ?? 0)),
    ).toEqual([250, 500]);
    expect(
      await db.testRun.count({
        where: {
          projectId: projectA,
          importedFileSha256: first.run.importedFileSha256,
        },
      }),
    ).toBe(1);
  });

  it("recusa importação em projeto externo e XML hostil sem persistir ciclo", async () => {
    await expect(
      service.importJUnit(userA, projectB, xml),
    ).rejects.toMatchObject({ status: 404 });
    const before = await db.testRun.count({ where: { projectId: projectA } });
    const hostile =
      '<!DOCTYPE testsuite [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><testsuite name="x"><testcase name="&xxe;"/></testsuite>';
    await expect(
      service.importJUnit(userA, projectA, hostile),
    ).rejects.toThrow();
    expect(await db.testRun.count({ where: { projectId: projectA } })).toBe(
      before,
    );
  });

  it("importações simultâneas do mesmo arquivo criam somente um ciclo", async () => {
    const concurrentXml = xml.replace(
      'name="Integração"',
      'name="Integração concorrente"',
    );
    const imported = await Promise.all([
      service.importJUnit(
        userA,
        projectA,
        concurrentXml,
        "Importação simultânea A",
      ),
      service.importJUnit(
        userA,
        projectA,
        concurrentXml,
        "Importação simultânea B",
      ),
    ]);
    expect(imported[0].run.id).toBe(imported[1].run.id);
    expect(imported.filter((result) => result.duplicate)).toHaveLength(1);
    expect(
      await db.testRun.count({
        where: {
          projectId: projectA,
          importedFileSha256: imported[0].run.importedFileSha256,
        },
      }),
    ).toBe(1);
  });
});
