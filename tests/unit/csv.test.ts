import { expect, it } from "vitest";
import { mappedCSVRow, MAX_CSV_BYTES, parseCSV, serializeCSV, suggestCSVMapping } from "../../src/importers/csv";

it("lê delimitadores, BOM, aspas escapadas, campos multilinha e linhas físicas", () => {
  const csv = parseCSV('\uFEFFTítulo;Passos;Resultado esperado\r\n"Validar \"\"compra\"\"";"Abrir\r\nConfirmar";Correto\r\nOutro;Verificar;Correto\r\n');
  expect(csv.delimiter).toBe(";");
  expect(csv.rows[0].cells[0]).toBe('Validar "compra"');
  expect(csv.rows[0].cells[1]).toBe("Abrir\r\nConfirmar");
  expect(csv.rows[1].line).toBe(4);
  expect(mappedCSVRow(csv.headers, csv.rows[0], suggestCSVMapping(csv.headers))).toMatchObject({ title: 'Validar "compra"', expectedResult: "Correto" });
});
it.each(['title,steps\n"unclosed,step', 'title,title\nx,y', 'title,steps\nx,y,z', 'title,steps\n"x"invalid,y', 'title,steps\nfoo"bar,y', 'title,steps\n\u0000,y'])('recusa CSV estruturalmente inválido: %s', source => expect(() => parseCSV(source)).toThrow());
it("recusa colunas inexistentes e tamanho acima do limite", () => {
  const csv = parseCSV("title\nCaso\n");
  expect(() => mappedCSVRow(csv.headers, csv.rows[0], { title: "ausente" })).toThrow();
  expect(() => parseCSV("á".repeat(MAX_CSV_BYTES))).toThrow(/256 KiB/);
});
it("exporta fórmulas como texto e preserva campos comuns e quebras de linha", () => {
  const source = serializeCSV(["title", "steps"], [['=HYPERLINK("bad")', 'Abrir\nConfirmar "ação"'], ["Normal", "@SUM(1)"]]);
  const csv = parseCSV(source);
  expect(csv.rows[0].cells[0]).toBe('\'=HYPERLINK("bad")');
  expect(mappedCSVRow(csv.headers, csv.rows[0], { title: "title", steps: "steps" })).toEqual({ title: '=HYPERLINK("bad")', steps: 'Abrir\nConfirmar "ação"' });
  expect(csv.rows[1].cells[1]).toBe("'@SUM(1)");
});
it("preserva apóstrofos e fontes BDD iniciadas com tags na reimportação segura", () => {
  const csv = parseCSV(serializeCSV(["title", "gherkinSource"], [["'=texto", "@id:one\nFeature: Example\n Scenario: One\n  Given input\n"]]));
  expect(mappedCSVRow(csv.headers, csv.rows[0], { title: "title", gherkinSource: "gherkinSource" })).toEqual({ title: "'=texto", gherkinSource: "@id:one\nFeature: Example\n Scenario: One\n  Given input\n" });
});
