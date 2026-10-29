import "dotenv/config";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import type { ResultStatus } from "../src/generated/prisma/client";

async function main() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("O seed é permitido apenas com NODE_ENV=development.");
  }
  const email = process.env.DEMO_EMAIL?.trim();
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password || password.length < 10 || password.length > 128) {
    throw new Error(
      "Defina DEMO_EMAIL e DEMO_PASSWORD (entre 10 e 128 caracteres). Nenhuma senha padrão é criada.",
    );
  }
  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    const result = await auth.api.signUpEmail({
      body: { email, password, name: "QA de demonstração" },
    });
    user = await db.user.findUniqueOrThrow({ where: { id: result.user.id } });
  }
  const workspace = await db.workspace.upsert({
    where: { ownerId: user.id },
    update: {},
    create: {
      name: "Meu workspace",
      ownerId: user.id,
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });
  const examples = [
    {
      name: "Portal do cliente · demonstração",
      clientName: "Aurora Digital",
      description: "Fluxos de acesso, perfil e atendimento do portal web.",
      environment: "Homologação",
    },
    {
      name: "Aplicativo de compras · demonstração",
      clientName: "Aurora Digital",
      description: "Jornada de catálogo, carrinho e finalização de compras.",
      environment: "Staging",
    },
    {
      name: "API de pagamentos · demonstração",
      clientName: "Horizonte Fintech",
      description: "Contratos e regras dos serviços de pagamento.",
      environment: "Sandbox",
    },
  ];
  let created = 0;
  for (const example of examples) {
    const exists = await db.project.findFirst({
      where: { workspaceId: workspace.id, name: example.name },
    });
    if (exists) continue;
    await db.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: { ...example, workspaceId: workspace.id },
      });
      const specs = [
        {
          title: "Autenticar com credenciais válidas",
          priority: "CRITICAL" as const,
          steps: [
            "Acessar a tela de login",
            "Informar credenciais válidas",
            "Confirmar o acesso",
          ],
          expectedResult: "O usuário acessa sua área autenticada.",
        },
        {
          title: "Validar campos obrigatórios",
          priority: "HIGH" as const,
          steps: [
            "Abrir o formulário principal",
            "Enviar sem preencher campos obrigatórios",
          ],
          expectedResult: "O sistema exibe mensagens de validação por campo.",
        },
        {
          title: "Concluir operação principal",
          priority: "CRITICAL" as const,
          steps: [
            "Preencher os dados da operação",
            "Revisar os valores",
            "Confirmar a operação",
          ],
          expectedResult:
            "A operação é persistida e uma confirmação é apresentada.",
        },
        {
          title: "Exibir histórico de atividades",
          priority: "MEDIUM" as const,
          steps: [
            "Acessar o histórico",
            "Filtrar o período",
            "Abrir o detalhe de uma atividade",
          ],
          expectedResult:
            "O histórico apresenta somente as atividades do contexto selecionado.",
        },
      ];
      const cases = [];
      for (const spec of specs) {
        cases.push(
          await tx.testCase.create({
            data: {
              ...spec,
              projectId: project.id,
              preconditions: "Ambiente de demonstração disponível.",
              description: "Caso criado pelo seed opcional de demonstração.",
              origin: "MANUAL",
            },
          }),
        );
      }
      const finished = new Date(Date.now() - 86_400_000);
      const previous = await tx.testRun.create({
        data: {
          projectId: project.id,
          name: "Regressão inicial · demonstração",
          status: "COMPLETED",
          source: "MANUAL",
          startedAt: new Date(finished.getTime() - 3_600_000),
          finishedAt: finished,
        },
      });
      const statuses: ResultStatus[] = [
        "PASSED",
        "PASSED",
        "FAILED",
        "SKIPPED",
      ];
      const results = [];
      for (const [index, testCase] of cases.entries()) {
        results.push(
          await tx.testResult.create({
            data: {
              projectId: project.id,
              runId: previous.id,
              testCaseId: testCase.id,
              caseTitle: testCase.title,
              caseSnapshot: {
                title: testCase.title,
                description: testCase.description,
                preconditions: testCase.preconditions,
                steps: testCase.steps,
                expectedResult: testCase.expectedResult,
                priority: testCase.priority,
                origin: testCase.origin,
              },
              status: statuses[index],
              executedAt: finished,
              notes:
                index === 2
                  ? "A confirmação não foi exibida no ambiente de demonstração."
                  : "Resultado ilustrativo do seed opcional.",
            },
          }),
        );
      }
      const current = await tx.testRun.create({
        data: {
          projectId: project.id,
          name: "Validação da próxima entrega · demonstração",
          status: "OPEN",
          source: "MANUAL",
        },
      });
      for (const [index, testCase] of cases.entries()) {
        await tx.testResult.create({
          data: {
            projectId: project.id,
            runId: current.id,
            testCaseId: testCase.id,
            caseTitle: testCase.title,
            caseSnapshot: {
              title: testCase.title,
              description: testCase.description,
              preconditions: testCase.preconditions,
              steps: testCase.steps,
              expectedResult: testCase.expectedResult,
              priority: testCase.priority,
              origin: testCase.origin,
            },
            status:
              index === 0 ? "PASSED" : index === 3 ? "BLOCKED" : "NOT_RUN",
            executedAt: index === 0 || index === 3 ? new Date() : null,
            notes:
              index === 3
                ? "Aguardando liberação do ambiente de demonstração."
                : "",
          },
        });
      }
      await tx.bug.create({
        data: {
          projectId: project.id,
          testResultId: results[2].id,
          title: "Confirmação da operação não aparece · demonstração",
          description:
            "Após confirmar, a interface permanece no formulário sem informar o resultado.",
          stepsToReproduce:
            "1. Abrir a operação principal\n2. Preencher dados válidos\n3. Confirmar e observar a tela",
          severity: "HIGH",
          status: "OPEN",
        },
      });
      await tx.bug.create({
        data: {
          projectId: project.id,
          title: "Texto de ajuda truncado em telas pequenas · demonstração",
          description: "Mensagem de ajuda não quebra linha em resolução móvel.",
          stepsToReproduce: "Abrir o formulário em uma tela de 375 px.",
          severity: "LOW",
          status: "IN_PROGRESS",
        },
      });
    });
    created++;
  }
  console.log(
    `Seed concluído: ${created} projeto(s) de demonstração criado(s). Projetos existentes foram preservados.`,
  );
  console.log(
    "Entre usando o email e a senha definidos em DEMO_EMAIL e DEMO_PASSWORD.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Erro ao executar seed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
