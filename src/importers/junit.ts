import { createHash } from "node:crypto";
import { XMLParser, XMLValidator } from "fast-xml-parser";

export const MAX_JUNIT_BYTES = 5 * 1024 * 1024;
export const MAX_JUNIT_CASES = 10_000;
const MAX_XML_NODES = 100_000;
const MAX_XML_DEPTH = 64;
const MAX_ERROR_LENGTH = 8_000;

export class JUnitImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JUnitImportError";
  }
}

export type ImportedCase = {
  externalKey: string;
  title: string;
  description: string;
  status: "PASSED" | "FAILED" | "SKIPPED";
  durationMs: number | null;
  errorMessage: string | null;
};

export type JUnitReport = {
  sha256: string;
  cases: ImportedCase[];
  suiteCount: number;
};
type XmlNode = Record<string, unknown>;

function object(value: unknown): XmlNode {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as XmlNode)
    : {};
}

function list(value: unknown): unknown[] {
  return value === undefined || value === null
    ? []
    : Array.isArray(value)
      ? value
      : [value];
}

function clean(value: string, max = MAX_ERROR_LENGTH): string {
  // Logs remain plain text. Remove terminal escape sequences and non-printing controls.
  return value
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
}

function decodeXml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    apos: "'",
    quot: '"',
  };
  return value.replace(
    /&(amp|lt|gt|apos|quot|#\d+|#x[\da-fA-F]+);/g,
    (_, entity: string) => {
      if (!entity.startsWith("#")) return named[entity];
      const code = entity.startsWith("#x")
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      if (!(
        code === 9 ||
        code === 10 ||
        code === 13 ||
        (code >= 32 && code <= 0xd7ff) ||
        (code >= 0xe000 && code <= 0xfffd) ||
        (code >= 0x10000 && code <= 0x10ffff)
      )) {
        throw new JUnitImportError(
          "O XML contém uma referência de caractere inválida.",
        );
      }
      return String.fromCodePoint(code);
    },
  );
}

function attribute(node: XmlNode, name: string): string {
  const value = node[`@_${name}`];
  return typeof value === "string" ? decodeXml(value).trim() : "";
}

function content(value: unknown, depth = 0): string {
  if (depth > MAX_XML_DEPTH) return "";
  if (typeof value === "string")
    return decodeXml(value).slice(0, MAX_ERROR_LENGTH);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value))
    return value
      .map((v) => content(v, depth + 1))
      .join("\n")
      .slice(0, MAX_ERROR_LENGTH);
  const node = object(value);
  const pieces: string[] = [];
  let length = 0;
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith("@_") || key.startsWith("?")) continue;
    const piece =
      key === "#cdata" && typeof child === "string"
        ? child
        : content(child, depth + 1);
    pieces.push(piece);
    length += piece.length;
    if (length >= MAX_ERROR_LENGTH) break;
  }
  return pieces.filter(Boolean).join("\n").slice(0, MAX_ERROR_LENGTH);
}

