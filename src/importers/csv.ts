export const MAX_CSV_BYTES = 256 * 1024;
export const MAX_CSV_ROWS = 1000;
export const CSV_FIELDS = ["code", "externalId", "title", "description", "preconditions", "steps", "expectedResult", "priority", "type", "state", "tags", "suite", "origin", "format", "gherkinSource", "gherkinKey", "requirementRef", "automationRef"] as const;
export type CSVField = typeof CSV_FIELDS[number];
export type CSVMapping = Partial<Record<CSVField, string>>;
export const csvFieldLabels: Record<CSVField, string> = {
  code: "Código do caso", externalId: "Identificação externa", title: "Título", description: "Descrição",
  preconditions: "Pré-condições", steps: "Passos (um por linha ou JSON)", expectedResult: "Resultado esperado",
  priority: "Prioridade", type: "Tipo", state: "Estado", tags: "Tags", suite: "Caminho da suíte", origin: "Origem da definição",
  format: "Formato", gherkinSource: "Fonte Gherkin", gherkinKey: "Chave do cenário", requirementRef: "Referência de requisito", automationRef: "Referência de automação",
};
export class CSVImportError extends Error {}
type CSVRow = { line: number; cells: string[] };

export function parseCSV(source: string, separator?: "," | ";") {
  if (!source.trim() || new TextEncoder().encode(source).byteLength > MAX_CSV_BYTES)
    throw new CSVImportError("Envie CSV UTF-8 com conteúdo e até 256 KiB.");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(source)) throw new CSVImportError("O CSV contém caracteres de controle inválidos.");
  source = source.replace(/^\uFEFF/, "");
  let quotes = false, commas = 0, semicolons = 0;
  for (const char of source) {
    if (char === '"') quotes = !quotes;
    if (!quotes && (char === "\n" || char === "\r")) break;
    if (!quotes && char === ",") commas++;
    if (!quotes && char === ";") semicolons++;
  }
  const delimiter = separator ?? (semicolons > commas ? ";" : ",");
  const records: CSVRow[] = [];
  let cells: string[] = [], value = "", quoted = false, closed = false, line = 1, start = 1;
  function finishCell() { cells.push(value); value = ""; closed = false; }
  function finishRow() {
    finishCell();
    if (cells.some(cell => cell.trim())) records.push({ line: start, cells });
    if (records.length > MAX_CSV_ROWS + 1) throw new CSVImportError("Importe no máximo 1.000 casos por arquivo.");
    cells = [];
  }
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { value += '"'; index++; }
        else { quoted = false; closed = true; }
      } else { value += char; if (char === "\n") line++; }
    } else if (char === '"') {
      if (value || closed) throw new CSVImportError(`Linha ${line}: aspas inesperadas. Coloque todo o campo entre aspas e duplique aspas internas.`);
      quoted = true;
    } else if (char === delimiter) finishCell();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index++;
      finishRow(); line++; start = line;
    } else {
      if (closed) throw new CSVImportError(`Linha ${line}: há texto após o fechamento das aspas.`);
      value += char;
    }
  }
  if (quoted) throw new CSVImportError(`Linha ${start}: campo entre aspas não foi fechado.`);
  if (value || cells.length || closed) finishRow();
  const header = records.shift();
  if (!header || !records.length) throw new CSVImportError("Informe um cabeçalho e ao menos uma linha de dados.");
  const headers = header.cells.map(cell => cell.trim());
  if (headers.length > 30 || headers.some(cell => !cell || cell.length > 200) || new Set(headers).size !== headers.length)
    throw new CSVImportError("Use até 30 cabeçalhos distintos, preenchidos e com até 200 caracteres.");
  for (const record of records) {
    if (record.cells.length > headers.length) throw new CSVImportError(`Linha ${record.line}: há mais campos do que no cabeçalho.`);
    while (record.cells.length < headers.length) record.cells.push("");
  }
  return { headers, rows: records, delimiter };
}

const aliases: Partial<Record<CSVField, string[]>> = {
  code: ["codigo", "codigodocaso"], title: ["titulo", "nome"], description: ["descricao"],
  preconditions: ["precondicoes"], steps: ["passos", "etapas"], expectedResult: ["resultadoesperado"],
  priority: ["prioridade"], type: ["tipo"], state: ["estado", "status"], tags: ["etiquetas"],
  suite: ["suite", "pasta"], origin: ["origem"], format: ["formato"], externalId: ["idexterno"],
};
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
export function suggestCSVMapping(headers: string[]): CSVMapping {
  return Object.fromEntries(CSV_FIELDS.flatMap(field => {
    const header = headers.find(value => normalize(value) === normalize(field) || aliases[field]?.includes(normalize(value)));
    return header ? [[field, header]] : [];
  }));
}
export function mappedCSVRow(headers: string[], row: CSVRow, mapping: CSVMapping): Partial<Record<CSVField, string>> {
  const encoding = headers.indexOf("qaMetricsEncoding");
  if (encoding >= 0 && row.cells[encoding] !== "apostrophe-v1") throw new CSVImportError(`Linha ${row.line}: codificação QA Metrics não reconhecida.`);
  return Object.fromEntries(Object.entries(mapping).map(([field, header]) => {
    const index = headers.indexOf(header!);
    if (index < 0) throw new CSVImportError(`A coluna mapeada “${header}” não está no cabeçalho.`);
    const raw = row.cells[index];
    const value = encoding >= 0 && raw.startsWith("'") && (raw[1] === "'" || /^[\s]*[=+\-@]/.test(raw.slice(1)) || /^[\t\r]/.test(raw.slice(1))) ? raw.slice(1) : raw;
    return [field, value];
  }));
}

export function serializeCSV(headers: string[], rows: string[][]) {
  function cell(value: string) {
    // Spreadsheet formula prefixes must remain text when the download is opened.
    const safe = value.startsWith("'") || /^[\s]*[=+\-@]/.test(value) || /^[\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  }
  return "\uFEFF" + [[...headers, "qaMetricsEncoding"], ...rows.map(row => [...row, "apostrophe-v1"])].map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
