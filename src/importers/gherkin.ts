import { AstBuilder, dialects, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin";
import { IdGenerator, StepKeywordType, type FeatureChild, type Scenario, type Step, type Tag } from "@cucumber/messages";

export const MAX_FEATURE_BYTES = 100 * 1024;
export class GherkinImportError extends Error {}
export type FeatureScenario = {
  name: string; line: number; key: string | null; tags: string[]; steps: string[];
  background: string[]; examples: string[][][]; description: string;
  requirementRef: string; automationRef: string;
  expectedResult: string;
};
export type FeaturePreview = { language: "pt" | "en"; name: string; scenarios: FeatureScenario[] };
function stepText(step: Step): string {
  const table = step.dataTable?.rows.map(row => `  | ${row.cells.map(cell => cell.value).join(" | ")} |`).join("\n");
  const doc = step.docString ? `  ${step.docString.delimiter}${step.docString.mediaType ?? ""}\n${step.docString.content}\n  ${step.docString.delimiter}` : "";
  return `${step.keyword}${step.text}${table ? `\n${table}` : ""}${doc ? `\n${doc}` : ""}`;
}

export function parseFeature(source: string): FeaturePreview {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(source)) throw new GherkinImportError("A fonte contém caracteres de controle inválidos.");
  if (!source.trim() || new TextEncoder().encode(source).byteLength > MAX_FEATURE_BYTES)
    throw new GherkinImportError("Envie um arquivo .feature de até 100 KiB, com conteúdo.");
  let document;
  try { document = new Parser(new AstBuilder(IdGenerator.incrementing()), new GherkinClassicTokenMatcher()).parse(source); }
  catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1200) : "Sintaxe inválida.";
    throw new GherkinImportError(`Gherkin inválido. Confira a linha indicada: ${message}`);
  }
  const feature = document.feature;
  if (!feature || !["pt", "en"].includes(feature.language))
    throw new GherkinImportError("Informe Funcionalidade/Feature e use # language: pt ou # language: en.");
  const language = feature.language as "pt" | "en";
  const scenarios: FeatureScenario[] = [];
  const keys = new Set<string>();
  const background = feature.children.find(child => child.background)?.background?.steps.map(stepText) ?? [];
  function add(scenario: Scenario, inheritedTags: readonly Tag[], contexts: string[]) {
    if (scenarios.length >= 200 || !scenario.name.trim() || !scenario.steps.length || scenario.steps.length > 100)
      throw new GherkinImportError(`Linha ${scenario.location.line}: informe nome e 1–100 passos; limite de 200 cenários por arquivo.`);
    const tags = [...new Set([...inheritedTags, ...scenario.tags].map(tag => tag.name))];
    if (tags.some(tag => tag.length > 51) || tags.length > 30)
      throw new GherkinImportError(`Linha ${scenario.location.line}: há tags demais ou muito longas.`);
    const identities = tags.filter(tag => /^@(?:TC-\d+|(?:id|qa):[\p{L}\p{N}_.:-]+)$/u.test(tag));
    if (identities.length > 1) throw new GherkinImportError(`Linha ${scenario.location.line}: use uma única chave @TC-..., @id:... ou @qa:....`);
    const key = identities[0]?.slice(1) ?? null;
    if (key && keys.has(key)) throw new GherkinImportError(`Chave BDD repetida: ${key}. Cada cenário precisa de uma chave própria.`);
    if (key) keys.add(key);
    const examples = scenario.examples.map(example => {
      if (!example.tableHeader || !example.tableBody.length || example.tableBody.length > 200)
        throw new GherkinImportError(`Linha ${example.location.line}: preencha o cabeçalho e até 200 linhas de exemplos.`);
      const headers = example.tableHeader.cells.map(cell => cell.value);
      if (new Set(headers).size !== headers.length || headers.some(value => !value.trim()) || example.tableBody.some(row => row.cells.length !== headers.length))
        throw new GherkinImportError(`Linha ${example.location.line}: confira as colunas da tabela de exemplos.`);
      for (const step of scenario.steps) {
        for (const match of stepText(step).matchAll(/<([^<>]+)>/g)) {
          if (!headers.includes(match[1])) throw new GherkinImportError(`Linha ${step.location.line}: parâmetro <${match[1]}> não está nos exemplos.`);
        }
      }
      return [headers, ...example.tableBody.map(row => row.cells.map(cell => cell.value))];
    });
    if (dialects[language].scenarioOutline.some(keyword => keyword.trim() === scenario.keyword.trim()) && !examples.length)
      throw new GherkinImportError(`Linha ${scenario.location.line}: um esquema de cenário precisa de exemplos.`);
    const reference = (prefix: string) => tags.find(tag => tag.startsWith(`@${prefix}:`))?.slice(prefix.length + 2) ?? "";
    let outcome = false;
    const expected = scenario.steps.filter(step => {
      if (step.keywordType !== StepKeywordType.CONJUNCTION) outcome = step.keywordType === StepKeywordType.OUTCOME;
      return outcome;
    }).map(stepText).join("\n");
    scenarios.push({
      name: scenario.name, line: scenario.location.line, key, tags, description: scenario.description,
      steps: scenario.steps.map(stepText), background: contexts, examples,
      requirementRef: reference("requirement"), automationRef: reference("automation"),
      expectedResult: expected,
    });
  }
  function visit(child: FeatureChild) {
    if (child.scenario) add(child.scenario, feature!.tags, background);
    if (child.rule) {
      const context = child.rule.children.find(value => value.background)?.background?.steps.map(stepText) ?? [];
      for (const value of child.rule.children) if (value.scenario) add(value.scenario, [...feature!.tags, ...child.rule.tags], [...background, ...context]);
    }
  }
  feature.children.forEach(visit);
  if (!scenarios.length) throw new GherkinImportError("O arquivo precisa conter pelo menos um cenário com passos.");
  return { language, name: feature.name, scenarios };
}

export function featureWithKeys(source: string, scenarios: FeatureScenario[], keys: string[]) {
  const lines = source.split(/\r?\n/);
  for (let index = scenarios.length - 1; index >= 0; index--) {
    if (scenarios[index].key) continue;
    const line = scenarios[index].line - 1;
    const indent = lines[line].match(/^\s*/)?.[0] ?? "";
    lines.splice(line, 0, `${indent}@${keys[index]}`);
  }
  return lines.join("\n");
}

export function replaceFeatureKey(source: string, previous: string, next: string) {
  return source.split(/\r?\n/).map(line => line.trimStart().startsWith("@")
    ? line.split(/(\s+)/).map(token => token === `@${previous}` ? `@${next}` : token).join("")
    : line).join("\n");
}

export function originalFeatureSource(source: string, previous?: { gherkinSource: string; gherkinOriginalSource: string }) {
  return previous && source === previous.gherkinSource ? previous.gherkinOriginalSource : source;
}
