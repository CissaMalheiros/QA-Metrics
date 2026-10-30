"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bug as BugIcon,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  ClipboardList,
  FileCode2,
  FlaskConical,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Pencil,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { calculateMetrics } from "@/domain/metrics";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { request } from "@/lib/api-client";
import { CaseLibrary } from "@/components/case-library";
import { ExecutionResults, type ExecutionResult as Result } from "@/components/execution-results";
import { BugWorkflow } from "@/components/bug-workflow";
import { DEMO_EMAIL } from "@/lib/demo";
import { IntegrationSettings } from "@/components/integration-settings";
import { MyDay, ProjectQuality } from "@/components/productivity";
import { ProjectContext } from "@/components/project-context";
import { TestPlans } from "@/components/test-plans";
import { RunContextFields, RunContextSummary, runFormData, type RunContext } from "@/components/run-context";
import { caseCode, caseStateLabels, caseTypeLabels, suitePath, type LibraryCase as Case, type Suite } from "@/domain/cases";
import { GherkinSource } from "@/components/feature-editor";

type Project = {
  id: string;
  name: string;
  clientName: string;
  description: string;
  environment: string;
  status: string;
  createdAt: string;
  _count?: { testCases: number; runs: number; bugs: number };
};
type Run = {
  id: string;
  name: string;
  source: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  contextSnapshot?: RunContext;
  notes?: string;
  entryCriteria?: string;
  exitCriteria?: string;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  finishedAt: string | null;
  projectId: string;
  results: Result[];
  project?: Project;
};
type Bug = {
  testResult?: { run: { contextSnapshot: RunContext } } | null;
  id: string;
  title: string;
  description: string;
  stepsToReproduce: string;
  severity: string;
  status: string;
  testResultId: string | null;
  createdAt: string;
  projectId: string;
  project?: Project;
};
type Overview = {
  projects: Project[];
  runs: Run[];
  bugs: Bug[];
  workspace: { name: string };
};
type Detail = { project: Project; cases: Case[]; runs: Run[]; bugs: Bug[]; suites: Suite[] };
type Tab = "overview" | "projects" | "cases" | "runs" | "bugs" | "import" | "context" | "plans" | "integrations" | "day" | "quality";
type Editor = {
  kind: "project" | "case" | "run" | "bug";
  value?: Project | Case | Bug;
};
const labels: Record<string, string> = {
  ACTIVE: "Ativo",
  PAUSED: "Pausado",
  ARCHIVED: "Arquivado",
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica",
  PASSED: "Aprovado",
  FAILED: "Reprovado",
  BLOCKED: "Bloqueado",
  SKIPPED: "Ignorado",
  NOT_RUN: "Não executado",
  OPEN: "Aberto",
  IN_PROGRESS: "Em andamento",
  RESOLVED: "Resolvido",
  CLOSED: "Fechado",
  COMPLETED: "Encerrado",
  DRAFT: "Rascunho",
  CANCELED: "Cancelado",
  MANUAL: "Manual",
  JUNIT: "JUnit",
  GHERKIN: "Gherkin",
  CSV: "CSV",
  JUNIT_IMPORT: "JUnit XML",
};
const resultStates = ["PASSED", "FAILED", "BLOCKED", "SKIPPED", "NOT_RUN"];
const priorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const quantity = (count: number, singular: string, plural: string) =>
  `${count} ${count === 1 ? singular : plural}`;
const date = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
const dateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
function Badge({
  value,
  children,
}: {
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <span className={`badge badge-${value?.toLowerCase() ?? "neutral"}`}>
      {value && <span className="badge-dot" />}
      {children ?? labels[value ?? ""] ?? value}
    </span>
  );
}
function Select({
  id,
  name,
  values,
  initial,
  label,
}: {
  id?: string;
  name?: string;
  values: string[];
  initial?: string;
  label?: string;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={initial ?? values[0]}
      aria-label={label}
    >
      {values.map((value) => (
        <option value={value} key={value}>
          {labels[value] ?? value}
        </option>
      ))}
    </select>
  );
}
function Empty({
  icon: Icon = FolderKanban,
  title,
  text,
  action,
  onAction,
}: {
  icon?: LucideIcon;
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={26} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <Button variant="outline" onClick={onAction}>
          <Plus size={16} />
          {action}
        </Button>
      )}
    </div>
  );
}
function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
  icon: LucideIcon;
  tone?: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className={`metric-icon ${tone ?? ""}`}>
          <Icon size={18} />
        </span>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

