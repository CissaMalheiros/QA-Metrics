"use client";
import { useEffect, useState } from "react";
import { request } from "@/lib/api-client";
import { Dialog } from "@/components/ui/dialog";
import { resultStatusLabels } from "@/domain/labels";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { RunContextFields, RunContextSummary, runFormData, type RunContext } from "@/components/run-context";
type Data = { bug: { title: string; status: string; priority: string; responsibleId: string | null; expectedResult: string; actualResult: string; fixedInBuild: string; history: unknown[]; testResultId: string | null; testResult: { caseTitle: string; run: { contextSnapshot: RunContext } } | null; retests: { id: string; completedAt: string | null; result: { id: string; runId: string; status: string; run: { name: string; build: string } } }[] }; evidence: { id: string; name: string; size: number }[] };
export function BugWorkflow({ projectId, bugId, onClose, onChanged, onRun }: { projectId: string; bugId: string; onClose: () => void; onChanged: () => Promise<void>; onRun: (id: string) => void }) {
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [retest, setRetest] = useState(false);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const base = `projects/${projectId}/bugs/${bugId}`;
  useEffect(() => { let alive = true; Promise.all([request<Data>(`${base}/workflow`), request<{ members: { id: string; name: string }[] }>(`projects/${projectId}/planning`)]).then(([value, options]) => { if (alive) { setData(value); setMembers(options.members); } }).catch(reason => { if (alive) setError(reason.message); }); return () => { alive = false; }; }, [base, projectId]);
  async function act(action: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await action(); try { setData(await request<Data>(`${base}/workflow`)); await onChanged(); } catch { setError("Dados salvos; reabra o defeito para atualizar a lista."); } }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Falha na operação."); } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }} title={data?.bug.title ?? "Defeito"} description="Correção, evidências e retestes preservam o contexto histórico." wide>
    {error && <p role="alert" className="alert alert-error">{error}</p>}
    {!data && !error && <p role="status">Carregando defeito…</p>}
    {data && <div className="form-stack"><RunContextSummary value={data.bug.testResult?.run.contextSnapshot} /><p>Caso: {data.bug.testResult?.caseTitle ?? "Sem vínculo"}</p>
      <form className="form-stack" key={JSON.stringify([data.bug.status, data.bug.history.length])} onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void act(() => request(`${base}/workflow`, { method: "PATCH", body: JSON.stringify({ ...Object.fromEntries(form), responsibleId: form.get("responsibleId") || null }) })); }}>
        <Field label="Status do defeito"><select name="status" defaultValue={data.bug.status}><option value="OPEN">Aberto / reaberto</option><option value="IN_PROGRESS">Em correção</option><option value="RESOLVED">Correção disponível para reteste</option><option value="CLOSED">Fechado</option></select></Field>
        <Field label="Prioridade do defeito"><select name="priority" defaultValue={data.bug.priority}>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value, index) => <option key={value} value={value}>{["Baixa", "Média", "Alta", "Crítica"][index]}</option>)}</select></Field>
        <Field label="Responsável pelo defeito"><select name="responsibleId" defaultValue={data.bug.responsibleId ?? ""}><option value="">Não atribuído</option>{members.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></Field>
        <Field label="Resultado esperado"><textarea name="expectedResult" maxLength={10000} defaultValue={data.bug.expectedResult} /></Field>
        <Field label="Resultado obtido"><textarea name="actualResult" maxLength={10000} defaultValue={data.bug.actualResult} /></Field>
        <Field label="Build da correção"><input name="fixedInBuild" maxLength={120} defaultValue={data.bug.fixedInBuild} /></Field>
        <Field label="Comentário"><textarea name="comment" maxLength={5000} /></Field><Button disabled={busy}>Salvar acompanhamento</Button>
      </form>
      <section aria-label="Evidências"><h3>Evidências</h3><p>PNG, JPEG, PDF, TXT ou LOG; até 5 MiB por arquivo e 25 MiB/100 arquivos por projeto. Downloads privados.</p>
        <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); form.set("bugId", bugId); if (data.bug.testResultId) form.set("resultId", data.bug.testResultId); void act(async () => { const response = await fetch(`/api/data/projects/${projectId}/evidence`, { method: "POST", body: form }); if (!response.ok) throw new Error((await response.json()).error); }); }}>
          <Field label="Arquivo de evidência"><input type="file" name="file" required accept=".png,.jpg,.jpeg,.pdf,.txt,.log" /></Field><Button disabled={busy}>Anexar evidência</Button>
        </form>
        {data.evidence.map(value => <div key={value.id} className="context-row"><a href={`/api/data/projects/${projectId}/evidence/${value.id}`} download>{value.name} ({Math.ceil(value.size / 1024)} KiB)</a><Button variant="ghost" disabled={busy} onClick={() => void act(() => request(`projects/${projectId}/evidence/${value.id}`, { method: "DELETE" }))}>Remover {value.name}</Button></div>)}
      </section>
      <section aria-label="Retestes"><h3>Retestes</h3><Button disabled={busy || data.bug.status !== "RESOLVED" || !data.bug.testResultId} onClick={() => setRetest(value => !value)}>Novo reteste</Button>
        {retest && <form className="form-stack" onSubmit={event => { event.preventDefault(); const values = runFormData(new FormData(event.currentTarget)); void act(async () => { const response = await request<{ run: { id: string } }>(`${base}/retests`, { method: "POST", body: JSON.stringify({ name: values.name, build: values.build, creationKey: values.creationKey, environmentId: values.environmentId, releaseId: values.releaseId }) }); setRetest(false); onRun(response.run.id); }); }}>
          <Field label="Nome do reteste"><input name="name" required minLength={3} defaultValue={`Reteste: ${data.bug.title}`} /></Field><RunContextFields projectId={projectId} retest /><p>Informe uma build. Cada reteste cria um novo ciclo com a revisão da falha original.</p><Button disabled={busy}>Criar ciclo de reteste</Button>
        </form>}
        {data.bug.retests.map(value => <div key={value.id} className="context-row"><div><strong>{value.result.run.name}</strong><p>Build {value.result.run.build} · {resultStatusLabels[value.result.status as keyof typeof resultStatusLabels] ?? value.result.status}{value.completedAt ? " · Validado" : ""}</p></div><Button variant="outline" onClick={() => onRun(value.result.runId)}>Abrir execução</Button>{!value.completedAt && <Button disabled={busy} onClick={() => void act(() => request(`${base}/retests/${value.id}/validate`, { method: "POST", body: "{}" }))}>Validar ou reabrir</Button>}</div>)}
      </section>
      <details><summary>Histórico de alterações ({data.bug.history.length})</summary>{data.bug.history.map((entry, index) => {
        const value = entry as { at?: string; actorName?: string; before?: { status?: string } | string; changes?: Record<string, unknown>; status?: string; comment?: string; retestId?: string };
        const status = (input: unknown) => ({ OPEN: "Aberto", IN_PROGRESS: "Em correção", RESOLVED: "Correção disponível", CLOSED: "Fechado" }[String(input)] ?? String(input ?? "Não informado"));
        const before = typeof value.before === "string" ? value.before : value.before?.status;
        return <article key={index}><p><strong>{value.at ? new Date(value.at).toLocaleString("pt-BR") : "Registro anterior"}</strong>{value.actorName ? ` · ${value.actorName}` : ""}</p>
          {!!(value.status || value.changes?.status) && <p>{before ? `${status(before)} → ` : ""}{status(value.status ?? value.changes?.status)}{value.retestId ? " · Resultado do reteste" : ""}</p>}
          {value.comment && <p>{value.comment}</p>}
          {Object.entries(value.changes ?? {}).filter(([key]) => key !== "status" && key !== "testResultId").map(([key, content]) => <p key={key}>{({ priority: "Prioridade", responsibleId: "Responsável", expectedResult: "Esperado", actualResult: "Obtido", fixedInBuild: "Build da correção", title: "Título", description: "Descrição", severity: "Severidade", stepsToReproduce: "Reprodução" } as Record<string, string>)[key] ?? key}: {key === "responsibleId" ? members.find(member => member.id === content)?.name ?? "Não atribuído" : String(content ?? "Não informado")}</p>)}
        </article>;
      })}</details>
    </div>}
  </Dialog>;
}
