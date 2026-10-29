import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import type { Prisma, TestCase } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { CASE_ORIGINS, testCaseSchema } from "@/domain/schemas";
import { caseCode, suitePath } from "@/domain/cases";
import { CSV_FIELDS, CSVImportError, csvFieldLabels, mappedCSVRow, parseCSV, serializeCSV, suggestCSVMapping } from "@/importers/csv";
import { featureWithKeys, GherkinImportError, originalFeatureSource, parseFeature } from "@/importers/gherkin";
import { requireProject, withProject } from "@/server/services";
import { getCaseLibrary } from "@/server/case-library";
import { ServiceError } from "@/server/errors";

const inputSchema = z.object({
  source: z.string().max(262144), delimiter: z.enum([",", ";"]).optional(),
  mode: z.enum(["CREATE", "UPSERT"]),
  mapping: z.partialRecord(z.enum(CSV_FIELDS), z.string().min(1).max(200)).refine(value => Object.keys(value).length > 0, "Mapeie ao menos uma coluna."),
});
const aliases: Record<string, string> = { BAIXA: "LOW", MEDIA: "MEDIUM", ALTA: "HIGH", CRITICA: "CRITICAL", FUNCIONAL: "FUNCTIONAL", INTERFACE: "UI", INTEGRACAO: "INTEGRATION", SEGURANCA: "SECURITY", EXPLORATORIO: "EXPLORATORY", RASCUNHO: "DRAFT", PRONTO: "READY", ARQUIVADO: "ARCHIVED", TRADICIONAL: "STEPS", GHERKIN: "BDD" };
function enumValue(value: string) { const key = value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase(); return aliases[key] ?? key; }
function codeNumber(value: string | undefined) {
  if (!value?.trim()) return null;
  if (!/^(?:TC-)?\d+$/i.test(value.trim())) throw new CSVImportError("Informe código como TC-001 ou um número positivo.");
  return z.number().int().positive().max(2147483647).parse(Number(value.trim().replace(/^TC-/i, "")));
}
function cleanPath(value: string) {
  const names = value.split("/").map(name => name.trim()).filter(Boolean);
  if (names.length > 20 || names.some(name => name.length > 120)) throw new CSVImportError("Use suítes com até 20 níveis e nomes de até 120 caracteres.");
  return names.join("/");
}
function inputError(error: unknown): string {
  if (error instanceof ZodError) return error.issues.slice(0, 3).map(issue => `${csvFieldLabels[issue.path[0] as keyof typeof csvFieldLabels] ?? "Campo"}: ${issue.message}`).join(" · ");
  if (error instanceof CSVImportError || error instanceof GherkinImportError || error instanceof ServiceError && error.status < 500) return error.message;
  throw error;
}
function read(source: string, delimiter?: "," | ";") { try { return parseCSV(source, delimiter); } catch (error) { throw new ServiceError(400, inputError(error)); } }

export async function inspectCSV(userId: string, projectId: string, input: unknown) {
  await requireProject(userId, projectId);
  const data = inputSchema.pick({ source: true, delimiter: true }).parse(input);
  const parsed = read(data.source, data.delimiter);
  return { headers: parsed.headers, records: parsed.rows.length, delimiter: parsed.delimiter, mapping: suggestCSVMapping(parsed.headers) };
}

