"use client";
import { useState } from "react";
import type { FeaturePreview } from "@/importers/gherkin";
import { request } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { caseCode, caseStateLabels, caseTypeLabels, suitePath, type LibraryCase, type Suite } from "@/domain/cases";

type Preview = Omit<FeaturePreview, "scenarios"> & { scenarios: (FeaturePreview["scenarios"][number] & { matchedCase: { number: number; title: string } | null })[] };
const template = "# language: pt\nFuncionalidade: Comportamento do produto\n  Cenário: Validar comportamento\n    Dado que o ambiente está disponível\n    Quando executo a ação\n    Então observo o resultado esperado\n";
export function GherkinSource({ source }: { source: string }) {
  return <pre className="gherkin-source" aria-label="Fonte Gherkin com realce"><code>{source.split("\n").map((line, index) => <span key={index} className={/^\s*@/.test(line) ? "gherkin-tag" : /^\s*(?:Feature|Funcionalidade|Scenario|Cenário|Cenario|Esquema|Scenario Outline|Background|Contexto|Examples|Exemplos|Given|Dado|Dada|Quando|When|Then|Então|Entao|And|E|But|Mas|Rule|Regra)\b/.test(line) ? "gherkin-keyword" : ""}>{line}{"\n"}</span>)}</code></pre>;
}

