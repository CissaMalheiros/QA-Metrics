import { Prisma } from "@/generated/prisma/client";
import type { TestCase } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  bugSchema,
  bugUpdateSchema,
  projectSchema,
  projectUpdateSchema,
  resultUpdateSchema,
  runSchema,
  testCaseSchema,
  testCaseUpdateSchema,
} from "@/domain/schemas";
import { calculateMetrics } from "@/domain/metrics";
import { JUnitImportError, parseJUnit } from "@/importers/junit";
import { ServiceError } from "@/server/errors";
import { recordAudit } from "@/server/audit";

type DataClient = Prisma.TransactionClient;
const projectCounts = { testCases: true, runs: true, bugs: true, suites: true, environments: true, releases: true } as const;
const runInclude = { results: { orderBy: { id: "asc" as const } } } as const;
const bugInclude = {
  testResult: {
    select: { id: true, caseTitle: true, status: true, runId: true },
  },
} as const;

function membership(userId: string) {
  return { workspace: { members: { some: { userId } } } };
}

export async function getWorkspace(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true },
  });
  if (!user) throw new ServiceError(401, "Entre na sua conta para continuar.");
  try {
    return await db.workspace.upsert({
      where: { ownerId: userId },
      create: {
        name: `Espaço de ${user.name}`,
        ownerId: userId,
        members: { create: { userId, role: "OWNER" } },
      },
      update: {},
    });
  } catch (error) {
    // Concurrent first requests may both attempt the nested workspace/member insert.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const workspace = await db.workspace.findUnique({
        where: { ownerId: userId },
      });
      if (workspace) return workspace;
    }
    throw error;
  }
}

export async function requireProject(
  userId: string,
  projectId: string,
  client: DataClient = db,
) {
  const project = await client.project.findFirst({
    where: { id: projectId, ...membership(userId) },
    include: { _count: { select: projectCounts } },
  });
  if (!project) throw new ServiceError(404, "Projeto não encontrado.");
  return project;
}

