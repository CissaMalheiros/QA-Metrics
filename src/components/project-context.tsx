"use client";
import { useEffect, useState } from "react";
import { request } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";

type Environment = { id: string; name: string; baseUrl: string; archived: boolean };
type Release = { id: string; name: string; version: string; archived: boolean };
type Context = { environments: Environment[]; releases: Release[] };
export function ProjectContext({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Context | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{ kind: "environment" | "release"; value?: Environment | Release } | null>(null);
  useEffect(() => {
    let alive = true;
    request<Context>(`projects/${projectId}/planning`).then(value => { if (alive) setData(value); }).catch(reason => { if (alive) setError(reason.message); });
    return () => { alive = false; };
  }, [projectId]);
  async function refresh() { setData(await request<Context>(`projects/${projectId}/planning`)); setError(""); }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editor) return;
    const form = new FormData(event.currentTarget);
    const body = { name: form.get("name"), archived: form.get("archived") === "on", ...(editor.kind === "environment" ? { baseUrl: form.get("baseUrl") } : { version: form.get("version") }) };
    setBusy(true); setError("");
    try {
      await request(`projects/${projectId}/${editor.kind === "environment" ? "environments" : "releases"}${editor.value ? `/${editor.value.id}` : ""}`, { method: editor.value ? "PATCH" : "POST", body: JSON.stringify(body) });
      setEditor(null); setNotice("Dados salvos.");
      try { await refresh(); } catch { setError("Os dados foram salvos. Não foi possível atualizar a lista; tente carregar novamente."); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Ambientes e versões">
    {error && <p className="alert alert-error" role="alert">{error} <button onClick={() => void refresh().catch(reason => setError(reason.message))}>Tentar novamente</button></p>}
    {notice && <p role="status">{notice}</p>}
    {!data && !error && <p role="status">Carregando ambientes e versões…</p>}
    <div className="context-panels">
      <section className="panel"><div className="library-heading"><h2>Ambientes</h2><Button onClick={() => { setError(""); setEditor({ kind: "environment" }); }}>Novo ambiente</Button></div>
        {data && !data.environments.length && <p className="no-results">Cadastre Dev, QA, Staging ou outro ambiente do projeto.</p>}
        {data?.environments.map(value => <div key={value.id} className="context-row"><div><strong>{value.name}</strong><p>{value.baseUrl || "URL não informada"} · {value.archived ? "Arquivado" : "Ativo"}</p></div><Button variant="outline" onClick={() => { setError(""); setEditor({ kind: "environment", value }); }} aria-label={`Editar ambiente ${value.name}`}>Editar</Button></div>)}
      </section>
      <section className="panel"><div className="library-heading"><h2>Versões</h2><Button onClick={() => { setError(""); setEditor({ kind: "release" }); }}>Nova versão</Button></div>
        {data && !data.releases.length && <p className="no-results">Cadastre a versão ou release que será validada.</p>}
        {data?.releases.map(value => <div key={value.id} className="context-row"><div><strong>{value.name}</strong><p>{value.version} · {value.archived ? "Arquivada" : "Ativa"}</p></div><Button variant="outline" onClick={() => { setError(""); setEditor({ kind: "release", value }); }} aria-label={`Editar versão ${value.name}`}>Editar</Button></div>)}
      </section>
    </div>
    <Dialog open={!!editor} onOpenChange={open => { if (!open && !busy) setEditor(null); }} title={`${editor?.value ? "Editar" : "Cadastrar"} ${editor?.kind === "environment" ? "ambiente" : "versão"}`} description="Os dados pertencem somente a este projeto. Arquive registros em vez de apagar seu contexto histórico.">
      <form className="form-stack" onSubmit={save} key={`${editor?.kind}-${editor?.value?.id ?? "new"}`}>
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        <Field label="Nome"><input name="name" required maxLength={120} defaultValue={editor?.value?.name} /></Field>
        {editor?.kind === "environment" ? <Field label="URL do ambiente"><input type="url" name="baseUrl" maxLength={2000} defaultValue={(editor.value as Environment | undefined)?.baseUrl} placeholder="https://qa.exemplo.com" /></Field> : <Field label="Versão"><input name="version" required maxLength={80} defaultValue={(editor?.value as Release | undefined)?.version} placeholder="1.2.0" /></Field>}
        <Field label="Arquivado"><input name="archived" type="checkbox" defaultChecked={editor?.value?.archived ?? false} /></Field>
        <div className="form-footer"><Button type="button" variant="outline" disabled={busy} onClick={() => setEditor(null)}>Cancelar</Button><Button disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button></div>
      </form>
    </Dialog>
  </section>;
}
