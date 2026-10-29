"use client";
import { useEffect, useState } from "react";
import { request } from "@/lib/api-client";
import { Field } from "@/components/ui/field";

export type RunContext = { build?: string; environment?: { name: string; baseUrl: string } | null; release?: { name: string; version: string } | null; responsible?: { name: string } | null; plan?: { name: string; revision: number } | null };
type Options = { environments: { id: string; name: string; archived: boolean }[]; releases: { id: string; name: string; version: string; archived: boolean }[]; members: { id: string; name: string }[] };
export function RunContextSummary({ value }: { value?: RunContext }) {
  if (!value || !Object.keys(value).length) return null;
  return <span className="run-context-summary">{[value.plan && `${value.plan.name} · revisão ${value.plan.revision}`, value.release && `Versão ${value.release.version}`, value.build && `Build ${value.build}`, value.environment && `Ambiente ${value.environment.name}`, value.responsible && `Responsável ${value.responsible.name}`].filter(Boolean).join(" · ") || "Contexto não informado"}</span>;
}
export function runFormData(form: FormData) {
  const value = (name: string) => String(form.get(name) ?? "");
  return {
    ...(value("creationKey") ? { creationKey: value("creationKey") } : {}),
    name: value("name"), testCaseIds: form.getAll("testCaseIds"),
    ...(value("planId") ? { planId: value("planId") } : {}),
    ...(value("environmentId") ? { environmentId: value("environmentId") } : {}),
    ...(value("releaseId") ? { releaseId: value("releaseId") } : {}),
    ...(value("responsibleId") ? { responsibleId: value("responsibleId") } : {}),
    ...(value("scheduledStart") ? { scheduledStart: new Date(value("scheduledStart")).toISOString() } : {}),
    ...(value("scheduledEnd") ? { scheduledEnd: new Date(value("scheduledEnd")).toISOString() } : {}),
    build: value("build"), notes: value("notes"), entryCriteria: value("entryCriteria"), exitCriteria: value("exitCriteria"), draft: value("draft") === "on",
  };
}
export function RunContextFields({ projectId }: { projectId: string }) {
  const [creationKey] = useState(() => crypto.randomUUID());
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    request<Options>(`projects/${projectId}/planning`).then(value => { if (alive) { setOptions(value); setError(""); } }).catch(reason => { if (alive) setError(reason.message); });
    return () => { alive = false; };
  }, [projectId, retry]);
  return <fieldset className="form-stack"><legend>Contexto da execução</legend>
    <input type="hidden" name="creationKey" value={creationKey} />
    {error && <p role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></p>}
    {!options && !error && <p role="status">Carregando contexto…</p>}
    <Field label="Ambiente"><select name="environmentId" disabled={!options}><option value="">Não informado</option>{options?.environments.filter(value => !value.archived).map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></Field>
    <Field label="Release / versão"><select name="releaseId" disabled={!options}><option value="">Não informada</option>{options?.releases.filter(value => !value.archived).map(value => <option key={value.id} value={value.id}>{value.version} · {value.name}</option>)}</select></Field>
    <Field label="Build"><input name="build" maxLength={120} placeholder="Ex.: 2026.10.29.1 ou hash do commit" /></Field>
    <Field label="Responsável"><select name="responsibleId" disabled={!options}><option value="">Não atribuído</option>{options?.members.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></Field>
    <Field label="Início previsto"><input name="scheduledStart" type="datetime-local" /></Field>
    <Field label="Fim previsto"><input name="scheduledEnd" type="datetime-local" /></Field>
    <Field label="Observações do ciclo"><textarea name="notes" maxLength={5000} /></Field>
    <Field label="Critérios de entrada"><textarea name="entryCriteria" maxLength={5000} /></Field>
    <Field label="Critérios de saída"><textarea name="exitCriteria" maxLength={5000} /></Field>
    <Field label="Salvar como rascunho"><input name="draft" type="checkbox" /></Field>
  </fieldset>;
}