async function prepare(projectId: string, input: z.infer<typeof inputSchema>, client: Prisma.TransactionClient) {
  const parsed = read(input.source, input.delimiter);
  for (const header of Object.values(input.mapping)) if (header && !parsed.headers.includes(header)) throw new ServiceError(400, `A coluna “${header}” não existe no arquivo.`);
  const suites = await client.testSuite.findMany({ where: { projectId } });
  const suitePaths = suites.map(suite => ({ id: suite.id, path: cleanPath(suitePath(suite, suites)) }));
  const targetIds = new Set<string>(), newKeys = new Set<string>(), newSuites = new Set<string>(), bddKeys = new Set<string>();
  const rows = [];
  for (const row of parsed.rows) {
    const warnings: string[] = [];
    let raw: ReturnType<typeof mappedCSVRow> = {};
    try {
      raw = mappedCSVRow(parsed.headers, row, input.mapping);
      if (raw.gherkinKey !== undefined) z.string().max(128).parse(raw.gherkinKey);
      const number = codeNumber(raw.code);
      const externalId = raw.externalId?.trim();
      if (externalId && externalId.length > 128) throw new CSVImportError("Use identificação externa com até 128 caracteres.");
      if (input.mode === "UPSERT" && !number && !externalId && !raw.gherkinKey?.trim()) throw new CSVImportError("Para atualizar, mapeie código, identificação externa ou chave Gherkin.");
      const key = externalId ? `csv:${externalId}` : number && input.mode === "UPSERT" ? `csv:code:${number}` : null;
      const candidates = await client.testCase.findMany({ where: { projectId, OR: [
        ...(number ? [{ number }] : []), ...(key ? [{ externalKey: key }] : []), ...(raw.gherkinKey?.trim() ? [{ gherkinKey: raw.gherkinKey.trim() }] : []),
      ] } });
      if (input.mode === "UPSERT" && candidates.length > 1) throw new CSVImportError("Identificadores apontam para casos diferentes. Corrija o código/ID externo antes de atualizar.");
      const target = input.mode === "UPSERT" ? candidates[0] : undefined;
      if (target?.externalKey && externalId && !target.externalKey.startsWith("csv:")) throw new CSVImportError("Este caso tem identificação de automação. Mapeie somente o código para preservá-la.");
      if (input.mode === "CREATE" && candidates.some(value => key && value.externalKey === key || raw.gherkinKey && value.gherkinKey === raw.gherkinKey))
        throw new CSVImportError("A identificação já existe. Use atualizar por código/ID ou escolha outra chave.");
      if (target && targetIds.has(target.id)) throw new CSVImportError("Outro registro deste arquivo já atualiza o mesmo caso.");
      if (target) targetIds.add(target.id);
      if (!target && key && newKeys.has(key)) throw new CSVImportError("Identificação externa repetida no arquivo.");
      if (!target && key) newKeys.add(key);
      const format = raw.format !== undefined ? enumValue(raw.format) : target?.format ?? "STEPS";
      if (!["STEPS", "BDD"].includes(format)) throw new CSVImportError("Formato deve ser STEPS (tradicional) ou BDD.");
      const steps: unknown = raw.steps === undefined ? target?.steps ?? [] : raw.steps.trimStart().startsWith("[") ? JSON.parse(raw.steps) : raw.steps.split(/\r?\n/).map(step => step.trim()).filter(Boolean);
      let definition = {
        title: raw.title ?? target?.title ?? "", description: raw.description ?? target?.description ?? "",
        preconditions: raw.preconditions ?? target?.preconditions ?? "", steps,
        expectedResult: raw.expectedResult ?? target?.expectedResult ?? "",
        priority: raw.priority !== undefined ? enumValue(raw.priority) : target?.priority ?? "MEDIUM",
        type: raw.type !== undefined ? enumValue(raw.type) : target?.type ?? "FUNCTIONAL",
        state: raw.state !== undefined ? enumValue(raw.state) : target?.state ?? "READY",
        tags: raw.tags !== undefined ? raw.tags.split(/[,;\s]+/).filter(Boolean) : target?.tags ?? [],
        suiteId: target?.suiteId ?? null,
      };
      let sourceFields = { format, gherkinSource: "", gherkinOriginalSource: "", gherkinKey: null as string | null, gherkinLanguage: "pt", requirementRef: raw.requirementRef ?? target?.requirementRef ?? "", automationRef: raw.automationRef ?? target?.automationRef ?? "" };
      if (format === "BDD") {
        const source = raw.gherkinSource ?? target?.gherkinSource ?? "";
        const feature = parseFeature(source);
        const wanted = raw.gherkinKey?.trim() || target?.gherkinKey;
        const index = wanted ? feature.scenarios.findIndex(scenario => scenario.key === wanted) : feature.scenarios.length === 1 ? 0 : -1;
        if (index < 0) throw new CSVImportError("Mapeie gherkinKey para identificar o cenário dentro da fonte BDD.");
        const keys = feature.scenarios.map(scenario => scenario.key ?? `qa:${randomUUID()}`);
        if (bddKeys.has(keys[index])) throw new CSVImportError("Chave Gherkin repetida neste arquivo.");
        bddKeys.add(keys[index]);
        const canonical = featureWithKeys(source, feature.scenarios, keys);
        const scenario = parseFeature(canonical).scenarios[index];
        const alreadyLinked = await client.testCase.findFirst({ where: { projectId, gherkinKey: keys[index] } });
        if (alreadyLinked && alreadyLinked.id !== target?.id) throw new CSVImportError("A chave Gherkin está vinculada a outro caso. Concilie antes de importar.");
        if (raw.title && raw.title !== scenario.name) warnings.push("O título da fonte Gherkin será usado.");
        const previousTags = target?.format === "BDD" ? parseFeature(target.gherkinSource).scenarios.find(value => value.key === target.gherkinKey)?.tags.map(tag => tag.slice(1).toLowerCase()) ?? [] : [];
        definition = { ...definition, title: scenario.name, description: scenario.description, preconditions: scenario.background.join("\n"), steps: scenario.steps, expectedResult: scenario.expectedResult,
          tags: [...new Set([...definition.tags.filter(tag => !previousTags.includes(tag)), ...scenario.tags.map(tag => tag.slice(1).toLowerCase())])],
        };
        sourceFields = { format, gherkinSource: canonical, gherkinOriginalSource: originalFeatureSource(source, target), gherkinKey: keys[index], gherkinLanguage: feature.language, requirementRef: scenario.requirementRef, automationRef: scenario.automationRef };
      }
      const importedOrigin = raw.origin ? z.enum(CASE_ORIGINS).parse(raw.origin.trim().toUpperCase()) : undefined;
      const emptyAutomated = Array.isArray(definition.steps) && definition.steps.length === 0 && (target?.origin === "JUNIT" || importedOrigin === "JUNIT");
      if (!target && emptyAutomated && definition.state !== "DRAFT") { definition.state = "DRAFT"; warnings.push("Definição automatizada sem passos manuais: será criada como rascunho, sem gerar resultados."); }
      const allowEmpty = definition.state === "DRAFT" || emptyAutomated || format === "BDD";
      const schema = allowEmpty ? testCaseSchema.extend({
        title: z.string().trim().min(format === "BDD" ? 1 : 3).max(200),
        steps: z.array(z.string().max(format === "BDD" ? 102400 : 2000)).max(format === "BDD" ? 200 : 100),
        expectedResult: z.string().max(format === "BDD" ? 102400 : 5000),
        description: z.string().max(format === "BDD" ? 102400 : 5000), preconditions: z.string().max(format === "BDD" ? 102400 : 5000),
      }) : testCaseSchema;
      const validated = schema.parse(definition);
      z.string().max(200).parse(sourceFields.requirementRef); z.string().max(200).parse(sourceFields.automationRef);
      let desiredSuite: string | undefined;
      if (raw.suite !== undefined) {
        desiredSuite = cleanPath(raw.suite);
        const matches = suitePaths.filter(suite => suite.path === desiredSuite);
        if (matches.length > 1) throw new CSVImportError("Caminho de suíte ambíguo: renomeie as pastas repetidas.");
        validated.suiteId = matches[0]?.id ?? null;
        const parts = desiredSuite.split("/").filter(Boolean);
        for (let length = 1; length <= parts.length; length++) {
          const path = parts.slice(0, length).join("/");
          const existing = suitePaths.filter(suite => suite.path === path);
          if (existing.length > 1) throw new CSVImportError("Uma pasta superior tem nome ambíguo.");
          if (!existing.length) newSuites.add(path);
        }
        if (desiredSuite && !matches.length) warnings.push(`A suíte “${desiredSuite}” será criada.`);
      }
      if (!target && !key) warnings.push("Sem ID externo: no modo criar, reimportar este registro cria outro caso.");
      rows.push({ line: row.line, title: validated.title, action: target ? "UPDATE" : "CREATE", code: target ? caseCode(target.number) : "Novo código", errors: [] as string[], warnings, target, desiredSuite,
        data: { ...validated, ...sourceFields, ...(key && (!target || externalId) ? { externalKey: key } : {}) },
      });
    } catch (error) {
      const message = error instanceof SyntaxError ? "Passos em JSON inválido. Use um array de textos ou um passo por linha." : inputError(error);
      rows.push({ line: row.line, title: raw.title ?? "", action: "ERROR", code: "", errors: [message], warnings });
    }
  }
  if (newSuites.size > 200) throw new ServiceError(400, "Crie no máximo 200 novas suítes por importação.");
  return { rows, delimiter: parsed.delimiter, newSuites: newSuites.size, valid: rows.every(row => !row.errors.length) };
}

