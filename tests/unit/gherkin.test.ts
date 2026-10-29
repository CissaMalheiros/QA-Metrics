import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { featureWithKeys, MAX_FEATURE_BYTES, parseFeature, replaceFeatureKey } from "../../src/importers/gherkin";

const pt = readFileSync("tests/fixtures/login.feature", "utf8");
describe("especificação Gherkin, sem executar passos", () => {
  it("lê português, contexto, tags, referências e resultados esperados", () => {
    const result = parseFeature(pt);
    expect(result.language).toBe("pt");
    expect(result.scenarios[0]).toMatchObject({ key: "id:login-principal", requirementRef: "REQ-LOGIN", automationRef: "login-principal", expectedResult: "Então vejo o painel do produto" });
    expect(result.scenarios[0].background).toEqual(["Dado que o ambiente de QA está disponível"]);
  });
  it("lê inglês, outlines, exemplos e tabelas/docstrings sem executar código", () => {
    const result = parseFeature('Feature: API\n @id:api\n Scenario Outline: Check response\n  Given payload\n   """json\n   {"script":"do not execute"}\n   """\n  When I send <value>\n  Then status is correct\n  And body is correct\n   | field | value |\n   | id | 1 |\n  Examples:\n   | value |\n   | one |\n   | two |\n');
    expect(result.scenarios[0].examples[0]).toHaveLength(3);
    expect(result.scenarios[0].steps[0]).toContain('"script":"do not execute"');
    expect(result.scenarios[0].expectedResult).toContain("And body is correct");
  });
  it("não usa título ou posição como identidade e insere tags estáveis na exportação", () => {
    const source = "Feature: Login\n Scenario: One\n  Given input\n  Then output\n Scenario: Two\n  Given input\n  Then output\n";
    const parsed = parseFeature(source);
    expect(parsed.scenarios.map(value => value.key)).toEqual([null, null]);
    const tagged = featureWithKeys(source, parsed.scenarios, ["qa:one", "qa:two"]);
    expect(parseFeature(tagged).scenarios.map(value => value.key)).toEqual(["qa:one", "qa:two"]);
    expect(parseFeature(replaceFeatureKey(tagged, "qa:one", "qa:copy")).scenarios[0].key).toBe("qa:copy");
  });
  it.each([
    "isto não é Gherkin",
    "Feature: Empty\n Scenario: No steps\n",
    'Feature: Invalid\n Scenario: Broken\n  Given payload\n   """\n   missing closing delimiter\n',
    "Feature: Repeated\n @id:x\n Scenario: One\n  Given step\n @id:x\n Scenario: Two\n  Given step\n",
    "Feature: Outline\n Scenario Outline: Missing examples\n  Given <value>\n",
    "Feature: Outline\n Scenario Outline: Missing parameter\n  Given <missing>\n  Examples:\n   | other |\n   | one |\n",
    "# language: fr\nFonctionnalité: Autre\n Scénario: Un\n  Soit une chose\n",
    "Feature: Bad\u0000\n Scenario: Case\n  Given input\n",
  ])("recusa sintaxe, identidade ou conteúdo inválido", source => expect(() => parseFeature(source)).toThrow());
  it("limita o tamanho em bytes, incluindo caracteres multibyte", () => {
    expect(() => parseFeature("á".repeat(MAX_FEATURE_BYTES))).toThrow(/100 KiB/);
  });
});
