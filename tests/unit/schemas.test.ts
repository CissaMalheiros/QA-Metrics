import { describe, expect, it } from "vitest";
import {
  bugSchema,
  bugUpdateSchema,
  projectSchema,
  projectUpdateSchema,
  resultSchema,
  resultUpdateSchema,
  runSchema,
  testCaseSchema,
  testCaseUpdateSchema,
} from "../../src/domain/schemas";

describe("validação de entradas", () => {
  it("normaliza textos de projeto e aplica padrões", () => {
    expect(
      projectSchema.parse({ name: " Loja Web ", clientName: " Acme " }),
    ).toEqual({
      name: "Loja Web",
      clientName: "Acme",
      description: "",
      environment: "",
      status: "ACTIVE",
    });
  });

  it("recusa projetos sem nome ou cliente e estados inexistentes", () => {
    expect(
      projectSchema.safeParse({ name: " ", clientName: "Acme" }).success,
    ).toBe(false);
    expect(
      projectSchema.safeParse({ name: "Loja", clientName: "" }).success,
    ).toBe(false);
    expect(
      projectSchema.safeParse({
        name: "Loja",
        clientName: "Acme",
        status: "DONE",
      }).success,
    ).toBe(false);
  });

  it("exige passos e resultado esperado de casos manuais", () => {
    const valid = {
      title: "Efetuar login",
      steps: ["Abrir a tela", "Preencher dados"],
      expectedResult: "Painel exibido",
    };
    expect(testCaseSchema.parse(valid)).toMatchObject({
      priority: "MEDIUM",
      description: "",
      preconditions: "",
    });
    expect(testCaseSchema.safeParse({ ...valid, steps: [] }).success).toBe(
      false,
    );
    expect(testCaseSchema.safeParse({ ...valid, steps: [" "] }).success).toBe(
      false,
    );
    expect(
      testCaseSchema.safeParse({ ...valid, expectedResult: " " }).success,
    ).toBe(false);
  });

  it("limita volume dos campos", () => {
    expect(
      projectSchema.safeParse({ name: "a".repeat(121), clientName: "Acme" })
        .success,
    ).toBe(false);
    expect(
      resultSchema.safeParse({ status: "PASSED", notes: "a".repeat(5001) })
        .success,
    ).toBe(false);
    expect(
      testCaseSchema.safeParse({
        title: "Login",
        steps: Array(101).fill("Abrir"),
        expectedResult: "OK",
      }).success,
    ).toBe(false);
  });

  it("exige uma seleção única de casos por ciclo", () => {
    expect(
      runSchema.safeParse({ name: "Regressão", testCaseIds: [] }).success,
    ).toBe(false);
    expect(
      runSchema.safeParse({ name: "Regressão", testCaseIds: ["a", "a"] })
        .success,
    ).toBe(false);
    expect(
      runSchema.parse({ name: "Regressão", testCaseIds: ["a", "b"] })
        .testCaseIds,
    ).toEqual(["a", "b"]);
  });

  it("aceita somente situações de resultado conhecidas", () => {
    expect(resultSchema.parse({ status: "BLOCKED" })).toEqual({
      status: "BLOCKED",
      notes: "",
    });
    expect(resultSchema.safeParse({ status: "OPEN" }).success).toBe(false);
  });

  it("exige descrição de bug e normaliza vínculo opcional", () => {
    const valid = {
      title: "Login não funciona",
      description: "Erro após enviar credenciais.",
    };
    expect(bugSchema.parse(valid)).toMatchObject({
      severity: "MEDIUM",
      status: "OPEN",
      testResultId: null,
    });
    expect(
      bugSchema.parse({ ...valid, testResultId: "" }).testResultId,
    ).toBeNull();
    expect(
      bugSchema.parse({ ...valid, testResultId: "result-id" }).testResultId,
    ).toBe("result-id");
    expect(bugSchema.safeParse({ ...valid, description: " " }).success).toBe(
      false,
    );
    expect(bugSchema.safeParse({ ...valid, severity: "URGENT" }).success).toBe(
      false,
    );
  });

  it("remove campos de autorização que não fazem parte dos formulários", () => {
    const value = projectSchema.parse({
      name: "Projeto",
      clientName: "Cliente",
      workspaceId: "outro-workspace",
    });
    expect(value).not.toHaveProperty("workspaceId");
  });

  it("não redefine campos ausentes em uma atualização parcial", () => {
    expect(projectUpdateSchema.parse({ name: "Outro nome" })).toEqual({
      name: "Outro nome",
    });
    expect(testCaseUpdateSchema.parse({ title: "Outro título" })).toEqual({
      title: "Outro título",
    });
    expect(bugUpdateSchema.parse({ title: "Outro título" })).toEqual({
      title: "Outro título",
    });
    expect(projectUpdateSchema.parse({})).toEqual({});
    expect(testCaseUpdateSchema.parse({})).toEqual({});
    expect(bugUpdateSchema.parse({})).toEqual({});
    expect(resultUpdateSchema.parse({ status: "PASSED" })).toEqual({
      status: "PASSED",
    });
    expect(resultUpdateSchema.parse({ notes: "Observação ajustada" })).toEqual({
      notes: "Observação ajustada",
    });
    expect(resultUpdateSchema.parse({})).toEqual({});
  });

  it("mantém validações em PATCH e só limpa vínculo de bug quando solicitado", () => {
    expect(bugUpdateSchema.parse({ testResultId: "" })).toEqual({
      testResultId: null,
    });
    expect(bugUpdateSchema.parse({ testResultId: null })).toEqual({
      testResultId: null,
    });
    expect(bugUpdateSchema.parse({ testResultId: "result-id" })).toEqual({
      testResultId: "result-id",
    });
    expect(projectUpdateSchema.safeParse({ name: "" }).success).toBe(false);
    expect(testCaseUpdateSchema.safeParse({ priority: "URGENT" }).success).toBe(
      false,
    );
    expect(bugUpdateSchema.safeParse({ severity: "URGENT" }).success).toBe(
      false,
    );
  });
});
