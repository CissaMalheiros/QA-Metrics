"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { GherkinSource } from "@/components/feature-editor";
import { resultStatusLabels } from "@/domain/labels";
import { request } from "@/lib/api-client";

type Values = { status: string; notes: string; actualResult: string; durationMs: number | null };
export type ExecutionResult = {
  id: string; projectId: string; runId: string; testCaseId: string; caseTitle: string; category?: string;
  caseSnapshot: { title?: string; revision?: number; steps?: string[]; expectedResult?: string; preconditions?: string; format?: string; gherkinSource?: string };
  status: string; durationMs: number | null; errorMessage: string | null; notes: string; executedAt: string | null;
  actualResult?: string; executorName?: string | null; version?: number; draft?: Values | null;
};
export type ResultWrite = Values & { expectedVersion: number; operationId: string; saveDraft?: boolean; discardDraft?: boolean };
type Event = { id: string; version: number; actorName: string | null; createdAt: string; snapshot: Values & { draft: Values | null; executedAt?: string | null } };
const statusLabel = (value: string) => resultStatusLabels[value as keyof typeof resultStatusLabels] ?? value;
function valuesOf(result: ExecutionResult): Values { return result.draft ?? { status: result.status, notes: result.notes, actualResult: result.actualResult ?? "", durationMs: result.durationMs }; }

