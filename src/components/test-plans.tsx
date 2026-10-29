"use client";
import { useEffect, useState } from "react";
import { request } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { RunContextFields, runFormData } from "@/components/run-context";
import { caseCode, type LibraryCase } from "@/domain/cases";

type Item = { testCaseId: string; revision: number; category: string; caseSnapshot?: { title?: string; number?: number } };
type Plan = { id: string; name: string; description: string; revision: number; archived: boolean; items: Item[] };
export function TestPlans({ projectId, cases, onChanged }: { projectId: string; cases: LibraryCase[]; onChanged: () => Promise<void> }) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{ plan?: Plan; items: Item[] } | null>(null);
  const [launch, setLaunch] = useState<Plan | null>(null);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  useEffect(() => {
    let alive = true;
    request<{ plans: Plan[] }>(`projects/${projectId}/plans`).then(value => { if (alive) setPlans(value.plans); }).catch(reason => { if (alive) setError(reason.message); });
    return () => { alive = false; };
  }, [projectId]);
  async function refresh() { const value = await request<{ plans: Plan[] }>(`projects/${projectId}/plans`); setPlans(value.plans); setError(""); }
  async function write(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError("");
    try {
      await action(); setEditor(null); setLaunch(null); setNotice(message);
      try { await refresh(); await onChanged(); } catch { setError("Dados salvos. Não foi possível atualizar a lista; tente carregar novamente."); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  function add(values: LibraryCase[]) {
    setEditor(current => current && ({ ...current, items: [...current.items, ...values.filter(value => !current.items.some(item => item.testCaseId === value.id)).map(value => ({ testCaseId: value.id, revision: value.revision, category: "", caseSnapshot: { title: value.title, number: value.number } }))] }));
  }
  function move(index: number, direction: number) {
    setEditor(current => {
      if (!current) return current;
      const items = [...current.items]; [items[index], items[index + direction]] = [items[index + direction], items[index]];
      return { ...current, items };
    });
  }
  const available = cases.filter(value => value.state !== "ARCHIVED").sort((a, b) => a.number - b.number);
  const filtered = available.filter(value => `${caseCode(value.number)} ${value.title}`.toLowerCase().includes(search.toLowerCase()) && (!tag || value.tags.includes(tag.replace(/^@/, "").toLowerCase())));
  return <section className="panel" aria-label="Planos de teste">
    <div className="library-heading"><div><h2>Planos de teste</h2><p>Organize casos e reutilize suas revisões em novas execuções.</p></div><Button onClick={() => { setEditor({ items: [] }); setError(""); }}>Novo plano</Button></div>
    {error && <p role="alert" className="alert alert-error">{error} <button onClick={() => void refresh().catch(reason => setError(reason.message))}>Tentar novamente</button></p>}
    {notice && <p role="status">{notice}</p>}
    <Field label="Mostrar planos arquivados"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} /></Field>
    {!plans && !error && <p role="status">Carregando planos…</p>}
    {plans && !plans.filter(value => showArchived || !value.archived).length && <p className="no-results">Crie seu primeiro plano para smoke, regressão ou homologação.</p>}
    {plans?.filter(value => showArchived || !value.archived).map(plan => <article className="context-row" key={plan.id}><div><h3>{plan.name}</h3><p>{plan.items.length} casos · revisão {plan.revision}{plan.archived ? " · Arquivado" : ""}</p><p>{plan.description}</p></div><div className="library-row-actions">
      <Button variant="outline" disabled={busy} onClick={() => { setError(""); setEditor({ plan, items: plan.items }); }}>Editar {plan.name}</Button>
      <Button variant="outline" disabled={busy} onClick={() => void write(() => request(`projects/${projectId}/plans/${plan.id}/clone`, { method: "POST", body: "{}" }), "Plano clonado com as mesmas revisões.")}>Clonar {plan.name}</Button>
      <Button disabled={busy || plan.archived || !plan.items.length} onClick={() => { setLaunch(plan); setError(""); }}>Executar {plan.name}</Button>
    </div></article>)}
    <Dialog open={!!editor} onOpenChange={open => { if (!open && !busy) setEditor(null); }} title={editor?.plan ? "Editar plano" : "Novo plano"} description="As revisões selecionadas ficam fixadas. Atualize uma revisão explicitamente quando desejar." wide>
      <form className="form-stack" key={editor?.plan?.id ?? "new"} onSubmit={event => {
        event.preventDefault(); if (!editor) return;
        const data = new FormData(event.currentTarget);
        void write(() => request(`projects/${projectId}/plans${editor.plan ? `/${editor.plan.id}` : ""}`, { method: editor.plan ? "PATCH" : "POST", body: JSON.stringify({ name: data.get("name"), description: data.get("description"), archived: data.get("archived") === "on", expectedRevision: editor.plan?.revision, items: editor.items.map(({ testCaseId, revision, category }) => ({ testCaseId, revision, category })) }) }), "Plano salvo.");
      }}>
        {error && <p role="alert" className="alert alert-error">{error}</p>}
        <Field label="Nome do plano"><input name="name" required maxLength={120} defaultValue={editor?.plan?.name} /></Field>
        <Field label="Objetivo do plano"><textarea name="description" maxLength={5000} defaultValue={editor?.plan?.description} /></Field>
        <Field label="Plano arquivado"><input name="archived" type="checkbox" defaultChecked={editor?.plan?.archived} /></Field>
        <p>Templates adicionam casos reais sem remover a seleção atual: Smoke usa @smoke; Regressão usa casos prontos; Homologação usa casos funcionais prontos.</p>
        <div className="library-actions">{["Smoke", "Regressão", "Homologação"].map(template => <Button type="button" variant="outline" key={template} onClick={() => add(available.filter(value => template === "Smoke" ? value.tags.includes("smoke") : value.state === "READY" && (template === "Regressão" || value.type === "FUNCTIONAL")))}>Adicionar template {template}</Button>)}</div>
        <h3>Casos selecionados ({editor?.items.length ?? 0})</h3>
        <ol className="plan-items">{editor?.items.map((item, index) => {
          const current = cases.find(value => value.id === item.testCaseId);
          const title = item.caseSnapshot?.title ?? current?.title ?? item.testCaseId;
          return <li key={item.testCaseId}><strong>{caseCode(item.caseSnapshot?.number ?? current?.number ?? 0)} · {title} · revisão {item.revision}</strong>
            <Field label={`Categoria de ${title}`}><input maxLength={120} value={item.category} onChange={event => setEditor(value => value && ({ ...value, items: value.items.map((row, position) => position === index ? { ...row, category: event.target.value } : row) }))} /></Field>
            <div className="library-row-actions"><Button type="button" variant="outline" disabled={index === 0} onClick={() => move(index, -1)}>Subir {title}</Button><Button type="button" variant="outline" disabled={index === editor.items.length - 1} onClick={() => move(index, 1)}>Descer {title}</Button>
              <Button type="button" variant="ghost" onClick={() => setEditor(value => value && ({ ...value, items: value.items.filter(row => row.testCaseId !== item.testCaseId) }))}>Remover {title}</Button>
              {current && current.revision !== item.revision && <Button type="button" variant="outline" onClick={() => setEditor(value => value && ({ ...value, items: value.items.map(row => row.testCaseId === item.testCaseId ? { ...row, revision: current.revision, caseSnapshot: { title: current.title, number: current.number } } : row) }))}>Usar revisão {current.revision} de {title}</Button>}
            </div></li>;
        })}</ol>
        <Field label="Buscar casos para o plano"><input value={search} onChange={event => setSearch(event.target.value)} /></Field>
        <Field label="Filtrar por tag do caso"><input value={tag} onChange={event => setTag(event.target.value)} placeholder="@smoke ou @regressao" /></Field>
        <div className="case-checklist"><p>{filtered.length} casos disponíveis</p>{filtered.map(value => <label key={value.id}><input type="checkbox" checked={!!editor?.items.some(item => item.testCaseId === value.id)} onChange={event => { if (event.target.checked) add([value]); else setEditor(current => current && ({ ...current, items: current.items.filter(item => item.testCaseId !== value.id) })); }} />{caseCode(value.number)} · {value.title} · revisão {value.revision}{value.format === "BDD" ? " · BDD" : ""}</label>)}</div>
        <div className="form-footer"><Button type="button" variant="outline" disabled={busy} onClick={() => setEditor(null)}>Cancelar</Button><Button disabled={busy}>{busy ? "Salvando…" : "Salvar plano"}</Button></div>
      </form>
    </Dialog>
    <Dialog open={!!launch} onOpenChange={open => { if (!open && !busy) setLaunch(null); }} title="Executar plano" description="Cada execução mantém seus próprios resultados e contexto histórico." wide>
      <form className="form-stack" key={launch?.id ?? "run"} onSubmit={event => { event.preventDefault(); const body = runFormData(new FormData(event.currentTarget)); void write(() => request(`projects/${projectId}/runs`, { method: "POST", body: JSON.stringify(body) }), "Execução criada. Acompanhe na aba Ciclos de teste."); }}>
        {error && <p role="alert" className="alert alert-error">{error}</p>}
        <input name="planId" type="hidden" value={launch?.id ?? ""} />
        <Field label="Nome do ciclo"><input name="name" required minLength={3} maxLength={200} defaultValue={launch?.name} /></Field>
        <RunContextFields projectId={projectId} />
        <div className="form-footer"><Button type="button" variant="outline" disabled={busy} onClick={() => setLaunch(null)}>Cancelar</Button><Button disabled={busy}>{busy ? "Criando…" : "Criar execução"}</Button></div>
      </form>
    </Dialog>
  </section>;
}