// The project row serializes related writes, including completion/result edits.
// A finished run cannot be changed by a request that raced with its completion.
export async function withProject<T>(
  userId: string,
  projectId: string,
  operation: string,
  action: (client: DataClient) => Promise<T>,
) {
  return db.$transaction(
    async (client) => {
      const project = await requireProject(userId, projectId, client);
      await client.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
      const result = await action(client);
      await recordAudit(client, { workspaceId: project.workspaceId, projectId, actorId: userId, action: operation }, result);
      return result;
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

function snapshot(testCase: TestCase): Prisma.InputJsonObject {
  return {
    id: testCase.id,
    number: testCase.number,
    revision: testCase.revision,
    suiteId: testCase.suiteId,
    tags: testCase.tags,
    type: testCase.type,
    state: testCase.state,
    format: testCase.format,
    gherkinSource: testCase.gherkinSource,
    gherkinKey: testCase.gherkinKey,
    gherkinLanguage: testCase.gherkinLanguage,
    requirementRef: testCase.requirementRef,
    automationRef: testCase.automationRef,
    title: testCase.title,
    description: testCase.description,
    preconditions: testCase.preconditions,
    steps: testCase.steps,
    expectedResult: testCase.expectedResult,
    priority: testCase.priority,
    origin: testCase.origin,
  };
}

export async function listProjects(userId: string) {
  await getWorkspace(userId);
  return db.project.findMany({
    where: membership(userId),
    include: { _count: { select: projectCounts } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOverview(userId: string) {
  const workspace = await getWorkspace(userId);
  const [user, projects, runs, bugs] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    }),
    listProjects(userId),
    db.testRun.findMany({
      where: { project: membership(userId) },
      include: {
        ...runInclude,
        project: { select: { id: true, name: true, clientName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.bug.findMany({
      where: { project: membership(userId) },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    user,
    workspace,
    projects,
    runs,
    bugs,
    metrics: calculateMetrics(runs.flatMap((run) => run.results)),
  };
}

export async function createProject(userId: string, input: unknown) {
  const data = projectSchema.parse(input);
  const workspace = await getWorkspace(userId);
  const member = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
  });
  if (!member)
    throw new ServiceError(
      403,
      "Você não tem acesso a este espaço de trabalho.",
    );
  return db.$transaction(async (client) => {
    const project = await client.project.create({
      data: { ...data, workspaceId: workspace.id },
      include: { _count: { select: projectCounts } },
    });
    await recordAudit(client, { workspaceId: workspace.id, projectId: project.id, actorId: userId, action: "PROJECT_CREATED" }, project);
    return project;
  });
}

export async function getProject(userId: string, projectId: string) {
  const project = await requireProject(userId, projectId);
  const [cases, runs, bugs, suites] = await Promise.all([
    db.testCase.findMany({
      where: { projectId, project: membership(userId) },
      orderBy: { createdAt: "desc" },
    }),
    db.testRun.findMany({
      where: { projectId, project: membership(userId) },
      include: runInclude,
      orderBy: { createdAt: "desc" },
    }),
    db.bug.findMany({
      where: { projectId, project: membership(userId) },
      include: bugInclude,
      orderBy: { createdAt: "desc" },
    }),
    db.testSuite.findMany({ where: { projectId }, orderBy: { name: "asc" } }),
  ]);
  return {
    project,
    cases,
    suites,
    runs,
    bugs,
    metrics: calculateMetrics(runs.flatMap((run) => run.results)),
  };
}

export async function updateProject(
  userId: string,
  projectId: string,
  input: unknown,
) {
  const data = projectUpdateSchema.parse(input);
  return withProject(userId, projectId, "PROJECT_UPDATED", (client) =>
    client.project.update({
      where: { id: projectId },
      data,
      include: { _count: { select: projectCounts } },
    }),
  );
}

export async function deleteProject(userId: string, projectId: string) {
  await withProject(userId, projectId, "PROJECT_DELETED", async (client) => {
    const populated = await client.project.findUniqueOrThrow({ where: { id: projectId }, include: { _count: { select: projectCounts } } });
    if (Object.values(populated._count).some(count => count > 0)) {
      throw new ServiceError(409, "Este projeto possui registros. Arquive-o para preservar seus casos, ciclos e defeitos.");
    }
    await client.project.delete({ where: { id: projectId } });
  });
  return { deleted: true };
}

export async function listCases(userId: string, projectId: string) {
  await requireProject(userId, projectId);
  return db.testCase.findMany({
    where: { projectId, project: membership(userId) },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCase(
  userId: string,
  projectId: string,
  caseId: string,
) {
  await requireProject(userId, projectId);
  const testCase = await db.testCase.findFirst({
    where: { id: caseId, projectId, project: membership(userId) },
  });
  if (!testCase) throw new ServiceError(404, "Caso de teste não encontrado.");
  return testCase;
}

export async function createCase(
  userId: string,
  projectId: string,
  input: unknown,
) {
  const data = testCaseSchema.parse(input);
  return withProject(userId, projectId, "CASE_CREATED", async (client) => {
    await validateSuiteId(client, projectId, data.suiteId);
    return client.testCase.create({ data: { ...data, projectId, origin: "MANUAL", updatedBy: userId } });
  });
}

export async function updateCase(
  userId: string,
  projectId: string,
  caseId: string,
  input: unknown,
) {
  const data = testCaseUpdateSchema.parse(input);
  return withProject(userId, projectId, "CASE_UPDATED", async (client) => {
    const testCase = await client.testCase.findFirst({
      where: { id: caseId, projectId },
    });
    if (!testCase) throw new ServiceError(404, "Caso de teste não encontrado.");
    if (testCase.format === "BDD" && ["title", "description", "preconditions", "steps", "expectedResult"].some(field => field in data))
      throw new ServiceError(409, "Edite a fonte Gherkin para alterar a definição deste caso BDD.");
    await validateSuiteId(client, projectId, data.suiteId);
    return client.testCase.update({ where: { id: caseId }, data: { ...data, updatedBy: userId } });
  });
}

export async function deleteCase(
  userId: string,
  projectId: string,
  caseId: string,
) {
  return withProject(userId, projectId, "CASE_DELETED", async (client) => {
    const testCase = await client.testCase.findFirst({
      where: { id: caseId, projectId },
    });
    if (!testCase) throw new ServiceError(404, "Caso de teste não encontrado.");
    if (testCase.revision > 1 || await client.testResult.count({ where: { testCaseId: caseId } })) {
      throw new ServiceError(
        409,
        "Este caso possui revisões ou execuções. Arquive-o para preservar o histórico.",
      );
    }
    await client.testCase.delete({ where: { id: caseId } });
    return { deleted: true, id: caseId };
  });
}

export async function listRuns(userId: string, projectId: string) {
  await requireProject(userId, projectId);
  return db.testRun.findMany({
    where: { projectId, project: membership(userId) },
    include: runInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function getRun(userId: string, projectId: string, runId: string) {
  await requireProject(userId, projectId);
  const run = await db.testRun.findFirst({
    where: { id: runId, projectId, project: membership(userId) },
    include: runInclude,
  });
  if (!run) throw new ServiceError(404, "Ciclo não encontrado.");
  return run;
}

export async function createRun(
  userId: string,
  projectId: string,
  input: unknown,
) {
  const data = runSchema.parse(input);
  return withProject(userId, projectId, "RUN_CREATED", async (client) => {
    const cases = await client.testCase.findMany({
      where: { projectId, id: { in: data.testCaseIds }, state: { not: "ARCHIVED" } },
    });
    if (cases.length !== data.testCaseIds.length)
      throw new ServiceError(
        400,
        "Todos os casos devem pertencer a este projeto e não estar arquivados.",
      );
    const run = await client.testRun.create({
      data: { projectId, name: data.name, source: "MANUAL", status: "OPEN" },
    });
    await client.testResult.createMany({
      data: cases.map((testCase) => ({
        projectId,
        runId: run.id,
        testCaseId: testCase.id,
        caseTitle: testCase.title,
        caseSnapshot: snapshot(testCase),
        status: "NOT_RUN" as const,
      })),
    });
    return client.testRun.findUniqueOrThrow({
      where: { id: run.id },
      include: runInclude,
    });
  });
}

export async function updateResult(
  userId: string,
  projectId: string,
  runId: string,
  resultId: string,
  input: unknown,
) {
  const data = resultUpdateSchema.parse(input);
  return withProject(userId, projectId, "RESULT_UPDATED", async (client) => {
    const run = await client.testRun.findFirst({
      where: { id: runId, projectId },
    });
    if (!run) throw new ServiceError(404, "Ciclo não encontrado.");
    if (run.status !== "OPEN" || run.source !== "MANUAL")
      throw new ServiceError(
        409,
        "Ciclos encerrados ou importados não podem ser alterados.",
      );
    const result = await client.testResult.findFirst({
      where: { id: resultId, runId, projectId },
    });
    if (!result)
      throw new ServiceError(404, "Resultado não encontrado neste ciclo.");
    return client.testResult.update({
      where: { id: resultId },
      data: {
        ...data,
        ...(data.status !== undefined
          ? { executedAt: data.status === "NOT_RUN" ? null : new Date() }
          : {}),
      },
    });
  });
}

export async function completeRun(
  userId: string,
  projectId: string,
  runId: string,
) {
  return withProject(userId, projectId, "RUN_COMPLETED", async (client) => {
    const run = await client.testRun.findFirst({
      where: { id: runId, projectId },
      include: runInclude,
    });
    if (!run) throw new ServiceError(404, "Ciclo não encontrado.");
    if (run.status === "COMPLETED") return run;
    return client.testRun.update({
      where: { id: runId },
      data: { status: "COMPLETED", finishedAt: new Date() },
      include: runInclude,
    });
  });
}

export async function listBugs(userId: string, projectId: string) {
  await requireProject(userId, projectId);
  return db.bug.findMany({
    where: { projectId, project: membership(userId) },
    include: bugInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function getBug(userId: string, projectId: string, bugId: string) {
  await requireProject(userId, projectId);
  const bug = await db.bug.findFirst({
    where: { id: bugId, projectId, project: membership(userId) },
    include: bugInclude,
  });
  if (!bug) throw new ServiceError(404, "Defeito não encontrado.");
  return bug;
}

async function validateBugResult(
  client: DataClient,
  projectId: string,
  resultId: string | null | undefined,
) {
  if (!resultId) return;
  const result = await client.testResult.findFirst({
    where: { id: resultId, projectId },
  });
  if (!result)
    throw new ServiceError(
      400,
      "O resultado vinculado deve pertencer a este projeto.",
    );
}

export async function createBug(
  userId: string,
  projectId: string,
  input: unknown,
) {
  const data = bugSchema.parse(input);
  return withProject(userId, projectId, "BUG_CREATED", async (client) => {
    await validateBugResult(client, projectId, data.testResultId);
    return client.bug.create({
      data: { ...data, projectId },
      include: bugInclude,
    });
  });
}

export async function updateBug(
  userId: string,
  projectId: string,
  bugId: string,
  input: unknown,
) {
  const data = bugUpdateSchema.parse(input);
  return withProject(userId, projectId, "BUG_UPDATED", async (client) => {
    const bug = await client.bug.findFirst({ where: { id: bugId, projectId } });
    if (!bug) throw new ServiceError(404, "Defeito não encontrado.");
    await validateBugResult(client, projectId, data.testResultId);
    return client.bug.update({
      where: { id: bugId },
      data,
      include: bugInclude,
    });
  });
}

export async function deleteBug(
  userId: string,
  projectId: string,
  bugId: string,
) {
  return withProject(userId, projectId, "BUG_DELETED", async (client) => {
    const bug = await client.bug.findFirst({ where: { id: bugId, projectId } });
    if (!bug) throw new ServiceError(404, "Defeito não encontrado.");
    if (bug.testResultId) throw new ServiceError(409, "Este defeito possui vínculo com execução. Feche-o para preservar o histórico.");
    await client.bug.delete({ where: { id: bugId } });
    return { deleted: true, id: bugId };
  });
}

export async function importJUnit(
  userId: string,
  projectId: string,
  input: Buffer | string,
  name?: string,
) {
  await requireProject(userId, projectId);
  let parsed: ReturnType<typeof parseJUnit>;
  try {
    parsed = parseJUnit(input);
  } catch (error) {
    if (error instanceof JUnitImportError)
      throw new ServiceError(400, error.message);
    throw error;
  }
  const runName = (
    name?.trim() ||
    `Importação JUnit · ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date())}`
  ).slice(0, 200);
  try {
    return await withProject(userId, projectId, "JUNIT_IMPORTED", async (client) => {
      const existing = await client.testRun.findUnique({
        where: {
          projectId_importedFileSha256: {
            projectId,
            importedFileSha256: parsed.sha256,
          },
        },
        include: runInclude,
      });
      if (existing)
        return {
          run: existing,
          duplicate: true,
          importedCases: existing.results.length,
        };
      // Batch inserts keep large reports bounded without a query per testcase.
      for (let offset = 0; offset < parsed.cases.length; offset += 500) {
        await client.testCase.createMany({
          data: parsed.cases.slice(offset, offset + 500).map((testCase) => ({
            projectId,
            externalKey: testCase.externalKey,
            title: testCase.title,
            description: testCase.description,
            updatedBy: userId,
            origin: "JUNIT" as const,
            priority: "MEDIUM" as const,
            steps: [],
            expectedResult: "Teste automatizado aprovado.",
          })),
          skipDuplicates: true,
        });
      }
      const storedCases = await client.testCase.findMany({
        where: {
          projectId,
          externalKey: {
            in: parsed.cases.map((testCase) => testCase.externalKey),
          },
        },
      });
      const casesByKey = new Map(
        storedCases.map((testCase) => [testCase.externalKey, testCase]),
      );
      const now = new Date();
      const run = await client.testRun.create({
        data: {
          projectId,
          name: runName,
          source: "JUNIT_IMPORT",
          status: "COMPLETED",
          importedFileSha256: parsed.sha256,
          startedAt: now,
          finishedAt: now,
        },
      });
      for (let offset = 0; offset < parsed.cases.length; offset += 500) {
        await client.testResult.createMany({
          data: parsed.cases.slice(offset, offset + 500).map((imported) => {
            const testCase = casesByKey.get(imported.externalKey);
            if (!testCase)
              throw new ServiceError(
                500,
                "Não foi possível mapear os casos do relatório.",
              );
            return {
              projectId,
              runId: run.id,
              testCaseId: testCase.id,
              caseTitle: imported.title,
              caseSnapshot: {
                ...snapshot(testCase),
                title: imported.title,
                description: imported.description,
                origin: "JUNIT",
              },
              status: imported.status,
              durationMs: imported.durationMs,
              errorMessage: imported.errorMessage,
              executedAt: now,
            };
          }),
        });
      }
      const complete = await client.testRun.findUniqueOrThrow({
        where: { id: run.id },
        include: runInclude,
      });
      return {
        run: complete,
        duplicate: false,
        importedCases: parsed.cases.length,
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const run = await db.testRun.findFirst({
        where: {
          projectId,
          importedFileSha256: parsed.sha256,
          project: membership(userId),
        },
        include: runInclude,
      });
      if (run)
        return { run, duplicate: true, importedCases: run.results.length };
    }
    throw error;
  }
}

export async function listAuditLogs(userId: string, projectId: string, before?: string) {
  const project = await requireProject(userId, projectId);
  if (before && (before.length > 128 || !await db.auditLog.findFirst({
    where: { id: before, workspaceId: project.workspaceId, projectId }, select: { id: true },
  }))) throw new ServiceError(400, "Cursor de paginação inválido.");
  return db.auditLog.findMany({
    where: { workspaceId: project.workspaceId, projectId },
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });
}

export async function validateSuiteId(client: DataClient, projectId: string, suiteId: string | null | undefined) {
  if (suiteId && !await client.testSuite.findFirst({ where: { id: suiteId, projectId }, select: { id: true } }))
    throw new ServiceError(400, "A suíte deve pertencer a este projeto.");
}