export function ExecutionResults({ results, disabled, dirty, onDirty, onSave, onBug, initialResultId }: {
  initialResultId?: string;
  results: ExecutionResult[]; disabled: boolean; dirty: string[]; onDirty: (id: string, value: boolean) => void;
  onSave: (result: ExecutionResult, values: ResultWrite) => Promise<ExecutionResult>; onBug: (result: ExecutionResult) => void;
}) {
  const [guided, setGuided] = useState(!!initialResultId);
  const [selected, setSelected] = useState(initialResultId ?? "");
  const [filter, setFilter] = useState("");
  useEffect(() => {
    if (!dirty.length) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect); return () => window.removeEventListener("beforeunload", protect);
  }, [dirty.length]);
  const visible = results.filter(value => !filter || value.status === filter);
  const index = Math.max(0, visible.findIndex(value => value.id === selected));
  const executed = results.filter(value => value.status !== "NOT_RUN").length;
  return <section aria-label="Execução dos casos">
    <div className="library-actions"><Button variant="outline" disabled={!!dirty.length} onClick={() => setGuided(value => !value)}>{guided ? "Mostrar todos os casos" : "Modo guiado"}</Button>
      <Field label="Filtrar resultados"><select disabled={!!dirty.length} value={filter} onChange={event => { setFilter(event.target.value); setSelected(""); }}><option value="">Todos os casos</option>{Object.entries(resultStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <span role="status">{executed} de {results.length} executados · {results.filter(value => value.draft).length} rascunhos</span>
    </div>
    <progress aria-label="Progresso do ciclo" max={results.length || 1} value={executed} />
    {guided && !!visible.length && <nav aria-label="Navegação da execução" className="library-actions">
      <Button variant="outline" disabled={!!dirty.length || index === 0} onClick={() => setSelected(visible[index - 1].id)}>Caso anterior</Button>
      <Field label="Caso em execução"><select value={visible[index]?.id ?? ""} disabled={!!dirty.length} onChange={event => setSelected(event.target.value)}>{visible.map((value, position) => <option value={value.id} key={value.id}>{position + 1}. {value.caseTitle} · {statusLabel(value.status)}{value.draft ? " · rascunho" : ""}</option>)}</select></Field>
      <Button variant="outline" disabled={!!dirty.length || index >= visible.length - 1} onClick={() => setSelected(visible[index + 1].id)}>Próximo caso</Button>
    </nav>}
    {!!dirty.length && <p role="status">Há alterações não salvas. Salve como rascunho, registre o resultado ou descarte antes de navegar.</p>}
    {!visible.length && <p>Nenhum caso com esse resultado.</p>}
    {(guided ? visible.slice(index, index + 1) : visible).map(result => <ResultEditor key={`${result.id}-${result.version ?? 0}`} result={result} disabled={disabled} guided={guided} onDirty={onDirty} onSave={onSave} onBug={onBug} />)}
  </section>;
}

function ResultEditor({ result, disabled, guided, onDirty, onSave, onBug }: {
  result: ExecutionResult; disabled: boolean; guided: boolean; onDirty: (id: string, value: boolean) => void;
  onSave: (result: ExecutionResult, values: ResultWrite) => Promise<ExecutionResult>; onBug: (result: ExecutionResult) => void;
}) {
  const [stored, setStored] = useState(result);
  const [values, setValues] = useState<Values>(() => valuesOf(result));
  const [pending, setPending] = useState<{ body: ResultWrite; action: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [events, setEvents] = useState<Event[] | null>(null);
  function change(patch: Partial<Values>) { setValues(value => ({ ...value, ...patch })); setDirty(true); onDirty(result.id, true); setNotice(""); }
  async function save(action: "draft" | "final" | "discard", retry = false) {
    const body: ResultWrite = retry && pending ? pending.body : { ...values, expectedVersion: stored.version ?? 0, operationId: crypto.randomUUID(), ...(action === "draft" ? { saveDraft: true } : action === "discard" ? { discardDraft: true } : {}) };
    setPending({ body, action }); setSaving(true); setError("");
    try {
      const saved = await onSave(stored, body); setStored(saved); setValues(valuesOf(saved)); setDirty(false); onDirty(result.id, false); setPending(null); setEvents(null);
      setNotice(action === "draft" ? "Rascunho salvo. O resultado definitivo não foi alterado." : action === "discard" ? "Rascunho descartado." : "Resultado salvo.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar."); }
    finally { setSaving(false); }
  }
  return <article className="result-editor">
    <div className="result-editor-heading"><h3>{result.caseTitle}</h3><span>{statusLabel(stored.status)}{stored.draft ? " · Rascunho salvo" : ""}</span></div>
    {result.category && <p>Categoria: {result.category}</p>}
    {result.caseSnapshot.revision && <p>Revisão do caso utilizada: {result.caseSnapshot.revision}</p>}
    <details open={guided}><summary>Ver passos e resultado esperado</summary>
      {result.caseSnapshot.preconditions && <p>Pré-condições: {result.caseSnapshot.preconditions}</p>}
      <ol>{result.caseSnapshot.steps?.map((step, index) => <li key={index}>{step}</li>)}</ol>
      <p><strong>Resultado esperado:</strong> {result.caseSnapshot.expectedResult || "Conforme relatório importado."}</p>
    </details>
    {result.caseSnapshot.gherkinSource && <details><summary>Fonte Gherkin da execução</summary><GherkinSource source={result.caseSnapshot.gherkinSource} /></details>}
    {result.errorMessage && <pre className="result-error">{result.errorMessage}</pre>}
    <fieldset disabled={disabled || saving} className="feature-fields">
      <div className="form-grid">
        <Field label="Resultado"><select aria-label={`Resultado de ${result.caseTitle}`} value={values.status} onChange={event => change({ status: event.target.value })}>{Object.entries(resultStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field>
        <Field label="Duração (segundos)"><input aria-label={`Duração de ${result.caseTitle}`} type="number" min={0} max={604800} step={0.001} value={values.durationMs === null ? "" : values.durationMs / 1000} onChange={event => change({ durationMs: event.target.value === "" ? null : Math.round(Number(event.target.value) * 1000) })} /></Field>
      </div>
      <Field label="Resultado real"><textarea aria-label={`Resultado real de ${result.caseTitle}`} maxLength={10000} value={values.actualResult} onChange={event => change({ actualResult: event.target.value })} /></Field>
      <Field label="Observações"><textarea aria-label={`Observações de ${result.caseTitle}`} rows={2} maxLength={5000} value={values.notes} onChange={event => change({ notes: event.target.value })} /></Field>
      {!disabled && <div className="library-actions"><Button variant="outline" disabled={saving} onClick={() => void save("draft")}>Salvar rascunho</Button><Button disabled={saving} onClick={() => void save("final")}>{saving ? "Salvando…" : "Salvar resultado"}</Button>
        {(dirty || stored.draft) && <Button variant="ghost" disabled={saving} onClick={() => {
          if (stored.draft) void save("discard"); else { setValues(valuesOf(stored)); setDirty(false); onDirty(result.id, false); setPending(null); setError(""); }
        }}>Descartar alterações</Button>}
      </div>}
    </fieldset>
    {error && <div role="alert" className="alert alert-error">{error} {pending && <button disabled={saving} onClick={() => void save(pending.action as "draft" | "final" | "discard", true)}>Tentar salvar novamente</button>}
      <button disabled={saving} onClick={() => {
        void request<{ run: { results: ExecutionResult[] } }>(`projects/${result.projectId}/runs/${result.runId}`).then(value => {
          const saved = value.run.results.find(row => row.id === result.id);
          if (!saved) throw new Error("Resultado não encontrado.");
          setStored(saved); setValues(valuesOf(saved)); setDirty(false); onDirty(result.id, false); setPending(null); setError("");
        }).catch(reason => setError(reason.message));
      }}>Descartar e recarregar versão salva</button>
    </div>}
    {notice && <p role="status">{notice}</p>}
    {(stored.executorName || stored.executedAt) && <p className="result-date">{stored.executorName && `Executor: ${stored.executorName} · `}{stored.executedAt && `Registrado em ${new Date(stored.executedAt).toLocaleString("pt-BR")}`}</p>}
    {stored.status === "FAILED" && <Button variant="outline" disabled={dirty || saving} onClick={() => onBug(stored)}>Criar defeito deste resultado</Button>}
    <Button variant="ghost" disabled={saving} onClick={() => {
      setError(""); void request<{ events: Event[] }>(`projects/${result.projectId}/runs/${result.runId}/results/${result.id}/history`).then(value => setEvents(value.events)).catch(reason => setError(reason.message));
    }}>Histórico de {result.caseTitle}</Button>
    {events && <section aria-label={`Histórico de ${result.caseTitle}`}><h4>Histórico de registros</h4>{events.length ? events.map(event => {
      const value = event.snapshot.draft ?? event.snapshot;
      return <details key={event.id}><summary>Registro {event.version} · {event.snapshot.draft ? "Rascunho" : statusLabel(value.status)} · {event.actorName ?? "Registro anterior"} · {new Date(event.createdAt).toLocaleString("pt-BR")}</summary><p>Resultado real: {value.actualResult || "Não informado"}</p><p>Observações: {value.notes || "Não informadas"}</p><p>Duração: {value.durationMs === null ? "Não informada" : `${value.durationMs / 1000} s`}</p></details>;
    }) : <p>Nenhuma alteração registrada desde a criação.</p>}</section>}
  </article>;
}