/** Bound work before materializing the XML tree, including tags hidden in huge reports. */
function preflight(xml: string): void {
  const structural = xml.replace(
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g,
    "",
  );
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(structural)) {
    throw new JUnitImportError(
      "DOCTYPE e entidades externas não são permitidos em relatórios XML.",
    );
  }
  if (
    /&(?!(?:amp|lt|gt|quot|apos|#\d{1,7}|#x[\da-fA-F]{1,6});)/.test(structural)
  ) {
    throw new JUnitImportError(
      "O XML contém uma entidade inválida ou não permitida.",
    );
  }
  const declaredEncoding = xml.match(
    /^\s*<\?xml\s[^?]*encoding\s*=\s*["']([^"']+)["']/i,
  )?.[1];
  if (
    declaredEncoding &&
    !/^(?:utf-8|utf8|us-ascii)$/i.test(declaredEncoding)
  ) {
    throw new JUnitImportError("Salve o relatório XML com codificação UTF-8.");
  }
  let depth = 0;
  let nodes = 0;
  let roots = 0;
  for (let i = 0; i < structural.length; i += 1) {
    if (structural[i] !== "<") continue;
    if (structural.startsWith("<?", i)) {
      const end = structural.indexOf("?>", i + 2);
      if (end < 0)
        throw new JUnitImportError("XML inválido: declaração incompleta.");
      i = end + 1;
      continue;
    }
    let quote = "";
    let end = i + 1;
    for (; end < structural.length; end += 1) {
      const ch = structural[end];
      if (quote) {
        if (ch === quote) quote = "";
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ">") break;
    }
    if (end === structural.length)
      throw new JUnitImportError("XML inválido: elemento incompleto.");
    if (structural[i + 1] === "/") depth -= 1;
    else if (structural[i + 1] !== "!") {
      nodes += 1;
      if (depth === 0) roots += 1;
      depth += 1;
      if (depth > MAX_XML_DEPTH || nodes > MAX_XML_NODES) {
        throw new JUnitImportError(
          "O relatório excede o limite de complexidade do XML.",
        );
      }
      if (/\/\s*$/.test(structural.slice(i, end))) depth -= 1;
    }
    i = end;
  }
  if (roots !== 1 || depth !== 0)
    throw new JUnitImportError(
      "XML inválido: é necessário um único elemento raiz.",
    );
}

/**
 * Only reads a JUnit report; never loads URLs, external entities or executable code.
 * Case identity is SHA-256(JSON.stringify([suite-name path, classname, testcase name])).
 * Duplicate identities in one report are rejected, rather than silently overwriting retries.
 */
export function parseJUnit(input: Buffer | string): JUnitReport {
  const bytes = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  if (bytes.length > MAX_JUNIT_BYTES)
    throw new JUnitImportError("O arquivo XML deve ter no máximo 5 MB.");
  if (bytes.length === 0)
    throw new JUnitImportError("O arquivo XML está vazio.");
  let xml: string;
  try {
    xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new JUnitImportError(
      "Salve o relatório XML com codificação UTF-8 válida.",
    );
  }
  preflight(xml);
  const validation = XMLValidator.validate(xml, {
    allowBooleanAttributes: false,
  });
  if (validation !== true) {
    throw new JUnitImportError(
      `XML inválido na linha ${validation.err.line || 1}. Verifique a estrutura do arquivo.`,
    );
  }
  let document: XmlNode;
  try {
    document = object(
      new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        parseAttributeValue: false,
        parseTagValue: false,
        processEntities: false,
        htmlEntities: false,
        ignoreDeclaration: true,
        ignorePiTags: true,
        cdataPropName: "#cdata",
        trimValues: false,
      }).parse(xml),
    );
  } catch {
    throw new JUnitImportError(
      "Não foi possível ler o XML. Verifique a estrutura do relatório.",
    );
  }
  const rootNames = Object.keys(document).filter(
    (key) => !key.startsWith("?") && key !== "#text",
  );
  if (
    rootNames.length !== 1 ||
    !["testsuite", "testsuites"].includes(rootNames[0])
  ) {
    throw new JUnitImportError(
      "Use um relatório JUnit com raiz <testsuite> ou <testsuites>.",
    );
  }
  const cases: ImportedCase[] = [];
  const identities = new Set<string>();
  let suiteCount = 0;

  function visitSuite(value: unknown, parentPath: string[]): void {
    const suite = object(value);
    suiteCount += 1;
    const suitePath = [...parentPath, attribute(suite, "name")];
    for (const rawCase of list(suite.testcase)) {
      if (cases.length >= MAX_JUNIT_CASES)
        throw new JUnitImportError(
          "Importe no máximo 10.000 casos por arquivo.",
        );
      const test = object(rawCase);
      const name = attribute(test, "name");
      const className = attribute(test, "classname");
      if (!name)
        throw new JUnitImportError(
          "Todo <testcase> deve informar o atributo name.",
        );
      const externalKey = `junit:${createHash("sha256")
        .update(JSON.stringify([suitePath, className, name]))
        .digest("hex")}`;
      if (identities.has(externalKey)) {
        throw new JUnitImportError(
          `Caso duplicado no XML: ${clean(name, 100)}. Diferencie nome, classe ou suíte dos casos.`,
        );
      }
      identities.add(externalKey);
      const failed =
        Object.hasOwn(test, "failure") || Object.hasOwn(test, "error");
      const skipped = Object.hasOwn(test, "skipped");
      const status = failed ? "FAILED" : skipped ? "SKIPPED" : "PASSED";
      const time = attribute(test, "time");
      const seconds = time === "" ? null : Number(time);
      if (
        seconds !== null &&
        (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(time) ||
          !Number.isFinite(seconds) ||
          seconds < 0 ||
          Math.round(seconds * 1000) > 2_147_483_647)
      ) {
        throw new JUnitImportError(
          `Duração inválida no caso ${clean(name, 100)}.`,
        );
      }
      const errors = [
        ...list(test.failure),
        ...list(test.error),
        ...(failed ? [] : list(test.skipped)),
      ]
        .map((error) => {
          const node = object(error);
          return [
            attribute(node, "message"),
            attribute(node, "type"),
            content(error),
          ]
            .filter(Boolean)
            .join("\n");
        })
        .filter(Boolean)
        .join("\n");
      cases.push({
        externalKey,
        title: clean(name, 200),
        description: clean(
          [
            `Suíte: ${suitePath.filter(Boolean).join(" / ")}`,
            className ? `Classe: ${className}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
          5000,
        ),
        status,
        durationMs: seconds === null ? null : Math.round(seconds * 1000),
        errorMessage: errors ? clean(errors) : null,
      });
    }
    for (const child of list(suite.testsuite)) visitSuite(child, suitePath);
    for (const group of list(suite.testsuites)) visitGroup(group, suitePath);
  }

  function visitGroup(value: unknown, parentPath: string[]): void {
    const group = object(value);
    for (const suite of list(group.testsuite)) visitSuite(suite, parentPath);
    for (const nested of list(group.testsuites)) visitGroup(nested, parentPath);
  }

  if (rootNames[0] === "testsuite") {
    for (const suite of list(document.testsuite)) visitSuite(suite, []);
  } else {
    for (const group of list(document.testsuites)) visitGroup(group, []);
  }
  if (!cases.length)
    throw new JUnitImportError("O relatório JUnit não contém casos de teste.");
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    cases,
    suiteCount,
  };
}
