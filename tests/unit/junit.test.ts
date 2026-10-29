import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  JUnitImportError,
  MAX_JUNIT_BYTES,
  parseJUnit,
} from "../../src/importers/junit";

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url));
const report = (cases: string, suite = "Smoke") =>
  `<testsuite name="${suite}">${cases}</testsuite>`;

describe("importador JUnit XML", () => {
  it("lê relatório representativo do Playwright com falha, erro e skipped", () => {
    const bytes = fixture("playwright.xml");
    const value = parseJUnit(bytes);
    expect(value.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(value.suiteCount).toBe(1);
    expect(value.cases.map((entry) => entry.status)).toEqual([
      "PASSED",
      "FAILED",
      "SKIPPED",
      "FAILED",
    ]);
    expect(value.cases.map((entry) => entry.durationMs)).toEqual([
      1230, 2000, 0, 200,
    ]);
    expect(value.cases[1].errorMessage).toContain("Expected: visible");
    expect(value.cases[1].errorMessage).not.toContain("log ignorado");
    expect(value.cases[3].errorMessage).toContain("ECONNREFUSED");
  });

  it("lê relatório representativo Mocha/Cypress e decodifica entidades seguras", () => {
    const value = parseJUnit(fixture("cypress.xml"));
    expect(value.suiteCount).toBe(2);
    expect(value.cases).toHaveLength(3);
    expect(value.cases[1]).toMatchObject({
      title: "Área do cliente valida email & senha",
      status: "FAILED",
      durationMs: 300,
    });
    expect(value.cases[2]).toMatchObject({
      status: "SKIPPED",
      errorMessage: null,
    });
  });

  it("aceita raiz testsuite única e ausência de duração", () => {
    expect(
      parseJUnit(report('<testcase name="Login"/>')).cases[0],
    ).toMatchObject({ title: "Login", durationMs: null, status: "PASSED" });
  });

  it("percorre suítes aninhadas e distingue nomes/classes/caminhos de suíte", () => {
    const value = parseJUnit(
      '<testsuites><testsuite name="Web"><testsuite name="Login"><testcase name="Entrar" classname="chrome"/><testcase name="Entrar" classname="firefox"/></testsuite></testsuite><testsuite name="API"><testcase name="Entrar" classname="chrome"/></testsuite></testsuites>',
    );
    expect(value.cases).toHaveLength(3);
    expect(new Set(value.cases.map((entry) => entry.externalKey)).size).toBe(3);
    expect(value.cases[0].description).toContain("Web / Login");
  });

  it("mantém identidade estável quando resultado/duração mudam", () => {
    const first = parseJUnit(
      report('<testcase name="Login" classname="Auth" time="1"/>'),
    );
    const next = parseJUnit(
      report(
        '<testcase name="Login" classname="Auth" time="2"><failure message="erro"/></testcase>',
      ),
    );
    expect(first.cases[0].externalKey).toBe(next.cases[0].externalKey);
    expect(first.sha256).not.toBe(next.sha256);
  });

  it("usa identidade sem colisão por delimitadores do nome", () => {
    const value = parseJUnit(
      report(
        '<testcase name="b::c" classname="a"/><testcase name="c" classname="a::b"/>',
      ),
    );
    expect(value.cases[0].externalKey).not.toBe(value.cases[1].externalKey);
  });

  it("rejeita duplicatas em um arquivo em vez de perder silenciosamente uma tentativa", () => {
    expect(() =>
      parseJUnit(report('<testcase name="Login"/><testcase name="Login"/>')),
    ).toThrow("duplicado");
  });

  it("recusa XML vazio, malformado, raiz incorreta, sem casos ou nome", () => {
    for (const xml of [
      "",
      "<",
      "<html/>",
      "<testsuites/>",
      report(""),
      report("<testcase/>"),
      "<testsuite/><testsuite/>",
    ]) {
      expect(() => parseJUnit(xml)).toThrow(JUnitImportError);
    }
    expect(() => parseJUnit(fixture("invalid.xml"))).toThrow(JUnitImportError);
  });

  it("recusa XXE, DTD externo e expansão de entidades antes de materializar a árvore", () => {
    expect(() => parseJUnit(fixture("xxe.xml"))).toThrow("DOCTYPE");
    expect(() =>
      parseJUnit(
        '<!DOCTYPE testsuite SYSTEM "https://example.test/report.dtd">' +
          report('<testcase name="A"/>'),
      ),
    ).toThrow("DOCTYPE");
    expect(() =>
      parseJUnit(
        '<!DOCTYPE testsuite [<!ENTITY a "aaaaaaaa"><!ENTITY b "&a;&a;&a;">]>' +
          report('<testcase name="A"><failure>&b;</failure></testcase>'),
      ),
    ).toThrow("DOCTYPE");
  });

  it("recusa entidades customizadas sem DTD e referências de caractere inválidas", () => {
    expect(() => parseJUnit(report('<testcase name="&secret;"/>'))).toThrow(
      "entidade",
    );
    expect(() => parseJUnit(report('<testcase name="&#0;"/>'))).toThrow(
      "caractere inválida",
    );
    expect(() => parseJUnit(report('<testcase name="&#x110000;"/>'))).toThrow(
      "caractere inválida",
    );
  });

  it("preserva CDATA como texto e decodifica cada entidade apenas uma vez", () => {
    const value = parseJUnit(
      report(
        '<testcase name="&#x4c;ogin &amp; acesso"><failure message="A &lt; B"><![CDATA[&amp; <script>alert(1)</script> <!DOCTYPE html>]]></failure></testcase>',
      ),
    );
    expect(value.cases[0].title).toBe("Login & acesso");
    expect(value.cases[0].errorMessage).toContain("A < B");
    expect(value.cases[0].errorMessage).toContain(
      "&amp; <script>alert(1)</script>",
    );
    expect(
      parseJUnit(report('<testcase name="&amp;lt;"/>')).cases[0].title,
    ).toBe("&lt;");
  });

  it("prioriza falha sobre skipped quando o emissor fornece os dois", () => {
    expect(
      parseJUnit(
        report(
          '<testcase name="Conflito"><skipped/><error message="falha"/></testcase>',
        ),
      ).cases[0].status,
    ).toBe("FAILED");
  });

  it("limita o arquivo a 5 MiB antes do parsing", () => {
    expect(() => parseJUnit(Buffer.alloc(MAX_JUNIT_BYTES + 1, 65))).toThrow(
      "5 MB",
    );
    expect(() => parseJUnit("é".repeat(MAX_JUNIT_BYTES / 2 + 1))).toThrow(
      "5 MB",
    );
  });

  it("limita profundidade, quantidade de nós e casos", () => {
    expect(() =>
      parseJUnit(
        "<testsuites>" +
          '<testsuite name="nested">'.repeat(65) +
          '<testcase name="A"/>' +
          "</testsuite>".repeat(65) +
          "</testsuites>",
      ),
    ).toThrow("complexidade");
    expect(() => parseJUnit(report("<property/>".repeat(100_001)))).toThrow(
      "complexidade",
    );
    const cases = Array.from(
      { length: 10_001 },
      (_, index) => `<testcase name="case-${index}"/>`,
    ).join("");
    expect(() => parseJUnit(report(cases))).toThrow("10.000 casos");
  });

  it("limita mensagens e títulos de saída", () => {
    const value = parseJUnit(
      report(
        `<testcase name="${"a".repeat(300)}"><failure message="${"b".repeat(12_000)}"/></testcase>`,
      ),
    );
    expect(value.cases[0].title).toHaveLength(200);
    expect(value.cases[0].errorMessage).toHaveLength(8000);
  });

  it.each(["-1", "NaN", "Infinity", "1e99", "2147483.648", "0x10"])(
    "recusa duração inválida %s",
    (time) => {
      expect(() =>
        parseJUnit(report(`<testcase name="A" time="${time}"/>`)),
      ).toThrow("Duração inválida");
    },
  );

  it("aceita o limite de duração armazenável sem overflow no PostgreSQL", () => {
    expect(
      parseJUnit(report('<testcase name="Limite" time="2147483.647"/>'))
        .cases[0].durationMs,
    ).toBe(2_147_483_647);
  });

  it("recusa bytes UTF-8 inválidos e codificação não suportada", () => {
    expect(() => parseJUnit(Buffer.from([0xff, 0xfe, 0xff]))).toThrow("UTF-8");
    expect(() =>
      parseJUnit(
        '<?xml version="1.0" encoding="UTF-16"?>' +
          report('<testcase name="A"/>'),
      ),
    ).toThrow("UTF-8");
  });

  it("aceita BOM UTF-8 sem alterar hash dos bytes originais", () => {
    const input = Buffer.from("\ufeff" + report('<testcase name="A"/>'));
    expect(parseJUnit(input).sha256).toBe(
      createHash("sha256").update(input).digest("hex"),
    );
  });
});
