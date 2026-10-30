"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, RotateCcw, CircleAlert, ShieldAlert, Play, ArrowUpRight, CheckCircle2, type LucideIcon } from "lucide-react";
import { request } from "@/lib/api-client";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { RunContextSummary, type RunContext } from "@/components/run-context";
import type { myDay, projectQuality } from "@/server/productivity";
import { priorityLabels, bugStatusLabels, runStatusLabels } from "@/domain/labels";
type Day = Awaited<ReturnType<typeof myDay>>;
type Quality = Awaited<ReturnType<typeof projectQuality>>;
const activityLink = (projectId: string, runId?: string, bugId?: string, resultId?: string) => `/dashboard?${new URLSearchParams({ project: projectId, tab: bugId ? "bugs" : "runs", ...(runId ? { run: runId } : {}), ...(bugId ? { bug: bugId } : {}), ...(resultId ? { result: resultId } : {}) })}`;
const rate = (value: number | null) => value === null ? "Sem resultados definidos" : `${Math.round(value)}%`;
type Activity = Day["pending"][number] | Day["retests"][number] | Day["cycles"][number];
function ActivityGroup({ id, title, values, description, icon: Icon }: { id: string; title: string; values: Activity[]; description: string; icon: LucideIcon }) {
  const [page, setPage] = useState(0);
  const pages = Math.ceil(values.length / 5);
  const current = Math.min(page, Math.max(0, pages - 1));
  return <section className="panel day-group" id={id} aria-label={title}>
    <div className="panel-header"><div><h3 aria-label={`${title} (${values.length})`}><Icon size={17} aria-hidden="true" />{title} <span className="day-count">{values.length}</span></h3><p>{description}</p></div></div>
    {!values.length ? <p className="day-empty"><CheckCircle2 size={18} aria-hidden="true" />Tudo em dia por aqui. Nenhuma atividade neste grupo.</p> : <ul className="day-activities">{values.slice(current * 5, current * 5 + 5).map((value, index) => {
      const context = value.contextSnapshot as RunContext | undefined;
      return <li key={index}><Link className="day-activity-link" href={activityLink(value.projectId, "runId" in value ? value.runId : undefined, "bugId" in value ? value.bugId : undefined, "resultId" in value ? value.resultId : undefined)}><span>{value.title}</span><ArrowUpRight size={15} aria-hidden="true" /></Link>
        <span className="day-project">{value.projectName}</span>
        <span className="day-context">{[context?.environment?.name, context?.release?.version && `Versão ${context.release.version}`, context?.build && `Build ${context.build}`].filter(Boolean).join(" · ")}</span>
        {"executed" in value && <div className="day-cycle-progress"><progress aria-label={`Progresso de ${value.title}`} max={value.total || 1} value={value.executed} /><span>{value.executed}/{value.total} executados</span></div>}
      </li>;
    })}</ul>}
    {pages > 1 && <nav className="day-pagination" aria-label={`Paginação de ${title}`}><Button size="sm" variant="outline" disabled={!current} onClick={() => setPage(current - 1)}>Anterior</Button><span aria-live="polite">{current + 1} de {pages}</span><Button size="sm" variant="outline" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Próxima</Button></nav>}
  </section>;
}
export function MyDay() {
  const [data, setData] = useState<Day | null>(null), [error, setError] = useState(""), [reload, setReload] = useState(0);
  const [project, setProject] = useState("");
  useEffect(() => { let alive = true; request<Day>("my-day").then(value => { if (alive) { setData(value); setError(""); } }).catch(reason => { if (alive) setError(reason.message); }); return () => { alive = false; }; }, [reload]);
  const projects = data ? [...new Map([...data.pending, ...data.retests, ...data.cycles, ...data.blocked, ...data.failures].map(value => [value.projectId, value.projectName])).entries()] : [];
  const select = <T extends Activity>(values: T[]) => values.filter(value => !project || value.projectId === project);
  const groups = data ? [
    { id: "day-pending", title: "Pendências de testes", values: select(data.pending), icon: ClipboardList, description: "Retome os casos que ainda precisam de execução.", hint: "Continuar os testes", tone: "pending" },
    { id: "day-retests", title: "Bugs aguardando reteste", values: select(data.retests), icon: RotateCcw, description: "Correções prontas para você conferir.", hint: "Validar correções", tone: "retests" },
    { id: "day-failures", title: "Falhas automatizadas recentes (7 dias)", values: select(data.failures), icon: CircleAlert, description: "Investigue o que falhou nas últimas automações.", hint: "Investigar falhas", tone: "failures" },
    { id: "day-blocked", title: "Testes bloqueados", values: select(data.blocked), icon: ShieldAlert, description: "Identifique o que falta para seguir em frente.", hint: "Revisar bloqueios", tone: "blocked" },
    { id: "day-cycles", title: "Ciclos em andamento ou rascunho", values: select(data.cycles), icon: Play, description: "Acompanhe as rodadas abertas e planejadas.", hint: "Acompanhar ciclos", tone: "cycles" },
  ] : [];
  return <section className="day-screen" aria-label="Meu dia">
    <div className="day-toolbar"><div><h2>Sua agenda de qualidade</h2><p>{data ? `Atualizado em ${new Date(data.generatedAt).toLocaleString("pt-BR")}` : "Pendências dos seus projetos acessíveis"}</p></div><div className="day-toolbar-actions"><Field label="Filtrar atividades por projeto"><select value={project} onChange={event => setProject(event.target.value)}><option value="">Todos os projetos</option>{projects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field><Button variant="outline" onClick={() => setReload(value => value + 1)}>Atualizar atividades</Button></div></div>
    {error && <p className="alert alert-error" role="alert">{error}</p>}{!data && !error && <p role="status">Carregando atividades…</p>}
    {data && <><div className="day-focus"><div><span className="day-focus-label">PRÓXIMA ATIVIDADE</span><h2>{select(data.retests).length ? "Retestes aguardando validação" : select(data.pending).length ? "Continue os testes pendentes" : "Acompanhe as atividades"}</h2><p>{select(data.retests).length ? `${select(data.retests).length} correções aguardam validação${project ? " neste projeto" : " nos seus projetos"}. Abra os bugs para registrar o reteste.` : "Acompanhe as atividades dos seus projetos e escolha o que faz sentido retomar agora."}</p></div><a className="button button-outline" href={select(data.retests).length ? "#day-retests" : "#day-pending"}>{select(data.retests).length ? "Revisar retestes" : "Ver pendências"}<ArrowUpRight size={16} aria-hidden="true" /></a></div><div className="day-summary">{groups.slice(0,4).map(group => <a className={`metric-card day-metric-${group.tone}`} href={`#${group.id}`} key={group.id}><div className="metric-top"><span>{group.title}</span><group.icon size={18} aria-hidden="true" /></div><strong>{group.values.length}</strong><p>{group.hint}<ArrowUpRight size={13} aria-hidden="true" /></p></a>)}</div><div className="day-grid">{groups.map(group => <ActivityGroup key={`${group.id}-${project}`} {...group} />)}</div></>}
  </section>;
}
export function ProjectQuality({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Quality | null>(null), [error, setError] = useState(""), [query, setQuery] = useState({ environmentId: "", releaseId: "", from: "", to: "" });
  const [options, setOptions] = useState<{ environments: { id: string; name: string }[]; releases: { id: string; version: string }[] } | null>(null);
  const [optionsError, setOptionsError] = useState("");
  useEffect(() => { let alive = true; request<NonNullable<typeof options>>(`projects/${projectId}/planning`).then(value => { if (alive) setOptions(value); }).catch(reason => { if (alive) setOptionsError(reason.message); }); return () => { alive = false; }; }, [projectId]);
  useEffect(() => {
    let alive = true;
    const parameters = new URLSearchParams({ environmentId: query.environmentId, releaseId: query.releaseId, ...(query.from ? { from: new Date(query.from).toISOString() } : {}), ...(query.to ? { to: new Date(query.to).toISOString() } : {}) });
    request<Quality>(`projects/${projectId}/quality?${parameters}`).then(value => { if (alive) { setData(value); setError(""); } }).catch(reason => { if (alive) { setData(null); setError(reason.message); } });
    return () => { alive = false; };
  }, [projectId, query]);
  function filter(field: keyof typeof query, value: string) { setData(null); setQuery(previous => ({ ...previous, [field]: value })); }
  function exportReport() {
    if (!data) return;
    const clean = (value: string) => value.replace(/[\r\n]/g, " ");
    const report = [`Qualidade: ${clean(data.project.name)}`, `Gerado: ${data.generatedAt}`, `Versão selecionada (cadastro atual): ${options?.releases.find(value => value.id === query.releaseId)?.version ?? "Todas"}`, `Ambiente: ${options?.environments.find(value => value.id === query.environmentId)?.name ?? "Todos"}`, `Período de criação dos ciclos: ${query.from || "sem início"} até ${query.to || "sem fim"}`, `Situação: ${data.release.status}`, ...data.contexts.map(value => `Contexto registrado: ambiente ${clean(value.environment)} / versão ${clean(value.release)}`), `Última ocorrência por caso e ambiente, incluindo planejados; rascunhos não são execuções.`, `Aprovação: ${rate(data.release.metrics.passRate)}; aprovados / (aprovados + reprovados): ${data.release.metrics.passed}/${data.release.metrics.denominator}`, `Executados: ${data.release.metrics.passed + data.release.metrics.failed}; pendentes: ${data.release.metrics.notRun}; bloqueados: ${data.release.metrics.blocked}; ignorados: ${data.release.metrics.skipped}`, `Críticos planejados/executados: ${data.release.criticalPlanned}/${data.release.criticalExecuted}`, `Críticos reprovados: ${data.release.criticalFailed.length}; defeitos impeditivos: ${data.release.blockers.length}; aguardando reteste: ${data.release.awaitingRetest}`, ...data.release.blockers.map(bug => `Impedimento: ${clean(bug.title)}`), ...data.release.criticalFailed.map(result => `Teste crítico reprovado: ${clean(result.title)}`)].join("\n");
    const url = URL.createObjectURL(new Blob([report], { type: "text/plain;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "qa-metrics-qualidade.txt"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const labels: Record<string, string> = { ...priorityLabels, ...bugStatusLabels, FUNCTIONAL: "Funcional", API: "API", UI: "Interface", INTEGRATION: "Integração", SECURITY: "Segurança", EXPLORATORY: "Exploratório", DRAFT: "Rascunho", READY: "Pronto", ARCHIVED: "Arquivado" };
  return <section className="quality-screen" aria-label="Qualidade do projeto"><header className="quality-intro"><div className="quality-intro-icon"><ShieldAlert size={26} aria-hidden="true" /></div><div><h2>Como está a qualidade da entrega?</h2><p>Confira os resultados, identifique os pontos de atenção e acompanhe a próxima release.</p></div></header><div className="library-filters">
    <Field label="Ambiente dos indicadores"><select value={query.environmentId} onChange={event => filter("environmentId", event.target.value)}><option value="">Todos</option>{options?.environments.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></Field>
    <Field label="Versão dos indicadores"><select value={query.releaseId} onChange={event => filter("releaseId", event.target.value)}><option value="">Todas</option>{options?.releases.map(value => <option key={value.id} value={value.id}>{value.version}</option>)}</select></Field>
    <Field label="Criado a partir de"><input type="datetime-local" value={query.from} onChange={event => filter("from", event.target.value)} /></Field><Field label="Criado até"><input type="datetime-local" value={query.to} onChange={event => filter("to", event.target.value)} /></Field>
  </div>{(error || optionsError) && <p role="alert">{error || optionsError} <button onClick={() => window.location.reload()}>Recarregar indicadores</button></p>}{!data && !error && <p role="status">Carregando indicadores…</p>}
    {data && <><section className="panel quality-results"><h3>Execuções no recorte</h3><div className="quality-kpis"><div><span>Taxa de aprovação</span><strong>{rate(data.metrics.passRate)}</strong><p>{data.metrics.passed} aprovados / {data.metrics.denominator} aprovados + reprovados</p></div><div><span>Reprovados</span><strong>{data.metrics.failed}</strong><p>Resultados que merecem atenção</p></div><div><span>Pendentes</span><strong>{data.metrics.notRun}</strong><p>{data.metrics.blocked} bloqueados · {data.metrics.skipped} ignorados</p></div></div><small>Conta cada resultado por execução; rodadas repetidas fazem parte do histórico. Rascunhos e cancelados ficam fora desta taxa.</small></section>
      <section className="panel"><h3>Ambientes e versões</h3><div className="table-scroll"><table><thead><tr><th>Ambiente</th><th>Versão</th><th>Aprovação</th><th>Reprovados</th><th>Bloqueados</th><th>Pendentes</th></tr></thead><tbody>{data.contexts.map((value, index) => <tr key={index}><td>{value.environment}</td><td>{value.release}</td><td>{rate(value.metrics.passRate)}</td><td>{value.metrics.failed}</td><td>{value.metrics.blocked}</td><td>{value.metrics.notRun}</td></tr>)}</tbody></table></div></section>
      <section className="panel"><h3>Comparação de builds</h3><div className="table-scroll"><table><thead><tr><th>Build</th><th>Contexto</th><th>Ciclos</th><th>Aprovação</th><th>Falhas</th><th>Bloqueados</th><th>Pendentes</th></tr></thead><tbody>{data.builds.map((value, index) => <tr key={index}><td>{value.build}</td><td><RunContextSummary value={value.contextSnapshot as RunContext} /></td><td>{value.runs}</td><td>{rate(value.metrics.passRate)}</td><td>{value.metrics.failed}</td><td>{value.metrics.blocked}</td><td>{value.metrics.notRun}</td></tr>)}</tbody></table></div></section>
      {query.releaseId ? <section className="panel" aria-label="Situação da release"><h3>Release: {data.release.status}</h3><p>{data.release.metrics.passed + data.release.metrics.failed} executados · {data.release.metrics.notRun} pendentes · {data.release.metrics.blocked} bloqueados · {data.release.awaitingRetest} defeitos aguardando reteste.</p><p>Críticos: {data.release.criticalExecuted}/{data.release.criticalPlanned} executados · {data.release.criticalFailed.length} reprovados. Impedimentos: {data.release.blockers.length}.</p><small>Última ocorrência planejada/resultado por caso e ambiente. Rascunhos contam como pendência. Defeitos altos/críticos não fechados são impeditivos. Não mede cobertura de requisitos.</small>{data.release.criticalFailed.map((value, index) => <p key={index}><Link href={activityLink(projectId, value.runId)}>{value.title}</Link></p>)}{data.release.blockers.map(value => <p key={value.id}><Link href={activityLink(projectId, undefined, value.id)}>{value.title}</Link></p>)}<Button onClick={exportReport}>Exportar resumo de qualidade</Button></section> : <p>Selecione uma versão para consultar a situação e exportar o resumo da release.</p>}
      <div className="quality-distributions">{([
        { title: "Panorama dos defeitos", description: "Distribuição dos bugs no recorte selecionado.", className: "quality-bug-distributions", items: { "Severidade": data.bugs.severity, "Status": data.bugs.status, "Prioridade": data.bugs.priority } },
        { title: "Biblioteca de testes", description: "Inventário atual dos casos do projeto, independente do recorte de execuções.", className: "quality-case-distributions", items: { "Por suíte": data.inventory.suite, "Por prioridade": data.inventory.priority, "Por tipo": data.inventory.type, "Por estado": data.inventory.state } },
      ] as { title: string; description: string; className: string; items: Record<string, Record<string, number>> }[]).map(group => <section className={group.className} key={group.title} aria-label={group.title}>
        <header className="distribution-heading"><h3>{group.title}</h3><p>{group.description}</p></header>
        <div className="quality-distribution-grid">{Object.entries(group.items).map(([title, values]) => <section className="panel distribution-card" key={title}><h4>{title}</h4>{Object.keys(values).length ? <dl>{Object.entries(values).map(([key, count]) => <div key={key}><dt>{labels[key] ?? key}</dt><dd>{count}</dd></div>)}</dl> : <p className="distribution-empty">Nenhum registro neste recorte.</p>}</section>)}</div>
      </section>)}</div>
      <section className="panel automation-stability" aria-label="Estabilidade da automação">
        <header className="stability-heading"><span className="stability-icon"><RotateCcw size={22} aria-hidden="true" /></span><div><h3>Estabilidade da automação</h3><p>Acompanhe os testes que alternam de resultado nas execuções CI recentes.</p></div></header>
        <dl className="stability-summary"><div><dt>Casos com alternância</dt><dd>{data.automation.unstable.length}</dd></div><div><dt>Execuções CI analisadas</dt><dd>{data.automation.sampledRuns}</dd></div></dl>
        {data.automation.unstable.length ? <ul className="unstable-tests" aria-label="Testes com alternância">{data.automation.unstable.map((value, index) => <li key={index}><CircleAlert size={17} aria-hidden="true" /><span>{value.title}</span><span className="stability-branch">{value.branch || "Sem branch"}</span></li>)}</ul> : <p className="stability-empty"><CheckCircle2 size={18} aria-hidden="true" />Nenhum caso com alternância identificado nesta amostra.</p>}
        <small>Amostra recente do projeto, independente dos filtros acima. O indício exige ao menos três resultados e duas alternâncias por caso, branch e ambiente; também pode refletir correções.</small>
      </section>
      <section className="panel"><h3>Histórico e progresso dos ciclos</h3>{data.cycles.map(value => <div className="context-row" key={value.id}><div><Link href={activityLink(projectId, value.id)}>{value.name}</Link><RunContextSummary value={value.contextSnapshot as RunContext} /><p>{runStatusLabels[value.status]} · {value.metrics.total - value.metrics.notRun}/{value.metrics.total} executados · {rate(value.metrics.passRate)}</p></div></div>)}</section>
    </>}
  </section>;
}
