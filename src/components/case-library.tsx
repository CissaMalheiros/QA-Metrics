"use client";

import { useEffect, useState } from "react";
import { request } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export type Suite = { id: string; name: string; parentId: string | null };
export type LibraryCase = {
  id: string; number: number; title: string; description: string; preconditions: string;
  steps: string[]; expectedResult: string; priority: string; origin: string; createdAt: string;
  suiteId: string | null; tags: string[]; type: string; state: string; revision: number;
};
type Library = { cases: LibraryCase[]; suites: Suite[]; total: number; page: number; pageSize: number };
type Revision = { id: string; revision: number; createdAt: string; snapshot: LibraryCase };
export const caseCode = (value: number) => `TC-${String(value).padStart(3, "0")}`;
export const caseTypeLabels: Record<string, string> = { FUNCTIONAL: "Funcional", API: "API", UI: "Interface", INTEGRATION: "Integração", SECURITY: "Segurança", EXPLORATORY: "Exploratório" };
export const caseStateLabels: Record<string, string> = { DRAFT: "Rascunho", READY: "Pronto", ARCHIVED: "Arquivado" };
const priorityLabels: Record<string, string> = { LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta", CRITICAL: "Crítica" };

export function suitePath(suite: Suite, suites: Suite[]): string {
  const names = [suite.name];
  const visited = new Set([suite.id]);
  let parent = suites.find(value => value.id === suite.parentId);
  while (parent && !visited.has(parent.id)) {
    visited.add(parent.id); names.unshift(parent.name);
    parent = suites.find(value => value.id === parent!.parentId);
  }
  return names.join(" / ");
}

export function CaseLibrary({ projectId, version, onCreate, onEdit, onDetail, onDelete, onChanged }: {
  projectId: string; version: LibraryCase[]; onCreate: () => void; onEdit: (value: LibraryCase) => void;
  onDetail: (value: LibraryCase) => void; onDelete: (value: LibraryCase) => void; onChanged: () => Promise<void>;
}) {
  const [data, setData] = useState<Library | null>(null);
  const [query, setQuery] = useState({ q: "", suiteId: "", priority: "", origin: "", type: "", state: "ALL", tag: "", page: "1" });
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [suiteEditor, setSuiteEditor] = useState(false);
  const [suiteId, setSuiteId] = useState("");
  const [suiteName, setSuiteName] = useState("");
  const [parentId, setParentId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [bulkField, setBulkField] = useState("state");
  const [bulkValue, setBulkValue] = useState("ARCHIVED");
  const [history, setHistory] = useState<{ title: string; revisions: Revision[] } | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      request<Library>(`projects/${projectId}/library?${new URLSearchParams(query)}`)
        .then(value => { if (alive) { setData(value); setLoading(false); } })
        .catch(reason => { if (alive) { setError(reason.message); setLoading(false); } });
    }, 150);
    return () => { alive = false; clearTimeout(timer); };
  }, [projectId, query, version, reload]);
  function filter(field: keyof typeof query, value: string) { setQuery(current => ({ ...current, [field]: value, ...(field !== "page" ? { page: "1" } : {}) })); }
  async function act(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError("");
    try { await action(); await onChanged(); setReload(value => value + 1); setNotice(message); return true; }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível concluir. Tente novamente."); return false; }
    finally { setBusy(false); }
  }
  const suites = data?.suites ?? [];
  const suiteOptions = suites.map(value => <option key={value.id} value={value.id}>{suitePath(value, suites)}</option>);
  return <section className="panel case-library" aria-label="Biblioteca de testes">
    <div className="library-heading"><div><h2>Biblioteca de testes</h2><p>{data ? `${data.total} ${data.total === 1 ? "caso encontrado" : "casos encontrados"}` : "Carregando casos…"}</p></div>
      <div className="library-actions"><Button variant="outline" onClick={() => { setSuiteEditor(true); setError(""); }}>Gerenciar suítes</Button><Button onClick={onCreate}>Novo caso</Button></div>
    </div>
    {error && <p className="alert alert-error" role="alert">{error} <button onClick={() => setReload(value => value + 1)}>Tentar novamente</button></p>}
    {notice && <p role="status">{notice}</p>}
    <div className="library-search"><label className="library-field">Buscar registros<input aria-label="Buscar registros" value={query.q} onChange={event => filter("q", event.target.value)} placeholder="Código, título, passos ou conteúdo" /></label>
      <label className="library-field">Prioridade<select aria-label="Filtrar por prioridade" value={query.priority} onChange={event => filter("priority", event.target.value)}><option value="">Todas as prioridades</option>{Object.entries(priorityLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
    </div>
    <details className="library-filter-details"><summary>Mais filtros</summary><div className="library-filters">
      <label className="library-field">Suíte<select value={query.suiteId} onChange={event => filter("suiteId", event.target.value)}><option value="">Todas as suítes</option><option value="none">Sem suíte</option>{suiteOptions}</select></label>
      <label className="library-field">Tipo<select value={query.type} onChange={event => filter("type", event.target.value)}><option value="">Todos os tipos</option>{Object.entries(caseTypeLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
      <label className="library-field">Origem<select value={query.origin} onChange={event => filter("origin", event.target.value)}><option value="">Todas as origens</option><option value="MANUAL">Manual</option><option value="JUNIT">JUnit</option></select></label>
      <label className="library-field">Estado<select value={query.state} onChange={event => filter("state", event.target.value)}><option value="ALL">Todos os estados</option>{Object.entries(caseStateLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
      <label className="library-field">Tag<input value={query.tag} onChange={event => filter("tag", event.target.value)} placeholder="smoke" /></label>
    </div></details>
    {!!selected.length && <div className="library-actions"><span>{selected.length} selecionados</span><Button variant="outline" onClick={() => { setBulk(true); setError(""); }}>Editar em lote</Button><Button variant="ghost" onClick={() => setSelected([])}>Limpar seleção</Button></div>}
    {loading ? <p role="status">Carregando casos…</p> : data?.cases.length ? <div className="table-scroll"><table><thead><tr>
      <th><input type="checkbox" aria-label="Selecionar página" checked={data.cases.every(value => selected.includes(value.id))} onChange={event => setSelected(current => event.target.checked ? [...new Set([...current, ...data.cases.map(value => value.id)])] : current.filter(id => !data.cases.some(value => value.id === id)))} /></th>
      <th>Caso de teste</th><th>Classificação</th><th>Suíte e tags</th><th>Ações</th>
    </tr></thead><tbody>{data.cases.map(value => <tr key={value.id}>
      <td><input type="checkbox" aria-label={`Selecionar ${caseCode(value.number)}`} checked={selected.includes(value.id)} onChange={event => setSelected(current => event.target.checked ? [...current, value.id] : current.filter(id => id !== value.id))} /></td>
      <td><button className="table-title" onClick={() => onDetail(value)}><span className="case-number">{caseCode(value.number)}</span>{value.title}</button><small>Revisão {value.revision} · {value.origin === "JUNIT" ? "JUnit" : "Manual"}</small></td>
      <td>{priorityLabels[value.priority]} · {caseTypeLabels[value.type]}<br />{caseStateLabels[value.state]}</td>
      <td>{suites.find(suite => suite.id === value.suiteId)?.name ?? "Sem suíte"}<small>{value.tags.map(tag => `@${tag}`).join(" ") || "Sem tags"}</small></td>
      <td><div className="library-row-actions">
        <button aria-label={`Editar ${value.title}`} onClick={() => onEdit(value)}>Editar</button>
        <button disabled={busy} aria-label={`Duplicar ${value.title}`} onClick={() => void act(() => request(`projects/${projectId}/cases/${value.id}/duplicate`, { method: "POST" }), "Cópia criada como rascunho, com um novo código.")}>Duplicar</button>
        <button disabled={busy} aria-label={`Revisões de ${value.title}`} onClick={() => {
          setError(""); void request<{ revisions: Revision[] }>(`projects/${projectId}/cases/${value.id}/revisions`).then(result => setHistory({ title: value.title, revisions: result.revisions })).catch(reason => setError(reason.message));
        }}>Revisões</button>
        <button aria-label={`Excluir ${value.title}`} onClick={() => onDelete(value)}>Excluir</button>
      </div></td>
    </tr>)}</tbody></table></div> : <p className="no-results">Nenhum caso corresponde aos filtros. Crie um caso ou ajuste os filtros.</p>}
    {data && data.total > data.pageSize && <nav aria-label="Páginas da biblioteca" className="library-actions"><Button variant="outline" disabled={data.page <= 1} onClick={() => filter("page", String(data.page - 1))}>Anterior</Button><span>Página {data.page} de {Math.ceil(data.total / data.pageSize)}</span><Button variant="outline" disabled={data.page * data.pageSize >= data.total} onClick={() => filter("page", String(data.page + 1))}>Próxima</Button></nav>}
    <Dialog open={suiteEditor} onOpenChange={open => { if (!busy) { setSuiteEditor(open); setConfirmDelete(false); } }} title="Gerenciar suítes" description="Organize pastas e subpastas deste projeto.">
      {error && <p role="alert" className="alert alert-error">{error}</p>}
      <label className="library-field">Suíte para editar<select value={suiteId} onChange={event => { const suite = suites.find(value => value.id === event.target.value); setSuiteId(suite?.id ?? ""); setSuiteName(suite?.name ?? ""); setParentId(suite?.parentId ?? ""); setConfirmDelete(false); }}><option value="">Nova suíte</option>{suiteOptions}</select></label>
      <form onSubmit={event => { event.preventDefault(); void act(() => request(`projects/${projectId}/suites${suiteId ? `/${suiteId}` : ""}`, { method: suiteId ? "PATCH" : "POST", body: JSON.stringify({ name: suiteName, parentId }) }), "Suíte salva.").then(ok => { if (ok) { setSuiteId(""); setSuiteName(""); setParentId(""); } }); }}>
        <label className="library-field">Nome da suíte<input required maxLength={120} value={suiteName} onChange={event => setSuiteName(event.target.value)} /></label>
        <label className="library-field">Pasta superior<select value={parentId} onChange={event => setParentId(event.target.value)}><option value="">Raiz</option>{suites.filter(value => value.id !== suiteId).map(value => <option key={value.id} value={value.id}>{suitePath(value, suites)}</option>)}</select></label>
        <div className="form-footer"><Button disabled={busy}>Salvar suíte</Button>{suiteId && <Button type="button" variant="destructive" disabled={busy} onClick={() => {
          if (!confirmDelete) { setConfirmDelete(true); return; }
          void act(() => request(`projects/${projectId}/suites/${suiteId}`, { method: "DELETE" }), "Suíte vazia excluída.").then(ok => { if (ok) { setSuiteId(""); setSuiteName(""); setParentId(""); setConfirmDelete(false); } });
        }}>{confirmDelete ? "Confirmar exclusão da suíte" : "Excluir suíte vazia"}</Button>}</div>
      </form>
    </Dialog>
    <Dialog open={bulk} onOpenChange={open => { if (!busy) setBulk(open); }} title="Editar casos em lote" description={`${selected.length} casos serão alterados juntos. Se algum não for válido, nenhum será alterado.`}>
      {error && <p role="alert" className="alert alert-error">{error}</p>}
      <form onSubmit={event => { event.preventDefault(); const value = bulkField === "tags" ? bulkValue.split(",").map(tag => tag.trim()).filter(Boolean) : bulkField === "suiteId" ? bulkValue || null : bulkValue; void act(() => request(`projects/${projectId}/cases/bulk`, { method: "PATCH", body: JSON.stringify({ ids: selected, changes: { [bulkField]: value } }) }), "Casos alterados. As revisões anteriores foram preservadas.").then(ok => { if (ok) { setBulk(false); setSelected([]); } }); }}>
        <label className="library-field">Campo<select value={bulkField} onChange={event => { setBulkField(event.target.value); setBulkValue(event.target.value === "state" ? "ARCHIVED" : event.target.value === "priority" ? "MEDIUM" : event.target.value === "type" ? "FUNCTIONAL" : ""); }}><option value="state">Estado</option><option value="priority">Prioridade</option><option value="type">Tipo</option><option value="suiteId">Suíte</option><option value="tags">Tags (substituir)</option></select></label>
        <label className="library-field">Novo valor{bulkField === "tags" ? <input value={bulkValue} onChange={event => setBulkValue(event.target.value)} placeholder="smoke, regressao (vazio remove tags)" /> : <select value={bulkValue} onChange={event => setBulkValue(event.target.value)}>{bulkField === "suiteId" ? <><option value="">Sem suíte</option>{suiteOptions}</> : Object.entries(bulkField === "state" ? caseStateLabels : bulkField === "type" ? caseTypeLabels : priorityLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select>}</label>
        <div className="form-footer"><Button disabled={busy}>Aplicar em {selected.length} casos</Button></div>
      </form>
    </Dialog>
    <Dialog open={!!history} onOpenChange={open => { if (!open) setHistory(null); }} title={`Revisões · ${history?.title ?? ""}`} description="Definições anteriores do caso. Execuções mantêm seus próprios snapshots.">
      {history?.revisions.map(value => <details key={value.id}><summary>Revisão {value.revision} · {new Date(value.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</summary><h3>{value.snapshot.title}</h3><p>{value.snapshot.description}</p><p>{priorityLabels[value.snapshot.priority]} · {caseStateLabels[value.snapshot.state]} · {value.snapshot.tags?.join(", ")}</p><p>{value.snapshot.preconditions}</p><ol>{value.snapshot.steps?.map((step, index) => <li key={index}>{step}</li>)}</ol><p>Esperado: {value.snapshot.expectedResult}</p></details>)}
    </Dialog>
  </section>;
}
