import { Prisma } from "@/generated/prisma/client";
import { ZodError } from "zod";

export class ServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ServiceError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    const fields: Record<string, string> = {
      name: "nome",
      clientName: "cliente",
      description: "descrição",
      environment: "ambiente",
      title: "título",
      preconditions: "pré-condições",
      steps: "passos",
      expectedResult: "resultado esperado",
      priority: "prioridade",
      status: "situação",
      severity: "severidade",
      testCaseIds: "casos selecionados",
      testResultId: "resultado vinculado",
      notes: "observações",
      stepsToReproduce: "passos de reprodução",
    };
    const message = error.issues
      .slice(0, 5)
      .map((issue) => {
        const field = fields[String(issue.path[0])] ?? "formulário";
        if (issue.code === "invalid_type") return `Confira o campo ${field}.`;
        if (issue.code === "invalid_value")
          return `Selecione uma opção válida para ${field}.`;
        return issue.message;
      })
      .join(" · ");
    return Response.json(
      { error: message || "Confira os dados informados." },
      { status: 400 },
    );
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return Response.json(
        {
          error:
            "Este registro já existe. Atualize a página e tente novamente.",
        },
        { status: 409 },
      );
    }
    if (error.code === "P2003") {
      return Response.json(
        { error: "O registro possui vínculos que precisam ser preservados." },
        { status: 409 },
      );
    }
    if (error.code === "P2025") {
      return Response.json(
        { error: "Registro não encontrado." },
        { status: 404 },
      );
    }
    if (error.code === "P2034") {
      return Response.json(
        {
          error: "Os dados foram alterados em outra operação. Tente novamente.",
        },
        { status: 409 },
      );
    }
  }
  console.error(
    "QA Metrics: falha interna",
    error instanceof Error ? error.name : "UnknownError",
  );
  return Response.json(
    {
      error:
        "Não foi possível concluir a operação. Verifique a conexão com o banco e tente novamente.",
    },
    { status: 500 },
  );
}