export function FeatureEditor({ projectId, testCase, suites, onClose, onSaved }: {
  projectId: string; testCase?: LibraryCase; suites: Suite[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [source, setSource] = useState(testCase?.gherkinSource || template);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [choices, setChoices] = useState<{ mode: string; code: string }[]>([]);
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [suiteId, setSuiteId] = useState(testCase ? testCase.suiteId ?? "" : "__keep");
  const [priority, setPriority] = useState<string>(testCase?.priority ?? "");
  const [type, setType] = useState(testCase?.type ?? "");
  const [state, setState] = useState(testCase?.state ?? "");
  function changeSource(value: string) { setSource(value); setPreview(null); setError(""); }
  async function validate() {
    setBusy(true); setError("");
    try {
      const value = await request<Preview>(`projects/${projectId}/features/preview`, { method: "POST", body: JSON.stringify({ source }) });
      setPreview(value);
      setChoices(value.scenarios.map(scenario => ({ mode: scenario.matchedCase ? "existing" : scenario.key ? "new" : "", code: String(scenario.matchedCase?.number ?? "") })));
      setScenarioIndex(Math.max(0, value.scenarios.findIndex(scenario => scenario.key === testCase?.gherkinKey)));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível validar a fonte."); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!preview) return;
    setBusy(true); setError("");
    try {
      const assignments = testCase
        ? [{ index: scenarioIndex, targetNumber: testCase.number }]
        : choices.map((choice, index) => ({ index, targetNumber: choice.mode === "existing" ? Number(choice.code) : null }));
      await request(`projects/${projectId}/features`, { method: "POST", body: JSON.stringify({ source, assignments,
        ...(suiteId !== "__keep" ? { suiteId } : {}), ...(priority ? { priority } : {}), ...(type ? { type } : {}), ...(state ? { state } : {}),
      }) });
      await onSaved(); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar os cenários."); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }} title={testCase ? `Editar BDD · ${caseCode(testCase.number)}` : "Criar ou importar cenários BDD"} description="Gherkin descreve o comportamento. Esta ferramenta valida e armazena a especificação; não executa passos nem código." wide>
    {error && <p className="alert alert-error" role="alert">{error}</p>}
    <fieldset disabled={busy} className="feature-fields">
      <Field label="Arquivo .feature (UTF-8, até 100 KiB)"><input type="file" accept=".feature,text/plain" onChange={event => {
        const file = event.target.files?.[0]; if (!file) return;
        setPreview(null);
        if (!file.name.toLowerCase().endsWith(".feature") || file.size > 102400) { setError("Selecione um arquivo .feature de até 100 KiB."); return; }
        setBusy(true);
        void file.arrayBuffer().then(bytes => changeSource(new TextDecoder("utf-8", { fatal: true }).decode(bytes))).catch(() => setError("O arquivo precisa estar em UTF-8 válido.")).finally(() => setBusy(false));
      }} /></Field>
      <Field label="Fonte Gherkin"><textarea className="feature-input" rows={12} maxLength={102400} value={source} onChange={event => changeSource(event.target.value)} spellCheck={false} /></Field>
      <details><summary>Fonte com realce de palavras-chave</summary><GherkinSource source={source} /></details>
      {testCase?.gherkinOriginalSource && testCase.gherkinOriginalSource !== testCase.gherkinSource && <details><summary>Fonte original recebida nesta revisão</summary><GherkinSource source={testCase.gherkinOriginalSource} /></details>}
      <div className="form-grid">
        <Field label="Suíte"><select value={suiteId} onChange={event => setSuiteId(event.target.value)}><option value="__keep">Manter atual; novos sem suíte</option><option value="">Sem suíte</option>{suites.map(suite => <option key={suite.id} value={suite.id}>{suitePath(suite, suites)}</option>)}</select></Field>
        <Field label="Prioridade"><select value={priority} onChange={event => setPriority(event.target.value)}><option value="">Manter atual; novos média</option>{Object.entries({ LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta", CRITICAL: "Crítica" }).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></Field>
        <Field label="Tipo"><select value={type} onChange={event => setType(event.target.value)}><option value="">Manter atual; novos funcional</option>{Object.entries(caseTypeLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></Field>
        <Field label="Estado"><select value={state} onChange={event => setState(event.target.value)}><option value="">Manter atual; novos prontos</option>{Object.entries(caseStateLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></Field>
      </div>
      <Button variant="outline" type="button" onClick={() => void validate()}>Validar e pré-visualizar</Button>
      {preview && <section aria-label="Prévia dos cenários" className="feature-preview"><h3>{preview.name} · {preview.language}</h3>
        <p>{preview.scenarios.length} cenários. Tags @requirement:CHAVE e @automation:CHAVE registram referências opcionais; não comprovam execução ou cobertura.</p>
        {testCase && <Field label="Cenário para atualizar neste caso"><select aria-label="Cenário para atualizar neste caso" value={scenarioIndex} onChange={event => setScenarioIndex(Number(event.target.value))}>{preview.scenarios.map((scenario, index) => <option key={index} value={index}>{scenario.name}</option>)}</select></Field>}
        {preview.scenarios.map((scenario, index) => <details key={index} open={preview.scenarios.length === 1}>
          <summary>{scenario.name} · {scenario.key ?? "Sem chave estável"}</summary>
          <p>{scenario.tags.join(" ")}</p><p>{scenario.description}</p>
          {!!scenario.background.length && <><h4>Contexto</h4><ol>{scenario.background.map((step, i) => <li key={i}>{step}</li>)}</ol></>}
          <ol>{scenario.steps.map((step, i) => <li key={i}><pre className="gherkin-step">{step}</pre></li>)}</ol>
          {scenario.examples.map((rows, i) => <div key={i} className="table-scroll"><table><thead><tr>{rows[0].map((cell, n) => <th key={n}>{cell}</th>)}</tr></thead><tbody>{rows.slice(1).map((row, n) => <tr key={n}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>)}</tbody></table></div>)}
          {!testCase && <div>
            {!scenario.key && <p>Escolha explicitamente um destino. Novos cenários receberão uma tag @qa estável na exportação; a fonte original ficará na revisão.</p>}
            <Field label={`Destino de ${scenario.name}`}> <select aria-label={`Destino de ${scenario.name}`} value={choices[index]?.mode ?? ""} onChange={event => setChoices(current => current.map((choice, n) => n === index ? { ...choice, mode: event.target.value } : choice))}><option value="">Escolher destino</option><option value="new">Criar novo caso</option><option value="existing">Atualizar caso existente</option></select></Field>
            {choices[index]?.mode === "existing" && <Field label={`Número do caso de destino para ${scenario.name}`}> <input type="number" min={1} max={2147483647} value={choices[index].code} onChange={event => setChoices(current => current.map((choice, n) => n === index ? { ...choice, code: event.target.value } : choice))} /></Field>}
            {scenario.matchedCase && <p>Correspondência: {caseCode(scenario.matchedCase.number)} · {scenario.matchedCase.title}. A atualização preserva revisões e resultados antigos.</p>}
          </div>}
        </details>)}
      </section>}
    </fieldset>
    {busy && <p role="status">Processando especificação…</p>}
    <div className="form-footer"><Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button disabled={busy || !preview || !testCase && choices.some(choice => !choice.mode || choice.mode === "existing" && !choice.code)} onClick={() => void save()}>{testCase ? "Salvar cenário neste caso" : "Salvar cenários"}</Button></div>
  </Dialog>;
}
