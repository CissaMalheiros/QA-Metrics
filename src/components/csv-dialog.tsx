"use client";
import { useState } from "react";
import { CSV_FIELDS, csvFieldLabels, type CSVMapping } from "@/importers/csv";
import { request } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";

type CSVPreview = { valid: boolean; newSuites: number; rows: { line: number; title: string; action: string; code: string; errors: string[]; warnings: string[] }[] };
export function CSVDialog({ projectId, onClose, onSaved }: { projectId: string; onClose: () => void; onSaved: (result: { imported: number; created: number; updated: number }) => Promise<void> }) {
  const [source, setSource] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<CSVMapping>({});
  const [delimiter, setDelimiter] = useState(",");
  const [mode, setMode] = useState("CREATE");
  const [preview, setPreview] = useState<CSVPreview | null>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const payload = { source, mapping, delimiter, mode };
  async function load(file: File) {
    setPreview(null); setError(""); setHeaders([]); setBusy(true);
    try {
      if (!file.name.toLowerCase().endsWith(".csv") || file.size > 262144) throw new Error("Selecione um CSV UTF-8 de até 256 KiB.");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      const result = await request<{ headers: string[]; mapping: CSVMapping; delimiter: string }>(`projects/${projectId}/csv/inspect`, { method: "POST", body: JSON.stringify({ source: text }) });
      setSource(text); setHeaders(result.headers); setMapping(result.mapping); setDelimiter(result.delimiter);
    } catch (reason) { setError(reason instanceof TypeError ? "O arquivo precisa estar em UTF-8 válido." : reason instanceof Error ? reason.message : "Não foi possível ler o CSV."); }
    finally { setBusy(false); }
  }
  async function inspect() {
    setBusy(true); setError(""); setPreview(null);
    try { const result = await request<CSVPreview>(`projects/${projectId}/csv/preview`, { method: "POST", body: JSON.stringify(payload) }); setPreview(result); setPage(0); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível gerar a prévia."); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError("");
    try { const result = await request<{ imported: number; created: number; updated: number }>(`projects/${projectId}/csv/import`, { method: "POST", body: JSON.stringify(payload) }); await onSaved(result); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível importar."); }
    finally { setBusy(false); }
  }
  const field = (name: typeof CSV_FIELDS[number]) => <Field key={name} label={`Coluna: ${csvFieldLabels[name]}`}><select value={mapping[name] ?? ""} onChange={event => {
    setMapping(current => { const updated = { ...current }; if (event.target.value) updated[name] = event.target.value; else delete updated[name]; return updated; }); setPreview(null);
  }}><option value="">Ignorar coluna</option>{headers.map(header => <option key={header} value={header}>{header}</option>)}</select></Field>;
  const essential = ["code", "externalId", "title", "steps", "expectedResult", "priority"] as const;
  const errors = preview?.rows.filter(row => row.errors.length).length ?? 0;
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }} title="Importar casos por CSV" description="Mapeie colunas, confira os erros por linha e confirme a importação. Nenhuma linha é gravada enquanto houver erro." wide className="import-dialog csv-dialog">
    {error && <p className="alert alert-error" role="alert">{error}</p>}
    <fieldset disabled={busy} className="feature-fields">
      <ol className="import-stages" aria-label="Etapas da importação"><li>1. Escolher arquivo</li><li>2. Conferir colunas</li><li>3. Revisar e importar</li></ol>
      <div className="import-upload"><h3>Comece pelo seu arquivo</h3><p>Use a primeira linha para os nomes das colunas. Você poderá conferir os dados antes de importar.</p>
      <Field label="Arquivo CSV (UTF-8, até 256 KiB)"><input type="file" accept=".csv,text/csv" onChange={event => { const file = event.target.files?.[0]; if (file) void load(file); }} /></Field></div>
      {!!headers.length && <>
        <h3>Confira como as colunas serão utilizadas</h3>
        <Field label="Modo de importação"><select value={mode} onChange={event => { setMode(event.target.value); setPreview(null); }}><option value="CREATE">Criar novos casos (não sobrescrever códigos recebidos)</option><option value="UPSERT">Atualizar por código/ID e criar os ausentes</option></select></Field>
        <p>Use identificação externa para reconciliar arquivos de outras ferramentas. Títulos não identificam casos. Suítes ausentes serão criadas; uma falha cancela o lote inteiro.</p>
        <div className="form-grid">{essential.map(field)}</div>
        <details><summary>Mapear outras colunas, incluindo BDD</summary><div className="form-grid">{CSV_FIELDS.filter(name => !essential.some(value => value === name)).map(field)}</div></details>
        <Button variant="outline" type="button" onClick={() => void inspect()}>Gerar prévia CSV</Button>
      </>}
    </fieldset>
    {busy && <p role="status">Processando CSV…</p>}
    {preview && <section className="feature-preview" aria-label="Prévia CSV"><h3>{preview.rows.length} registros · {errors} com erro · {preview.newSuites} novas suítes</h3>
      {!!errors && <p className="alert alert-error" role="alert">Corrija as linhas indicadas e envie novamente o arquivo. Nenhum caso será alterado.</p>}
      <div className="table-scroll"><table><thead><tr><th>Linha do arquivo</th><th>Ação</th><th>Caso</th><th>Avisos e erros</th></tr></thead><tbody>{preview.rows.slice(page * 50, page * 50 + 50).map(row => <tr key={row.line}><td>{row.line}</td><td>{row.action === "UPDATE" ? "Atualizar" : row.action === "CREATE" ? "Criar" : "Corrigir"}</td><td>{row.code} · {row.title}</td><td>{[...row.errors, ...row.warnings].map((message, index) => <p key={index}>{message}</p>)}</td></tr>)}</tbody></table></div>
      {preview.rows.length > 50 && <nav className="library-actions" aria-label="Páginas da prévia CSV"><Button variant="outline" disabled={!page} onClick={() => setPage(value => value - 1)}>Anterior</Button><span>{page + 1} / {Math.ceil(preview.rows.length / 50)}</span><Button variant="outline" disabled={(page + 1) * 50 >= preview.rows.length} onClick={() => setPage(value => value + 1)}>Próxima</Button></nav>}
    </section>}
    <div className="form-footer"><Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button disabled={busy || !preview?.valid} onClick={() => void save()}>{preview ? `Importar ${preview.rows.length} ${preview.rows.length === 1 ? "caso" : "casos"}` : "Importar casos"}</Button></div>
  </Dialog>;
}