export async function previewCSV(userId: string, projectId: string, input: unknown) {
  await requireProject(userId, projectId);
  const prepared = await prepare(projectId, inputSchema.parse(input), db);
  return { ...prepared, rows: prepared.rows.map(({ line, title, action, code, errors, warnings }) => ({ line, title, action, code, errors, warnings })) };
}

async function ensureSuite(client: Prisma.TransactionClient, projectId: string, path: string) {
  let parentId: string | null = null;
  for (const name of path.split("/").filter(Boolean)) {
    const matches: { id: string }[] = await client.testSuite.findMany({ where: { projectId, parentId, name }, select: { id: true } });
    if (matches.length > 1) throw new ServiceError(409, "A hierarquia de suítes mudou. Atualize a prévia.");
    parentId = matches[0]?.id ?? (await client.testSuite.create({ data: { projectId, parentId, name } })).id;
  }
  return parentId;
}

export async function importCSV(userId: string, projectId: string, input: unknown) {
  const data = inputSchema.parse(input);
  return withProject(userId, projectId, "CSV_IMPORTED", async client => {
    const prepared = await prepare(projectId, data, client);
    if (!prepared.valid) throw new ServiceError(400, "Há erros no CSV. Gere a prévia e corrija as linhas indicadas; nenhum caso foi alterado.");
    const saved: TestCase[] = [];
    for (const row of prepared.rows) {
      if (!("data" in row) || !row.data) throw new ServiceError(400, "Linha inválida.");
      const suiteId = row.desiredSuite !== undefined ? await ensureSuite(client, projectId, row.desiredSuite) : row.data.suiteId;
      const fields = { ...row.data, suiteId, updatedBy: userId };
      saved.push(row.target ? await client.testCase.update({ where: { id: row.target.id }, data: fields }) : await client.testCase.create({ data: { ...fields, projectId, origin: "CSV" } }));
    }
    return { imported: saved.length, created: prepared.rows.filter(row => row.action === "CREATE").length, updated: prepared.rows.filter(row => row.action === "UPDATE").length };
  });
}