export function WorkspaceApp({
  user,
}: {
  user: { name: string; email: string };
}) {
  const params = useSearchParams();
  return (
    <WorkspaceContent key={params.get("project") ?? "workspace"} user={user} />
  );
}
function WorkspaceContent({ user }: { user: { name: string; email: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");
  const navigationProject = useRef(projectId);
  useEffect(() => { navigationProject.current = projectId; }, [projectId]);
  const requestedTab = searchParams.get("tab") ?? "overview";
  const validTabs = projectId
    ? ["overview", "cases", "runs", "bugs", "import", "context", "plans", "integrations", "quality"]
    : ["overview", "projects", "day"];
  const tab = (
    validTabs.includes(requestedTab) ? requestedTab : "overview"
  ) as Tab;
  const [overview, setOverview] = useState<Overview | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Partial<Record<Tab, string>>>({});
  const filter = filters[tab] ?? "";
  function setFilter(value: string) {
    setFilters((current) => ({ ...current, [tab]: value }));
  }
  const [runFilter, setRunFilter] = useState("latest");
  const [workflowBug, setWorkflowBug] = useState<string | null>(null);
  const [dirtyResults, setDirtyResults] = useState<string[]>([]);
  const [contextBug, setContextBug] = useState<Partial<Bug> | null>(null);
  const [bugCreationKey, setBugCreationKey] = useState("");
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [caseDetail, setCaseDetail] = useState<Case | null>(null);
  const [deletion, setDeletion] = useState<{
    kind: "project" | "case" | "bug";
    id: string;
    title: string;
  } | null>(null);
  const [mobile, setMobile] = useState(false);
  const refresh = useCallback(async () => {
    const data = await request<Overview>("overview");
    setOverview(data);
    if (!projectId)
      setActiveRun((current) =>
        current ? (data.runs.find((r) => r.id === current.id) ?? null) : null,
      );
    if (projectId) {
      const project = await request<Detail>(`projects/${projectId}`);
      setDetail(project);
      setActiveRun((current) =>
        current
          ? (project.runs.find((r) => r.id === current.id) ?? null)
          : null,
      );
    } else setDetail(null);
  }, [projectId]);
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const data = await request<Overview>("overview");
        if (alive) setOverview(data);
        if (projectId) {
          const project = await request<Detail>(`projects/${projectId}`);
          if (alive) setDetail(project);
        } else if (alive) setDetail(null);
      } catch (e) {
        if (alive) {
          setError((e as Error).message);
          setDetail(null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [projectId]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    const runId = searchParams.get("run"), bugId = searchParams.get("bug");
    if (bugId) void request<{ bug: Bug }>(`projects/${projectId}/bugs/${bugId}`).then(value => { if (alive) setWorkflowBug(value.bug.id); }).catch(reason => { if (alive) setError(reason.message); });
    else if (runId) void request<{ run: Run }>(`projects/${projectId}/runs/${runId}`).then(value => { if (alive) setActiveRun(value.run); }).catch(reason => { if (alive) setError(reason.message); });
    return () => { alive = false; };
  }, [projectId, searchParams]);
  function navigate(nextTab: Tab, id: string | null = navigationProject.current) {
    navigationProject.current = id;
    if (id !== projectId) {
      setDetail(null);
      setLoading(true);
      setError("");
      setActiveRun(null);
      setCaseDetail(null);
    }
    const params = new URLSearchParams();
    if (id) params.set("project", id);
    if (nextTab !== "overview") params.set("tab", nextTab);
    router.push(`/dashboard${params.size ? `?${params}` : ""}`);
    setQuery("");
    setFilter("");
    setMobile(false);
  }
  function openEditor(kind: Editor["kind"], value?: Editor["value"]) {
    setFormError("");
    if (kind === "bug") { setContextBug(null); setBugCreationKey(crypto.randomUUID()); }
    setEditor({ kind, value });
  }
  async function refreshAfterSave() {
    try { await refresh(); setError(""); }
    catch { setError("A alteração foi salva, mas não foi possível atualizar a tela. Tente carregar os dados novamente."); }
  }
  async function mutate(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setFormError("");
    try {
      await action();
      setNotice(message);
      await refreshAfterSave();
      return true;
    } catch (e) {
      setFormError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function saveEditor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form.entries());
    const id = editor.value?.id;
    const kind = editor.kind;
    let body: unknown = values;
    if (kind === "case")
      body = {
        ...values,
        tags: String(values.tags ?? "").split(",").map(tag => tag.trim()).filter(Boolean),
        steps: String(values.steps)
          .split(/\r?\n/)
          .filter((step) => step.trim()),
      };
    if (kind === "run")
      body = runFormData(form);
    const path =
      kind === "project"
        ? `projects${id ? `/${id}` : ""}`
        : `projects/${projectId}/${kind === "case" ? "cases" : kind === "run" ? "runs" : "bugs"}${id ? `/${id}` : ""}`;
    const success = await mutate(
      () =>
        request(path, {
          method: id ? "PATCH" : "POST",
          body: JSON.stringify(body),
        }),
      id
        ? "Alterações salvas."
        : kind === "run"
          ? "Ciclo criado. Tudo pronto para testar."
          : "Cadastro criado com sucesso.",
    );
    if (success) setEditor(null);
  }
  async function remove() {
    if (!deletion) return;
    const path =
      deletion.kind === "project"
        ? `projects/${deletion.id}`
        : `projects/${projectId}/${deletion.kind === "case" ? "cases" : "bugs"}/${deletion.id}`;
    setBusy(true);
    setFormError("");
    try {
      await request(path, { method: "DELETE" });
      const removingCurrent =
        deletion.kind === "project" && deletion.id === projectId;
      setDeletion(null);
      if (removingCurrent) navigate("projects", null);
      else {
        try {
          await refresh();
          setError("");
        } catch {
          setError(
            "O registro foi excluído, mas não foi possível atualizar a tela. Tente carregar os dados novamente.",
          );
        }
      }
      setNotice("Registro excluído.");
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const projects = overview?.projects ?? [];
  const currentProject = detail?.project;
  const runs = projectId ? (detail?.runs ?? []) : (overview?.runs ?? []);
  const bugs = projectId ? (detail?.bugs ?? []) : (overview?.bugs ?? []);
  const cases = detail?.cases ?? [];
  const availableCases = cases.filter(value => value.state !== "ARCHIVED");
  const metricRuns = runs.filter(run => !["DRAFT", "CANCELED"].includes(run.status));
  const selectedRuns =
    runFilter === "all"
      ? metricRuns
      : runFilter === "latest"
        ? projectId
          ? metricRuns.slice(0, 1)
          : projects.flatMap((p) =>
              metricRuns.filter((r) => r.projectId === p.id).slice(0, 1),
            )
        : metricRuns.filter((r) => r.id === runFilter);
  const metrics = calculateMetrics(
    selectedRuns.flatMap((run) => run.results ?? []),
  );
  const openBugs = bugs.filter(
    (b) => !["RESOLVED", "CLOSED"].includes(b.status),
  );
  const totalCases = projectId
    ? cases.length
    : projects.reduce((sum, p) => sum + (p._count?.testCases ?? 0), 0);
  const search = (text: string) =>
    text.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"));
  const today = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const tabTitle: Record<Tab, string> = {
    overview: currentProject ? currentProject.name : "Visão geral",
    projects: "Seus projetos",
    cases: "Casos de teste",
    runs: "Ciclos de teste",
    bugs: "Bugs",
    import: "Importar resultados",
    context: "Ambientes e versões",
    plans: "Planos de teste",
    integrations: "Integrações CI/CD",
    day: "Meu dia",
    quality: "Qualidade e release",
  };
  return (
    <div className="app-layout">
      <a href="#main-content" className="skip-link">
        Pular para o conteúdo
      </a>
      {mobile && (
        <button
          className="sidebar-backdrop"
          onClick={() => setMobile(false)}
          aria-label="Fechar menu"
        />
      )}
      <aside className={`sidebar ${mobile ? "sidebar-open" : ""}`}>
        <a href="/dashboard" className="brand">
          <span className="brand-mark">
            <FlaskConical size={23} />
          </span>
          <span>
            qa<span className="brand-light">metrics</span>
            <span className="brand-period">.</span>
          </span>
        </a>
        <div className="workspace-chip">
          <div className="workspace-avatar">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <strong>Meu workspace</strong>
            <span>Espaço pessoal</span>
          </div>
          <ChevronDown size={15} />
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav aria-label="Navegação principal">
          <button className={`nav-item ${tab === "day" ? "active" : ""}`} onClick={() => navigate("day", null)}><ClipboardList size={18} />Meu dia</button>
          <button
            className={`nav-item ${!projectId && tab === "overview" ? "active" : ""}`}
            onClick={() => navigate("overview", null)}
          >
            <LayoutDashboard size={19} />
            Visão geral
          </button>
          <button
            className={`nav-item ${!projectId && tab === "projects" ? "active" : ""}`}
            onClick={() => navigate("projects", null)}
          >
            <FolderKanban size={19} />
            Projetos<span className="nav-count">{projects.length}</span>
          </button>
        </nav>
        <div className="nav-section-title">
          <span className="nav-caption">SEUS PROJETOS</span>
          <button
            aria-label="Novo projeto"
            className="icon-button"
            onClick={() => openEditor("project")}
          >
            <Plus size={17} />
          </button>
        </div>
        <nav className="project-nav" aria-label="Selecionar projeto">
          {projects.map((p, i) => (
            <button
              title={`${p.name} · ${p.clientName}`}
              key={p.id}
              className={`nav-project ${projectId === p.id ? "active" : ""}`}
              onClick={() => navigate("overview", p.id)}
            >
              <span className={`project-dot color-${i % 4}`} />
              <span>{p.name}</span>
              {p.id === projectId && <ChevronRight size={14} />}
            </button>
          ))}
          {!projects.length && (
            <p className="nav-empty">
              Seu primeiro projeto
              <br />
              começa com um clique no +.
            </p>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="local-status" />
            <span>Seu ambiente, seus dados</span>
            <ShieldCheck size={15} />
          </div>
          <div className="user-block">
            <span className="user-avatar">
              {user.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </span>
            <span>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </span>
            <button
              className="icon-button"
              aria-label="Sair"
              title="Sair"
              onClick={async () => {
                await authClient.signOut();
                router.replace("/login");
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="Abrir menu"
              onClick={() => setMobile(true)}
            >
              <Menu size={22} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>
              {projectId
                ? (currentProject?.name ?? "Projeto")
                : tabTitle[tab] ?? "Visão geral"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="local-pill">
              <span />
              Local
            </span>
            <span className="topbar-avatar">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {projectId
                  ? (currentProject?.clientName ?? "PROJETO")
                  : "SEU PANORAMA DE QUALIDADE"}
              </div>
              <h1>
                {tabTitle[tab] ?? "Visão geral"}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {projectId
                  ? currentProject?.description ||
                    "Casos de teste, execuções e bugs deste projeto."
                  : "Acompanhe testes, execuções e bugs dos seus projetos."}
              </p>
            </div>
            <div className="heading-actions">
              <span className="date-chip">
                <CalendarDays size={16} />
                {today}
              </span>
              {!projectId && tab !== "day" && (
                <Button onClick={() => openEditor("project")}>
                  <Plus size={17} />
                  Novo projeto
                </Button>
              )}
              {projectId && (
                <Button
                  variant="outline"
                  onClick={() => openEditor("project", currentProject)}
                >
                  <Pencil size={15} />
                  Editar projeto
                </Button>
              )}
            </div>
          </div>
          {projectId && (
            <>
              <div className="project-context">
                <Badge value={currentProject?.status} />
                {currentProject?.environment && (
                  <span>
                    <CircleDashed size={14} />
                    {currentProject.environment}
                  </span>
                )}
                <span className="context-right">
                  Dados exclusivos deste projeto
                </span>
              </div>
              <nav className="tabs" aria-label="Seções do projeto">
                {(
                  [
                    ["overview", "Visão geral", BarChart3],
                    ["cases", "Casos de teste", ClipboardList],
                    ["runs", "Ciclos", Play],
                    ["bugs", "Bugs", BugIcon],
                    ["import", "Importar XML", Upload],
                    ["context", "Ambientes e versões", FolderKanban],
                    ["plans", "Planos de teste", ClipboardList],
                    ["integrations", "Integrações CI/CD", FileCode2],
                    ["quality", "Qualidade e release", BarChart3],
                  ] as [Tab, string, LucideIcon][]
                ).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    onClick={() => navigate(id)}
                    className={tab === id ? "selected" : ""}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </nav>
            </>
          )}
          {notice && (
            <div className="toast" role="status">
              <CircleCheck size={19} />
              {notice}
              <button
                className="icon-button"
                aria-label="Dispensar aviso"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setError("");
                  setLoading(true);
                  refresh()
                    .catch((e) => setError(e.message))
                    .finally(() => setLoading(false));
                }}
              >
                Tentar novamente
              </Button>
            </div>
          )}
          {loading ? (
            <div className="loading-grid">
              {Array.from({ length: 4 }, (_, i) => (
                <div className="skeleton" key={i} />
              ))}
              <p>Carregando seus projetos e indicadores…</p>
            </div>
          ) : (
            !error && (
              <>
                {tab === "overview" && (
                  <>
                    <div className="section-context">
                      <span>
                        <span className="live-dot" /> Panorama{" "}
                        {projectId ? "do projeto" : "do workspace"}
                      </span>
                      <label className="inline-filter">
                        Ciclo
                        <select
                          aria-label="Filtrar métricas por ciclo"
                          value={runFilter}
                          onChange={(e) => setRunFilter(e.target.value)}
                        >
                          <option value="latest">
                            {projectId
                              ? "Ciclo mais recente"
                              : "Último ciclo de cada projeto"}
                          </option>
                          <option value="all">
                            Todos os ciclos · todo o histórico
                          </option>
                          {metricRuns.map((run) => (
                            <option key={run.id} value={run.id}>
                              {run.name} {run.contextSnapshot?.build ? `· build ${run.contextSnapshot.build}` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <section className="metrics-context" aria-label="Contexto dos indicadores"><div className="metrics-context-grid">{selectedRuns.map(run => <div key={run.id}><strong>{run.name}</strong><RunContextSummary value={run.contextSnapshot} /></div>)}</div><small>Rascunhos e ciclos cancelados não entram nos indicadores de execução.</small></section>
                    <div className="metrics-grid">
                      <MetricCard
                        label={projectId ? "Casos de teste" : "Projetos ativos"}
                        value={
                          projectId
                            ? totalCases
                            : projects
                                .filter((p) => p.status === "ACTIVE")
                                .length.toString()
                                .padStart(2, "0")
                        }
                        detail={
                          projectId
                            ? `${quantity(cases.filter((c) => c.origin === "MANUAL").length, "manual", "manuais")} · ${quantity(cases.filter((c) => c.origin !== "MANUAL").length, "importado", "importados")}`
                            : `${quantity(projects.length, "projeto", "projetos")} no seu workspace`
                        }
                        icon={projectId ? ClipboardList : FolderKanban}
                      />
                      <MetricCard
                        label="Testes no período"
                        value={metrics.total}
                        detail={`${metrics.passed + metrics.failed} com resultado definido`}
                        icon={ClipboardList}
                        tone="blue"
                      />
                      <MetricCard
                        label="Taxa de aprovação"
                        value={
                          metrics.passRate === null
                            ? "—"
                            : `${Math.round(metrics.passRate)}%`
                        }
                        detail={`${quantity(metrics.passed, "aprovado", "aprovados")} / ${metrics.denominator} aprovados + reprovados`}
                        icon={CheckCheck}
                        tone="green"
                      />
                      <MetricCard
                        label="Bugs em aberto"
                        value={openBugs.length.toString().padStart(2, "0")}
                        detail={`${openBugs.filter((b) => b.severity === "CRITICAL" || b.severity === "HIGH").length} com severidade alta ou crítica`}
                        icon={BugIcon}
                        tone="orange"
                      />
                    </div>
                    <div className="dashboard-chart-grid">
                      <section className="panel execution-panel">
                        <div className="panel-header">
                          <div>
                            <h2>Saúde das execuções</h2>
                            <p>
                              O resultado de cada teste, sem perder o contexto.
                            </p>
                          </div>
                          <span className="panel-icon">
                            <Activity size={19} />
                          </span>
                        </div>
                        <div className="execution-summary">
                          <strong>
                            {metrics.passRate === null
                              ? "—"
                              : `${Math.round(metrics.passRate)}%`}
                          </strong>
                          <div>
                            <span>de aprovação</span>
                            <small>
                              {metrics.denominator
                                ? `${metrics.denominator} resultados no cálculo`
                                : "Aguardando resultados"}
                            </small>
                          </div>
                          {metrics.passRate !== null &&
                            metrics.passRate >= 80 && (
                              <span className="positive-tag">
                                <ArrowUpRight size={14} />
                                Bom ritmo
                              </span>
                            )}
                        </div>
                        <div
                          className="stacked-bar"
                          aria-label={`${metrics.total} testes no período`}
                        >
                          {metrics.total ? (
                            resultStates.map((status) => (
                              <span
                                key={status}
                                className={`bar-${status.toLowerCase()}`}
                                style={{
                                  width: `${((metrics.counts[status as keyof typeof metrics.counts] ?? 0) / metrics.total) * 100}%`,
                                }}
                                title={`${labels[status]}: ${metrics.counts[status as keyof typeof metrics.counts] ?? 0}`}
                              />
                            ))
                          ) : (
                            <span className="bar-empty" />
                          )}
                        </div>
                        <div className="result-legend">
                          {resultStates.map((status) => (
                            <div key={status}>
                              <span
                                className={`legend-dot bar-${status.toLowerCase()}`}
                              />
                              <span>{labels[status]}</span>
                              <strong>
                                {metrics.counts[
                                  status as keyof typeof metrics.counts
                                ] ?? 0}
                              </strong>
                            </div>
                          ))}
                        </div>
                        <p className="chart-footnote">
                          Aprovação = aprovados ÷ (aprovados + reprovados).
                          Bloqueados, ignorados e não executados ficam fora do
                          cálculo.
                        </p>
                        <div className="period-note">
                          {runFilter === "latest"
                            ? projectId
                              ? "Escopo: ciclo mais recente."
                              : "Escopo: último ciclo de cada projeto."
                            : runFilter === "all"
                              ? "Escopo: todos os ciclos, em todo o histórico."
                              : `Escopo: ${selectedRuns[0]?.name ?? "ciclo selecionado"}.`}
                        </div>
                      </section>
                      <section className="panel bugs-panel">
                        <div className="panel-header">
                          <div>
                            <h2>Atenção aos bugs</h2>
                            <p>Defeitos abertos, por severidade.</p>
                          </div>
                          <BugIcon size={18} />
                        </div>
                        <div className="severity-bars">
                          {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map(
                            (severity) => {
                              const count = openBugs.filter(
                                (b) => b.severity === severity,
                              ).length;
                              return (
                                <div key={severity}>
                                  <span>
                                    <span
                                      className={`severity-dot severity-${severity.toLowerCase()}`}
                                    />
                                    {labels[severity]}
                                  </span>
                                  <div className="severity-track">
                                    <span
                                      className={`severity-${severity.toLowerCase()}`}
                                      style={{
                                        width: `${openBugs.length ? (count / openBugs.length) * 100 : 0}%`,
                                      }}
                                    />
                                  </div>
                                  <strong>{count}</strong>
                                </div>
                              );
                            },
                          )}
                        </div>
                        <div
                          className="bug-status-counts"
                          aria-label="Bugs por status"
                        >
                          {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map(
                            (status) => (
                              <div key={status}>
                                <span>{labels[status]}</span>
                                <strong>
                                  {
                                    bugs.filter((bug) => bug.status === status)
                                      .length
                                  }
                                </strong>
                              </div>
                            ),
                          )}
                        </div>
                        <div className="bugs-footer">
                          <ShieldCheck size={17} />
                          <span>
                            {openBugs.length
                              ? `${quantity(openBugs.length, "bug", "bugs")} aguardando atenção`
                              : "Nenhum bug em aberto por aqui."}
                          </span>
                        </div>
                      </section>
                    </div>
                    {!projectId ? (
                      <ProjectsSection
                        projects={projects}
                        onSelect={(id) => navigate("overview", id)}
                        onCreate={() => openEditor("project")}
                        onEdit={(p) => openEditor("project", p)}
                        onDelete={(p) => {
                          setFormError("");
                          setDeletion({
                            kind: "project",
                            id: p.id,
                            title: p.name,
                          });
                        }}
                        compact
                      />
                    ) : (
                      <div className="dashboard-lower-grid">
                        <section className="panel">
                          <div className="panel-header">
                            <div>
                              <h2>Últimos ciclos</h2>
                              <p>Um registro de cada rodada de testes.</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate("runs")}
                            >
                              Ver todos
                              <ArrowRight size={15} />
                            </Button>
                          </div>
                          {runs.length ? (
                            runs
                              .slice(0, 4)
                              .map((run) => (
                                <RunRow
                                  key={run.id}
                                  run={run}
                                  onClick={() => setActiveRun(run)}
                                />
                              ))
                          ) : (
                            <Empty
                              icon={Play}
                              title="Seu primeiro ciclo está por vir"
                              text="Reúna os casos e comece uma rodada de testes."
                              action="Novo ciclo"
                              onAction={() => openEditor("run")}
                            />
                          )}
                        </section>
                        <ImportCallout onClick={() => navigate("import")} />
                      </div>
                    )}
                    <div className="workspace-footer">
                      <span>
                        <span className="live-dot" />
                        Dados reais do seu workspace
                      </span>
                      <span>Um teste de cada vez. Uma entrega melhor.</span>
                    </div>
                  </>
                )}
                {tab === "projects" && (
                  <ProjectsSection
                    projects={projects}
                    onSelect={(id) => navigate("overview", id)}
                    onCreate={() => openEditor("project")}
                    onEdit={(p) => openEditor("project", p)}
                    onDelete={(p) => {
                      setFormError("");
                      setDeletion({ kind: "project", id: p.id, title: p.name });
                    }}
                  />
                )}
                {tab === "day" && <MyDay />}
                {tab === "quality" && projectId && <ProjectQuality key={projectId} projectId={projectId} />}
                {tab === "integrations" && projectId && <IntegrationSettings key={projectId} projectId={projectId} demo={user.email === DEMO_EMAIL} />}
                {tab === "context" && projectId && <ProjectContext key={projectId} projectId={projectId} />}
                {tab === "plans" && projectId && <TestPlans key={projectId} projectId={projectId} cases={cases} onChanged={refreshAfterSave} />}
                {tab === "cases" && projectId && (
                  <CaseLibrary key={projectId} projectId={projectId} version={cases}
                    onCreate={() => openEditor("case")} onEdit={value => openEditor("case", value)}
                    onDetail={setCaseDetail} onChanged={refreshAfterSave}
                    onDelete={value => { setFormError(""); setDeletion({ kind: "case", id: value.id, title: value.title }); }}
                  />
                )}
                {tab === "runs" && (
                  <section className="panel">
                    <ListHeader
                      title="Ciclos de execução"
                      description="Planeje, execute e preserve o histórico de cada entrega."
                      query={query}
                      onQuery={setQuery}
                      action="Novo ciclo"
                      onAction={() => openEditor("run")}
                    >
                      <select
                        aria-label="Filtrar ciclos por status"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        <option value="">Todos os status</option>
                        <option value="OPEN">Abertos</option>
                        <option value="COMPLETED">Encerrados</option>
                        <option value="DRAFT">Rascunhos</option>
                        <option value="CANCELED">Cancelados</option>
                      </select>
                    </ListHeader>
                    {runs.length ? (
                      <div className="run-list">
                        {runs
                          .filter(
                            (r) =>
                              search(r.name) &&
                              (!filter || r.status === filter),
                          )
                          .map((run) => (
                            <RunRow
                              key={run.id}
                              run={run}
                              onClick={() => {
                                setFormError("");
                                setActiveRun(run);
                              }}
                            />
                          ))}
                        {!runs.some(
                          (r) =>
                            search(r.name) && (!filter || r.status === filter),
                        ) && (
                          <div className="no-results">
                            Nenhum ciclo corresponde aos filtros.
                          </div>
                        )}
                      </div>
                    ) : (
                      <Empty
                        icon={Play}
                        title="Tudo pronto para o próximo ciclo"
                        text="Selecione os casos de teste e acompanhe os resultados de uma nova execução."
                        action="Novo ciclo"
                        onAction={() => openEditor("run")}
                      />
                    )}
                  </section>
                )}
                {tab === "bugs" && (
                  <section className="panel">
                    <ListHeader
                      title="Registro de bugs"
                      description={`${openBugs.length} em aberto · ${bugs.length} registrados neste projeto.`}
                      query={query}
                      onQuery={setQuery}
                      action="Novo bug"
                      onAction={() => openEditor("bug")}
                    >
                      <select
                        aria-label="Filtrar bugs por status"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        <option value="">Todos os status</option>
                        {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map(
                          (s) => (
                            <option key={s} value={s}>
                              {labels[s]}
                            </option>
                          ),
                        )}
                      </select>
                    </ListHeader>
                    {bugs.length ? (
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Bug</th>
                              <th>Severidade</th>
                              <th>Status</th>
                              <th>Criado em</th>
                              <th>
                                <span className="sr-only">Ações</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {bugs
                              .filter(
                                (b) =>
                                  search(b.title) &&
                                  (!filter || b.status === filter),
                              )
                              .map((b) => (
                                <tr key={b.id}>
                                  <td>
                                    <button
                                      className="table-title"
                                      onClick={() => setWorkflowBug(b.id)}
                                    >
                                      <BugIcon size={16} />
                                      {b.title}
                                    </button>
                                    <RunContextSummary value={b.testResult?.run.contextSnapshot} />
                                  </td>
                                  <td>
                                    <Badge value={b.severity} />
                                  </td>
                                  <td>
                                    <Badge value={b.status} />
                                  </td>
                                  <td className="muted">{date(b.createdAt)}</td>
                                  <td>
                                    <div className="row-actions">
                                      <button
                                        className="icon-button"
                                        aria-label={`Editar ${b.title}`}
                                        onClick={() => openEditor("bug", b)}
                                      >
                                        <Pencil size={15} />
                                      </button>
                                      <button
                                        className="icon-button danger-text"
                                        aria-label={`Excluir ${b.title}`}
                                        onClick={() => {
                                          setFormError("");
                                          setDeletion({
                                            kind: "bug",
                                            id: b.id,
                                            title: b.title,
                                          });
                                        }}
                                      >
                                        <Trash2 size={15} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                        {!bugs.some(
                          (b) =>
                            search(b.title) && (!filter || b.status === filter),
                        ) && (
                          <div className="no-results">
                            Nenhum bug corresponde aos filtros.
                          </div>
                        )}
                      </div>
                    ) : (
                      <Empty
                        icon={BugIcon}
                        title="Uma lista vazia que é boa notícia"
                        text="Encontrou um problema? Registre os detalhes e acompanhe a correção por aqui."
                        action="Novo bug"
                        onAction={() => openEditor("bug")}
                      />
                    )}
                  </section>
                )}
                {tab === "import" && (
                  <ImportPanel
                    projectId={projectId!}
                    onSuccess={async (message) => {
                      await refresh();
                      setNotice(message);
                    }}
                  />
                )}
              </>
            )
          )}
        </main>
      </div>
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open && !busy) setEditor(null);
        }}
        title={
          editor
            ? `${editor.value ? "Editar" : "Novo"} ${editor.kind === "project" ? "projeto" : editor.kind === "case" ? "caso de teste" : editor.kind === "run" ? "ciclo" : "bug"}`
            : ""
        }
        description="Os dados ficam restritos ao seu workspace."
        wide={editor?.kind === "case" || editor?.kind === "bug"}
      >
        <form
          onSubmit={saveEditor}
          className="form-stack"
          key={`${editor?.kind}-${editor?.value?.id ?? "new"}`}
        >
          {editor?.kind === "project" && (
            <ProjectFields project={editor.value as Project | undefined} />
          )}
          {editor?.kind === "case" && (
            <CaseFields testCase={editor.value as Case | undefined} suites={detail?.suites ?? []} />
          )}
          {editor?.kind === "run" && (
            <>
              <Field label="Nome do ciclo">
                <input
                  name="name"
                  required
                  maxLength={160}
                  placeholder="Ex.: Regressão · versão 1.0"
                />
              </Field>
              <fieldset className="case-checklist">
                <legend>Selecione os casos de teste</legend>
                {availableCases.length ? (
                  availableCases.map((c) => (
                    <label key={c.id}>
                      <input type="checkbox" name="testCaseIds" value={c.id} />
                      <span>{c.title}</span>
                      <Badge value={c.priority} />
                    </label>
                  ))
                ) : (
                  <p>Cadastre um caso de teste antes de criar um ciclo.</p>
                )}
              </fieldset>
              {projectId && <RunContextFields projectId={projectId} />}
            </>
          )}
          {editor?.kind === "bug" && (
            <BugFields bug={(editor.value as Bug | undefined) ?? contextBug ?? undefined} runs={runs} creationKey={!editor.value ? bugCreationKey : undefined} />
          )}
          {formError && (
            <div className="alert alert-error" role="alert">
              {formError}
            </div>
          )}
          <div className="form-footer">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditor(null)}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button
              disabled={busy || (editor?.kind === "run" && !availableCases.length)}
              type="submit"
            >
              {busy
                ? "Salvando…"
                : editor?.value
                  ? "Salvar alterações"
                  : editor?.kind === "project"
                    ? "Criar projeto"
                    : editor?.kind === "case"
                      ? "Criar caso"
                      : editor?.kind === "run"
                        ? "Criar ciclo"
                        : "Criar bug"}
            </Button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={!!deletion}
        onOpenChange={(open) => {
          if (!open && !busy) setDeletion(null);
        }}
        title="Excluir registro?"
        description={`Você está prestes a excluir “${deletion?.title ?? ""}”.`}
      >
        <p className="delete-description">
          {deletion?.kind === "project"
            ? "Somente projetos sem registros podem ser excluídos. Para preservar casos, ciclos, resultados e bugs, edite o projeto e escolha Arquivado."
            : deletion?.kind === "case"
              ? "A exclusão é permanente. Casos com revisões ou resultados são preservados; use o arquivamento."
              : "Bugs vinculados a execuções são preservados e devem ser fechados. Bugs sem vínculo podem ser excluídos permanentemente."}
        </p>
        {formError && (
          <div className="alert alert-error" role="alert">
            {formError}
          </div>
        )}
        <div className="form-footer">
          <Button
            variant="outline"
            onClick={() => setDeletion(null)}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button variant="destructive" disabled={busy} onClick={remove}>
            {busy ? "Excluindo…" : "Confirmar exclusão"}
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={!!caseDetail}
        onOpenChange={(open) => {
          if (!open) setCaseDetail(null);
        }}
        title={caseDetail?.title ?? "Caso de teste"}
        description="Detalhes do caso de teste."
        wide
      >
        {caseDetail?.format === "BDD" && <GherkinSource source={caseDetail.gherkinSource} />}
        {caseDetail && (
          <div className="case-detail">
            <div className="detail-badges">
              <Badge value={caseDetail.priority} />
              <Badge value={caseDetail.origin} />
            </div>
            <h3>Descrição</h3>
            <p>{caseDetail.description || "Sem descrição."}</p>
            <h3>Pré-condições</h3>
            <p>
              {caseDetail.preconditions || "Nenhuma pré-condição informada."}
            </p>
            <h3>Passos</h3>
            <ol>
              {caseDetail.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
            <h3>Resultado esperado</h3>
            <p>{caseDetail.expectedResult || "Não informado."}</p>
            <div className="form-footer">
              <Button
                onClick={() => {
                  openEditor("case", caseDetail);
                  setCaseDetail(null);
                }}
              >
                <Pencil size={15} />
                Editar caso
              </Button>
            </div>
          </div>
        )}
      </Dialog>
      {workflowBug && projectId && <BugWorkflow projectId={projectId} bugId={workflowBug} onClose={() => setWorkflowBug(null)} onChanged={refreshAfterSave} onRun={id => {
        void request<{ run: Run }>(`projects/${projectId}/runs/${id}`).then(value => { setWorkflowBug(null); setActiveRun(value.run); }).catch(reason => setFormError(reason.message));
      }} />}
      <Dialog
        open={!!activeRun}
        onOpenChange={(open) => {
          if (!open && !busy) {
            if (dirtyResults.length) { setFormError("Salve ou descarte as alterações antes de fechar a execução."); return; }
            setActiveRun(null);
          }
        }}
        className="execution-dialog"
        title={activeRun?.name ?? "Ciclo de teste"}
        description={
          activeRun
            ? `${labels[activeRun.source]} · Criado em ${dateTime(activeRun.createdAt)}`
            : undefined
        }
        wide
      >
        {activeRun && (
          <div className="run-detail">
            <div className="run-detail-header">
                <Badge value={activeRun.status === "OPEN" ? "IN_PROGRESS" : activeRun.status} />
              <span>{quantity(activeRun.results.length, "caso de teste", "casos de teste")}</span>
              {activeRun.status === "COMPLETED" && (
                <span>
                  <ShieldCheck size={15} />
                  Histórico preservado
                </span>
              )}
            </div>
            <div className="run-context-card"><RunContextSummary value={activeRun.contextSnapshot} />
            <details><summary>Planejamento e critérios do ciclo</summary>
            {!activeRun.scheduledStart && !activeRun.scheduledEnd && !activeRun.notes && !activeRun.entryCriteria && !activeRun.exitCriteria && <p>Nenhuma observação ou critério informado.</p>}
            {(activeRun.scheduledStart || activeRun.scheduledEnd) && <p>Previsão: {activeRun.scheduledStart ? dateTime(activeRun.scheduledStart) : "não informada"} até {activeRun.scheduledEnd ? dateTime(activeRun.scheduledEnd) : "não informada"}</p>}
            {activeRun.notes && <p>Observações: {activeRun.notes}</p>}
            {activeRun.entryCriteria && <p>Critérios de entrada: {activeRun.entryCriteria}</p>}
            {activeRun.exitCriteria && <p>Critérios de saída: {activeRun.exitCriteria}</p>}
            </details></div>
            {activeRun.status === "DRAFT" && <p className="run-state-notice">Este ciclo ainda não começou. Confira os casos e inicie o ciclo para registrar os resultados.</p>}
            {["DRAFT", "OPEN"].includes(activeRun.status) && <div className="library-actions run-cycle-actions">
              {activeRun.status === "DRAFT" && <Button disabled={busy} onClick={() => void mutate(() => request(`projects/${activeRun.projectId}/runs/${activeRun.id}/start`, { method: "POST", body: "{}" }), "Ciclo iniciado.")}>Iniciar ciclo</Button>}
              <Button variant="outline" disabled={busy || !!dirtyResults.length} onClick={() => void mutate(() => request(`projects/${activeRun.projectId}/runs/${activeRun.id}/cancel`, { method: "POST", body: "{}" }), "Ciclo cancelado. Histórico preservado.")}>Cancelar ciclo</Button>
            </div>}
            {formError && (
              <div className="alert alert-error" role="alert">
                {formError}
              </div>
            )}
            <ExecutionResults key={activeRun.id} initialResultId={searchParams.get("result") ?? undefined} results={activeRun.results} disabled={activeRun.status !== "OPEN" || activeRun.source !== "MANUAL" || busy} dirty={dirtyResults}
              onDirty={(id, value) => setDirtyResults(current => value ? [...new Set([...current, id])] : current.filter(item => item !== id))}
              onSave={async (result, values) => {
                const response = await request<{ result: Result }>(`projects/${activeRun.projectId}/runs/${activeRun.id}/results/${result.id}`, { method: "PATCH", body: JSON.stringify(values) });
                await refreshAfterSave(); return response.result;
              }}
              onBug={result => {
                if (dirtyResults.length) { setFormError("Salve ou descarte as alterações antes de criar o defeito."); return; }
                setActiveRun(null); openEditor("bug");
                setContextBug({ title: `Falha: ${result.caseTitle}`.slice(0, 200), description: result.actualResult || result.notes || "Falha identificada na execução manual.", stepsToReproduce: result.caseSnapshot.steps?.join("\n") ?? "", testResultId: result.id });
              }}
            />
            {activeRun.status === "OPEN" && (
              <div className="complete-run">
                <p>
                  Ao encerrar, os resultados e as observações ficam preservados
                  no histórico, inclusive os casos não executados.
                </p>
                <Button
                  disabled={busy || !!dirtyResults.length}
                  onClick={async () => {
                    await mutate(
                      () =>
                        request(
                          `projects/${activeRun.projectId}/runs/${activeRun.id}/complete`,
                          { method: "POST", body: "{}" },
                        ),
                      "Ciclo encerrado. Histórico preservado.",
                    );
                  }}
                >
                  <Check size={16} />
                  Encerrar ciclo
                </Button>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}

function ListHeader({
  title,
  description,
  query,
  onQuery,
  action,
  onAction,
  children,
}: {
  title: string;
  description: string;
  query: string;
  onQuery: (q: string) => void;
  action: string;
  onAction: () => void;
  children?: React.ReactNode;
}) {
  return (
    <>
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <Button onClick={onAction}>
          <Plus size={16} />
          {action}
        </Button>
      </div>
      <div className="list-toolbar">
        <label className="search-box">
          <Search size={17} />
          <input
            aria-label="Buscar registros"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Buscar por nome…"
          />
        </label>
        {children}
      </div>
    </>
  );
}
function ProjectsSection({
  projects,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
  compact = false,
}: {
  projects: Project[];
  onSelect: (id: string) => void;
  onCreate: () => void;
  onEdit: (p: Project) => void;
  onDelete: (p: Project) => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const visible = projects.filter(
    (p) =>
      `${p.name} ${p.clientName}`.toLowerCase().includes(query.toLowerCase()) &&
      (!status || p.status === status),
  );
  return (
    <section className="panel projects-panel">
      <div className="panel-header">
        <div>
          <h2>
            Seus projetos <span className="title-count">{projects.length}</span>
          </h2>
          <p>Contextos diferentes. O mesmo cuidado com a qualidade.</p>
        </div>
        {compact ? (
          <Button variant="ghost" size="sm" onClick={onCreate}>
            <Plus size={16} />
            Adicionar projeto
          </Button>
        ) : (
          <Button onClick={onCreate}>
            <Plus size={16} />
            Novo projeto
          </Button>
        )}
      </div>
      {!compact && (
        <div className="list-toolbar">
          <label className="search-box">
            <Search size={17} />
            <input
              aria-label="Buscar projetos"
              placeholder="Buscar projeto ou cliente…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Filtrar projetos por status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Todos os status</option>
            {["ACTIVE", "PAUSED", "ARCHIVED"].map((s) => (
              <option key={s} value={s}>
                {labels[s]}
              </option>
            ))}
          </select>
        </div>
      )}
      {projects.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Projeto</th>
                <th>Status</th>
                <th>Casos de teste</th>
                <th>Ciclos</th>
                <th>Bugs</th>
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, compact ? 5 : undefined).map((p, i) => (
                <tr key={p.id}>
                  <td>
                    <button
                      className="project-table-link"
                      onClick={() => onSelect(p.id)}
                    >
                      <span className={`project-tile color-${i % 4}`}>
                        <FolderKanban size={19} />
                      </span>
                      <span>
                        <strong>{p.name}</strong>
                        <small>{p.clientName}</small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <Badge value={p.status} />
                  </td>
                  <td>
                    <span className="cell-icon">
                      <ClipboardList size={14} />
                      {p._count?.testCases ?? 0}
                    </span>
                  </td>
                  <td>{p._count?.runs ?? 0}</td>
                  <td>{p._count?.bugs ?? 0}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        aria-label={`Editar ${p.name}`}
                        onClick={() => onEdit(p)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="icon-button danger-text"
                        aria-label={`Excluir ${p.name}`}
                        onClick={() => onDelete(p)}
                      >
                        <Trash2 size={15} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Abrir ${p.name}`}
                        onClick={() => onSelect(p.id)}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && (
            <div className="no-results">
              Nenhum projeto corresponde aos filtros.
            </div>
          )}
        </div>
      ) : (
        <Empty
          title="Um novo projeto. Um novo começo."
          text="Organize os testes de cada cliente em um espaço próprio. Crie seu primeiro projeto para começar."
          action="Criar primeiro projeto"
          onAction={onCreate}
        />
      )}
    </section>
  );
}
function RunRow({ run, onClick }: { run: Run; onClick: () => void }) {
  const metrics = calculateMetrics(run.results ?? []);
  return (
    <button className="run-row" onClick={onClick}>
      <span
        className={`run-icon ${run.source === "JUNIT_IMPORT" ? "imported" : ""}`}
      >
        {run.source === "JUNIT_IMPORT" ? (
          <FileCode2 size={19} />
        ) : (
          <Play size={18} />
        )}
      </span>
      <span className="run-row-title">
        <strong>{run.name}</strong>
        <RunContextSummary value={run.contextSnapshot} />
        <small>
          {date(run.createdAt)} · {run.results?.length ?? 0} casos ·{" "}
          {labels[run.source]}
        </small>
      </span>
      <span className="run-progress">
        <span
          style={{
            width: `${metrics.total ? ((metrics.passed + metrics.failed + metrics.blocked + metrics.skipped) / metrics.total) * 100 : 0}%`,
          }}
        />
      </span>
      <Badge value={run.status === "OPEN" ? "IN_PROGRESS" : run.status} />
      <ChevronRight size={16} />
    </button>
  );
}
function ImportCallout({ onClick }: { onClick: () => void }) {
  return (
    <section className="import-callout">
      <div className="import-callout-icon">
        <FileCode2 size={25} />
        <Sparkles size={14} />
      </div>
      <span className="eyebrow">AUTOMAÇÃO</span>
      <h2>
        Resultados de testes
        <br />
        automatizados.
      </h2>
      <p>
        Importe relatórios JUnit do Playwright ou Cypress e acompanhe todos os
        resultados juntos.
      </p>
      <Button variant="outline" onClick={onClick}>
        Importar XML
        <ArrowUpRight size={15} />
      </Button>
    </section>
  );
}
function ProjectFields({ project }: { project?: Project }) {
  return (
    <>
      <Field label="Nome do projeto">
        <input
          name="name"
          defaultValue={project?.name}
          required
          maxLength={120}
          placeholder="Ex.: Portal do cliente"
        />
      </Field>
      <Field label="Cliente">
        <input
          name="clientName"
          defaultValue={project?.clientName}
          required
          maxLength={120}
          placeholder="Ex.: Acme"
        />
      </Field>
      <Field label="Descrição">
        <textarea
          name="description"
          defaultValue={project?.description}
          maxLength={4000}
          rows={3}
          placeholder="Um pouco de contexto sobre o projeto…"
        />
      </Field>
      <div className="form-grid">
        <Field label="Ambiente">
          <input
            name="environment"
            defaultValue={project?.environment}
            maxLength={200}
            placeholder="Ex.: Homologação"
          />
        </Field>
        <Field label="Status">
          <Select
            name="status"
            values={["ACTIVE", "PAUSED", "ARCHIVED"]}
            initial={project?.status}
          />
        </Field>
      </div>
    </>
  );
}
function CaseFields({ testCase: original, suites }: { testCase?: Case; suites: Suite[] }) {
  const [template, setTemplate] = useState("");
  const templates: Record<string, Partial<Case>> = {
    functional: { title: "Validar funcionalidade", description: "Objetivo do teste funcional", steps: ["Preparar os dados", "Executar a ação", "Conferir o resultado"], expectedResult: "O comportamento atende ao requisito.", type: "FUNCTIONAL", tags: ["regressao"] },
    api: { title: "Validar resposta da API", preconditions: "Credenciais e dados de teste disponíveis", steps: ["Preparar método, URL e payload", "Enviar a requisição", "Validar status, contrato e conteúdo da resposta"], expectedResult: "A resposta respeita o contrato e as regras de negócio.", type: "API", tags: ["api"] },
    exploratory: { title: "Explorar fluxo crítico", description: "Carta de exploração: riscos, objetivo e limite de tempo", steps: ["Definir objetivo e riscos", "Variar dados e caminhos", "Registrar observações e defeitos"], expectedResult: "Riscos investigados e descobertas registradas.", type: "EXPLORATORY", tags: ["exploratorio"] },
  };
  const testCase = original ?? templates[template];
  return (
    <>
      {!original && <Field label="Aplicar modelo (substitui os campos)"><select value={template} onChange={event => setTemplate(event.target.value)}><option value="">Em branco</option><option value="functional">Funcional</option><option value="api">API</option><option value="exploratory">Exploratório orientado</option></select></Field>}
      <div key={template}>
      {original && <p>{caseCode(original.number)} · Revisão {original.revision}</p>}
      <div className="form-grid">
        <Field label="Suíte"><select name="suiteId" defaultValue={testCase?.suiteId ?? ""}><option value="">Sem suíte</option>{suites.map(suite => <option key={suite.id} value={suite.id}>{suitePath(suite, suites)}</option>)}</select></Field>
        <Field label="Estado"><select name="state" defaultValue={testCase?.state ?? "READY"}>{Object.entries(caseStateLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></Field>
        <Field label="Tipo"><select name="type" defaultValue={testCase?.type ?? "FUNCTIONAL"}>{Object.entries(caseTypeLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></Field>
        <Field label="Tags (separadas por vírgula)"><input name="tags" maxLength={1500} defaultValue={testCase?.tags?.join(", ")} placeholder="smoke, regressao" /></Field>
      </div>
      <Field label="Título">
        <input
          name="title"
          defaultValue={testCase?.title}
          required
          maxLength={200}
          placeholder="Ex.: Entrar com credenciais válidas"
        />
      </Field>
      <Field label="Descrição">
        <textarea
          name="description"
          defaultValue={testCase?.description}
          rows={2}
          maxLength={4000}
        />
      </Field>
      <div className="form-grid">
        <Field label="Prioridade">
          <Select
            name="priority"
            values={priorities}
            initial={testCase?.priority ?? "MEDIUM"}
          />
        </Field>
        <Field label="Pré-condições">
          <textarea
            name="preconditions"
            defaultValue={testCase?.preconditions}
            rows={2}
            maxLength={4000}
            placeholder="Ex.: Usuário com cadastro ativo"
          />
        </Field>
      </div>
      <Field label="Passos (um por linha)">
        <textarea
          name="steps"
          defaultValue={testCase?.steps?.join("\n")}
          required
          rows={4}
          maxLength={20000}
          placeholder={
            "Abrir a página de login\nPreencher e-mail e senha\nClicar em Entrar"
          }
        />
      </Field>
      <Field label="Resultado esperado">
        <textarea
          name="expectedResult"
          defaultValue={testCase?.expectedResult}
          required
          rows={2}
          maxLength={4000}
          placeholder="O usuário acessa seu dashboard."
        />
      </Field>
      </div>
    </>
  );
}
function BugFields({ bug, runs, creationKey }: { bug?: Partial<Bug>; runs: Run[]; creationKey?: string }) {
  return (
    <>
      {creationKey && <input type="hidden" name="creationKey" value={creationKey} />}
      <Field label="Título">
        <input
          name="title"
          defaultValue={bug?.title}
          required
          maxLength={200}
          placeholder="Descreva o problema em uma frase"
        />
      </Field>
      <Field label="Descrição">
        <textarea
          name="description"
          defaultValue={bug?.description}
          required
          rows={3}
          maxLength={10000}
          placeholder="O que aconteceu e qual era o comportamento esperado?"
        />
      </Field>
      <Field label="Passos de reprodução">
        <textarea
          name="stepsToReproduce"
          defaultValue={bug?.stepsToReproduce}
          rows={3}
          maxLength={5000}
        />
      </Field>
      <div className="form-grid">
        <Field label="Severidade">
          <Select
            name="severity"
            values={priorities}
            initial={bug?.severity ?? "MEDIUM"}
          />
        </Field>
        <Field label="Status">
          <Select
            name="status"
            values={["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]}
            initial={bug?.status}
          />
        </Field>
      </div>
      <Field label="Resultado vinculado">
        <select name="testResultId" defaultValue={bug?.testResultId ?? ""}>
          <option value="">Sem vínculo</option>
          {runs.flatMap((run) =>
            run.results.map((result) => (
              <option value={result.id} key={result.id}>
                {run.name}{run.contextSnapshot?.build ? ` · build ${run.contextSnapshot.build}` : ""}{run.contextSnapshot?.release ? ` · versão ${run.contextSnapshot.release.version}` : ""}{run.contextSnapshot?.environment ? ` · ${run.contextSnapshot.environment.name}` : ""} · {result.caseTitle} ({labels[result.status]})
              </option>
            )),
          )}
        </select>
      </Field>
    </>
  );
}
function ImportPanel({
  projectId,
  onSuccess,
}: {
  projectId: string;
  onSuccess: (message: string) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [imported, setImported] = useState<{
    run: Run;
    duplicate: boolean;
    importedCases: number;
  } | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!file) {
      setError("Selecione um arquivo XML.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("O arquivo deve ter no máximo 5 MB.");
      return;
    }
    const form = new FormData(event.currentTarget);
    form.set("file", file);
    setBusy(true);
    try {
      const result = await request<{
        run: Run;
        duplicate: boolean;
        importedCases: number;
      }>(`projects/${projectId}/imports`, { method: "POST", body: form });
      setImported(result);
      await onSuccess(
        result.duplicate
          ? "Este arquivo já foi importado neste projeto. Nenhum resultado duplicado."
          : "Resultados importados com sucesso.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="import-page-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Importar relatório JUnit</h2>
            <p>
              Relatórios JUnit XML do Playwright, Cypress e outras ferramentas.
            </p>
          </div>
          <Upload size={20} />
        </div>
        <form onSubmit={submit} className="import-form">
          <label className={`upload-zone ${file ? "has-file" : ""}`}>
            <span className="upload-icon">
              <ArrowDownToLine size={27} />
            </span>
            <strong>{file ? file.name : "Selecione seu arquivo XML"}</strong>
            <span>
              {file
                ? `${(file.size / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB · pronto para importar`
                : "Clique para escolher · JUnit XML · até 5 MB"}
            </span>
            <span className="button button-outline button-sm">
              Escolher arquivo
            </span>
            <input
              aria-label="Arquivo JUnit XML"
              name="file"
              type="file"
              accept=".xml,application/xml,text/xml"
              required
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setImported(null);
                setError("");
              }}
            />
          </label>
          <Field label="Nome da importação (opcional)">
            <input
              name="name"
              maxLength={160}
              placeholder="Ex.: Regressão automatizada · release 1.0"
            />
          </Field>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
          <Button type="submit" disabled={!file || busy}>
            <Upload size={17} />
            {busy ? "Importando…" : "Importar resultados"}
          </Button>
          {imported && (
            <div className="import-success" role="status">
              <CircleCheck size={21} />
              <div>
                <strong>
                  {imported.duplicate
                    ? "Importação já existente"
                    : "Importação concluída"}
                </strong>
                <p>{imported.run.name}</p>
                <p>
                  {imported.importedCases ?? imported.run.results?.length ?? 0}{" "}
                  casos · Ciclo encerrado com histórico preservado.
                </p>
              </div>
            </div>
          )}
        </form>
      </section>
      <aside className="import-explainer">
        <span className="eyebrow">COMO FUNCIONA</span>
        <h2>Importação de resultados JUnit</h2>
        {[
          [
            "01",
            "Selecione o relatório",
            "Use o arquivo JUnit XML gerado pela sua ferramenta de testes.",
          ],
          [
            "02",
            "Confira a associação dos casos",
            "Os casos são identificados automaticamente e associados somente a este projeto.",
          ],
          [
            "03",
            "Consulte o histórico",
            "Um ciclo encerrado preserva resultados, duração e mensagens de erro.",
          ],
        ].map(([n, title, text]) => (
          <div className="import-step" key={n}>
            <span>{n}</span>
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </div>
        ))}
        <div className="import-safe">
          <ShieldCheck size={20} />
          <p>
            Somente os resultados são lidos. Arquivos repetidos não duplicam
            ciclos neste projeto.
          </p>
        </div>
      </aside>
    </div>
  );
}