export async function exportCSV(userId: string, projectId: string, query: Record<string, string>) {
  const library = await getCaseLibrary(userId, projectId, { ...query, page: 1, state: query.state ?? "ALL" }, 1000);
  if (library.total > 1000) throw new ServiceError(400, "Refine os filtros para exportar até 1.000 casos por lote.");
  const rows = library.cases.map(testCase => {
    const suite = library.suites.find(value => value.id === testCase.suiteId);
    const values: Record<typeof CSV_FIELDS[number], string> = {
      code: caseCode(testCase.number), externalId: testCase.externalKey?.startsWith("csv:") ? testCase.externalKey.slice(4) : "",
      title: testCase.title, description: testCase.description, preconditions: testCase.preconditions,
      steps: Array.isArray(testCase.steps) ? testCase.steps.join("\n") : "", expectedResult: testCase.expectedResult,
      priority: testCase.priority, type: testCase.type, state: testCase.state, tags: testCase.tags.join(","), suite: suite ? suitePath(suite, library.suites) : "",
      origin: testCase.origin, format: testCase.format, gherkinSource: testCase.gherkinSource, gherkinKey: testCase.gherkinKey ?? "", requirementRef: testCase.requirementRef, automationRef: testCase.automationRef,
    };
    return CSV_FIELDS.map(field => values[field]);
  });
  const output = serializeCSV([...CSV_FIELDS], rows);
  if (new TextEncoder().encode(output).byteLength > 5 * 1024 * 1024) throw new ServiceError(413, "A exportação ultrapassa 5 MiB. Refine os filtros para gerar lotes menores.");
  return output;
}
