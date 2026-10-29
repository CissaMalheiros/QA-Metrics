import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

test("reutiliza plano em duas builds e preserva revisão, contexto, estados e métricas", async ({ page }) => {
  const identifier = randomUUID().slice(0, 8);
  await page.goto("/cadastro");
  await page.getByLabel("Nome", { exact: true }).fill("QA Planejamento");
  await page.getByLabel("E-mail", { exact: true }).fill(`planning-${identifier}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(`Qa-${randomUUID()}`);
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  const projectName = `Planejamento ${identifier}`;
  await createProject(page, projectName, "Cliente planejamento");
  await page.getByText(projectName, { exact: true }).last().click();
  await expect(page).toHaveURL(/project=/);
  const projectId = new URL(page.url()).searchParams.get("project")!;
  async function api(resource: string, data: unknown, method = "POST") {
    const response = await page.request.fetch(`/api/data/projects/${projectId}/${resource}`, { method, headers: { Origin: "http://localhost:3100" }, data });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  }
  const first = (await api("cases", { title: "Validar compra planejada", steps: ["Comprar no checkout"], expectedResult: "Pedido confirmado", tags: ["smoke"] })).testCase;
  await api("cases", { title: "Validar cupom planejado", steps: ["Aplicar cupom"], expectedResult: "Desconto aplicado", tags: ["smoke"] });
  const env = (await api("environments", { name: "QA Checkout", baseUrl: "https://qa.example.test" })).environment;
  const release = (await api("releases", { name: "Checkout", version: "4.0.0" })).release;
  await page.reload();
  await page.getByRole("button", { name: "Planos de teste", exact: true }).click();
  await page.getByRole("button", { name: "Novo plano", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome do plano", { exact: true }).fill("Smoke checkout");
  await dialog.getByLabel("Objetivo do plano", { exact: true }).fill("Validar a compra antes de liberar");
  await dialog.getByRole("button", { name: "Adicionar template Smoke", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Casos selecionados (2)", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Subir Validar cupom planejado", exact: true }).click();
  await dialog.getByLabel("Categoria de Validar cupom planejado", { exact: true }).fill("Cupons");
  await dialog.getByRole("button", { name: "Salvar plano", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await api(`cases/${first.id}`, { title: "Compra alterada depois do plano", steps: ["Passo novo"] }, "PATCH");
  await page.getByRole("button", { name: "Clonar Smoke checkout", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Smoke checkout (cópia)", exact: true })).toBeVisible();
  for (const [build, draft] of [["400", true], ["401", false]] as const) {
    await page.getByRole("button", { name: "Executar Smoke checkout", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome do ciclo", { exact: true }).fill(`Smoke build ${build}`);
    await expect(dialog.getByLabel("Ambiente", { exact: true })).toBeEnabled();
    await dialog.getByLabel("Ambiente", { exact: true }).selectOption(env.id);
    await dialog.getByLabel("Release / versão", { exact: true }).selectOption(release.id);
    await dialog.getByLabel("Build", { exact: true }).fill(build);
    await dialog.getByLabel("Responsável", { exact: true }).selectOption({ label: "QA Planejamento" });
    await dialog.getByLabel("Critérios de entrada", { exact: true }).fill("Build disponível");
    await dialog.getByLabel("Critérios de saída", { exact: true }).fill("Smoke aprovado");
    if (draft) await dialog.getByLabel("Salvar como rascunho", { exact: true }).check();
    await dialog.getByRole("button", { name: "Criar execução", exact: true }).click();
    await expect(dialog).not.toBeVisible();
  }
  await page.getByRole("button", { name: "Ciclos", exact: true }).click();
  await page.getByRole("button", { name: /Smoke build 400/ }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Resultado de Validar compra planejada", { exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Iniciar ciclo", exact: true }).click();
  await expect(dialog.getByLabel("Resultado de Validar compra planejada", { exact: true })).toBeEnabled();
  await dialog.getByLabel("Resultado de Validar compra planejada", { exact: true }).selectOption("FAILED");
  await dialog.locator("article").filter({ has: page.getByRole("heading", { name: "Validar compra planejada", exact: true }) }).getByRole("button", { name: "Salvar resultado", exact: true }).click();
  await dialog.getByRole("button", { name: "Encerrar ciclo", exact: true }).click();
  await expect(dialog.getByLabel("Resultado de Validar compra planejada", { exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: /Smoke build 401/ }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Versão 4.0.0 · Build 401 · Ambiente QA Checkout");
  const articles = dialog.locator("article");
  await expect(articles.first()).toContainText("Validar cupom planejado");
  await expect(articles.first()).toContainText("Categoria: Cupons");
  await expect(dialog.getByLabel("Resultado de Validar compra planejada", { exact: true })).toHaveValue("NOT_RUN");
  await dialog.getByLabel("Resultado de Validar compra planejada", { exact: true }).selectOption("PASSED");
  await articles.filter({ has: page.getByRole("heading", { name: "Validar compra planejada", exact: true }) }).getByRole("button", { name: "Salvar resultado", exact: true }).click();
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
  await api(`environments/${env.id}`, { name: "QA renomeado", archived: true }, "PATCH");
  await api(`releases/${release.id}`, { version: "4.1.0", archived: true }, "PATCH");
  await page.getByRole("navigation", { name: "Seções do projeto", exact: true }).getByRole("button", { name: "Visão geral", exact: true }).click();
  await page.getByLabel("Filtrar métricas por ciclo", { exact: true }).selectOption({ label: "Smoke build 400 · build 400" });
  await expect(page.getByRole("region", { name: "Contexto dos indicadores", exact: true })).toContainText("Versão 4.0.0 · Build 400 · Ambiente QA Checkout");
  const response = await page.request.get(`/api/data/projects/${projectId}/runs`);
  const runs = (await response.json()).runs;
  expect(runs.find((run: { name: string }) => run.name === "Smoke build 400").results.find((result: { testCaseId: string }) => result.testCaseId === first.id).status).toBe("FAILED");
  expect(runs.find((run: { name: string }) => run.name === "Smoke build 401").results.find((result: { testCaseId: string }) => result.testCaseId === first.id).status).toBe("PASSED");
  await page.screenshot({ path: ".local/planning-desktop.png", fullPage: true });
});

async function createProject(page: Page, name: string, client: string) {
  await expect(page.getByRole("heading", { name: /Seus projetos/ })).toBeVisible();
  await page
    .getByRole("button", { name: "Novo projeto", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome do projeto", { exact: true }).fill(name);
  await dialog.getByLabel("Cliente", { exact: true }).fill(client);
  await dialog
    .getByLabel("Descrição", { exact: true })
    .fill("Projeto criado pela jornada E2E.");
  await dialog.getByLabel("Ambiente", { exact: true }).fill("Homologação");
  await dialog
    .getByRole("button", { name: "Criar projeto", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
}

test("cadastro, login, dois projetos, caso, execução, bug e importação JUnit", async ({
  page,
}) => {
  const identifier = randomUUID().slice(0, 8);
  const email = `e2e-${identifier}@example.test`;
  const password = `E2e-${randomUUID()}`;
  const firstProject = `Loja E2E ${identifier}`;
  const secondProject = `Portal E2E ${identifier}`;
  const caseTitle = `Validar compra ${identifier}`;

  await page.goto("/cadastro");
  await page.getByLabel("Nome", { exact: true }).fill("QA de E2E");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await createProject(page, firstProject, "Cliente A E2E");
  await createProject(page, secondProject, "Cliente B E2E");
  await page.getByText(firstProject, { exact: true }).last().click();
  await expect(page).toHaveURL(/project=/);
  const firstProjectUrl = page.url();
  await page
    .getByRole("button", { name: "Casos de teste", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Novo caso", exact: true })
    .first()
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Título", { exact: true }).fill(caseTitle);
  await dialog
    .getByLabel("Descrição", { exact: true })
    .fill("Confirmar a jornada de compra.");
  await dialog
    .getByLabel("Pré-condições", { exact: true })
    .fill("Usuário autenticado e produto disponível.");
  await dialog
    .getByLabel("Passos (um por linha)", { exact: true })
    .fill("Adicionar produto ao carrinho\nConfirmar pedido");
  await dialog
    .getByLabel("Resultado esperado", { exact: true })
    .fill("Pedido concluído com sucesso.");
  await dialog.getByLabel("Prioridade", { exact: false }).selectOption("HIGH");
  await dialog.getByRole("button", { name: "Criar caso", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: `TC-001 ${caseTitle}`, exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Gerenciar suítes", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome da suíte", { exact: true }).fill("Checkout");
  await dialog.getByRole("button", { name: "Salvar suíte", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Suíte para editar", exact: true }).locator("option")).toHaveCount(2);
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: `Editar ${caseTitle}`, exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Suíte", { exact: true }).selectOption({ label: "Checkout" });
  await dialog.getByLabel("Tags (separadas por vírgula)", { exact: true }).fill("smoke, regressao");
  await dialog.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByText("Mais filtros", { exact: true }).click();
  await page.getByLabel("Tag", { exact: true }).fill("nao-existe");
  await expect(page.getByText(/Nenhum caso corresponde aos filtros/)).toBeVisible();
  await page.getByLabel("Tag", { exact: true }).fill("smoke");
  await expect(page.getByRole("button", { name: `TC-001 ${caseTitle}`, exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Revisões de ${caseTitle}`, exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Revisão 2/)).toBeVisible();
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();

  await page.getByRole("button", { name: "Ciclos", exact: true }).click();
  await page
    .getByRole("button", { name: "Novo ciclo", exact: true })
    .first()
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Nome do ciclo", { exact: true })
    .fill(`Regressão ${identifier}`);
  await dialog.getByRole("checkbox", { name: caseTitle }).check();
  await dialog
    .getByRole("button", { name: "Criar ciclo", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.getByText(`Regressão ${identifier}`, { exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel(`Resultado de ${caseTitle}`, { exact: true })
    .selectOption("FAILED");
  await dialog
    .getByLabel(`Observações de ${caseTitle}`, { exact: true })
    .fill("A confirmação do pedido não foi exibida.");
  await dialog
    .getByRole("button", { name: "Salvar resultado", exact: true })
    .click();
  await expect(dialog.getByLabel(`Resultado de ${caseTitle}`, { exact: true })).toHaveValue("FAILED");
  await dialog.getByLabel(`Resultado de ${caseTitle}`, { exact: true }).selectOption("PASSED");
  await dialog
    .getByRole("button", { name: "Encerrar ciclo", exact: true })
    .click();
  // O encerramento remove os controles de edição e preserva o resultado.
  await expect(
    dialog.getByText("Histórico preservado", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByLabel(`Resultado de ${caseTitle}`, { exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByLabel(`Resultado de ${caseTitle}`, { exact: true }),
  ).toHaveValue("FAILED");
  await expect(
    dialog.getByRole("button", { name: "Salvar resultado", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Bugs", exact: true }).click();
  await page
    .getByRole("button", { name: "Novo bug", exact: true })
    .first()
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Título", { exact: true })
    .fill(`Confirmação ausente ${identifier}`);
  await dialog
    .getByLabel("Descrição", { exact: true })
    .fill("Após a compra, não há confirmação visual.");
  await dialog
    .getByLabel("Passos de reprodução", { exact: true })
    .fill("Adicionar produto e confirmar pedido.");
  await dialog.getByLabel("Severidade", { exact: false }).selectOption("HIGH");
  const resultSelect = dialog.getByLabel("Resultado vinculado", {
    exact: false,
  });
  const resultValue = await resultSelect
    .locator("option")
    .filter({ hasText: caseTitle })
    .first()
    .getAttribute("value");
  expect(resultValue).toBeTruthy();
  await resultSelect.selectOption(resultValue!);
  await dialog.getByRole("button", { name: "Criar bug", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText(`Confirmação ausente ${identifier}`, { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Importar XML", exact: true }).click();
  await page
    .getByLabel("Arquivo JUnit XML", { exact: true })
    .setInputFiles(path.resolve("tests/fixtures/playwright.xml"));
  await page
    .getByLabel("Nome da importação", { exact: false })
    .fill(`Playwright ${identifier}`);
  await page
    .getByRole("button", { name: "Importar resultados", exact: true })
    .click();
  await expect(
    page.getByText("Importação concluída", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Importar resultados", exact: true }).click();
  await expect(page.getByText("Importação já existente", { exact: true })).toBeVisible();
  await page.getByLabel("Arquivo JUnit XML", { exact: true }).setInputFiles(path.resolve("tests/fixtures/cypress.xml"));
  await page.getByLabel("Nome da importação", { exact: false }).fill(`Cypress ${identifier}`);
  await page.getByRole("button", { name: "Importar resultados", exact: true }).click();
  await expect(page.getByText("Importação concluída", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Casos de teste", exact: true }).click();
  await page.getByRole("button", { name: `Excluir ${caseTitle}`, exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Confirmar exclusão", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("preservar o histórico");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();

  // O segundo projeto não deve receber os casos criados ou importados no primeiro.
  await page.getByText(secondProject, { exact: true }).first().click();
  await page
    .getByRole("button", { name: "Casos de teste", exact: true })
    .click();
  await expect(page.getByRole("button", { name: `TC-001 ${caseTitle}`, exact: true })).toHaveCount(0);
  await page.goto(firstProjectUrl);
  await page.getByRole("button", { name: "Ciclos", exact: true }).click();
  await expect(
    page.getByText(`Regressão ${identifier}`, { exact: true }),
  ).toBeVisible();
  await page.goto(firstProjectUrl);
  await expect(page.getByRole("heading", { name: firstProject })).toBeVisible();
  await mkdir(".local", { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: ".local/qa-review-desktop.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Abrir menu", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary")).not.toBeInViewport();
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await expect(page.getByRole("complementary")).toBeInViewport();
  await page.getByRole("button", { name: "Fechar menu", exact: true }).click({ position: { x: 380, y: 20 } });
  await expect(page.getByRole("complementary")).not.toBeInViewport();
  await expect.poll(async () => { const box = await page.getByRole("complementary").boundingBox(); return box ? box.x + box.width : 0; }).toBeLessThanOrEqual(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: ".local/qa-review-mobile.png", fullPage: true, animations: "disabled" });
});

test("página privada e API exigem sessão real", async ({ page, request }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  const response = await request.get("/api/data/projects");
  expect(response.status()).toBe(401);
});

test("importa, valida, executa manualmente, edita e exporta um cenário BDD em português", async ({ page }) => {
  const id = randomUUID().slice(0, 8);
  const title = "Entrar com credenciais válidas";
  await page.goto("/cadastro");
  await page.getByLabel("Nome", { exact: true }).fill("QA BDD E2E");
  await page.getByLabel("E-mail", { exact: true }).fill(`bdd-e2e-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(`BDD-${randomUUID()}`);
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await createProject(page, `BDD ${id}`, "Cliente BDD");
  await page.getByRole("button", { name: `BDD ${id}`, exact: true }).click();
  await page.getByRole("button", { name: "Casos de teste", exact: true }).click();
  await page.getByRole("button", { name: "BDD / .feature", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Fonte Gherkin", { exact: true }).fill("isto não é uma especificação");
  await dialog.getByRole("button", { name: "Validar e pré-visualizar", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Salvar cenários", exact: true })).toBeDisabled();
  await dialog.getByLabel("Arquivo .feature (UTF-8, até 100 KiB)", { exact: true }).setInputFiles(path.resolve("tests/fixtures/login.feature"));
  await expect(dialog.getByLabel("Fonte Gherkin", { exact: true })).toHaveValue(/Funcionalidade:/);
  await dialog.getByRole("button", { name: "Validar e pré-visualizar", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Prévia dos cenários", exact: true })).toContainText("REQ-LOGIN");
  await dialog.getByRole("button", { name: "Salvar cenários", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: `TC-001 ${title}`, exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Exportar .feature", exact: true }).click();
  const download = await downloadPromise;
  const exported = await readFile((await download.path())!, "utf8");
  expect(exported).toContain("# language: pt");
  expect(exported).toContain("@id:login-principal");
  await page.getByRole("button", { name: "Ciclos", exact: true }).click();
  await page.getByRole("button", { name: "Novo ciclo", exact: true }).first().click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome do ciclo", { exact: true }).fill("Ciclo BDD manual");
  await dialog.getByRole("checkbox", { name: title }).check();
  await dialog.getByRole("button", { name: "Criar ciclo", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByText("Ciclo BDD manual", { exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByText("Fonte Gherkin da execução", { exact: true }).click();
  await expect(dialog.getByLabel("Fonte Gherkin com realce", { exact: true })).toContainText("Então vejo o painel do produto");
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: "Casos de teste", exact: true }).click();
  await page.getByRole("button", { name: `Editar ${title}`, exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Fonte Gherkin", { exact: true }).fill(exported.replace(title, "Login revisado em português"));
  await dialog.getByRole("button", { name: "Validar e pré-visualizar", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Prévia dos cenários", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Salvar cenário neste caso", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "TC-001 Login revisado em português", exact: true })).toBeVisible();
  await mkdir(".local", { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: ".local/library-bdd-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("complementary")).not.toBeInViewport();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: ".local/library-bdd-mobile.png", fullPage: true });
});

test("mapeia CSV, bloqueia linhas inválidas, exporta filtros e atualiza sem duplicar", async ({ page }) => {
  const id = randomUUID().slice(0, 8);
  await page.goto("/cadastro");
  await page.getByLabel("Nome", { exact: true }).fill("QA CSV E2E");
  await page.getByLabel("E-mail", { exact: true }).fill(`csv-e2e-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(`CSV-${randomUUID()}`);
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await createProject(page, `CSV ${id}`, "Cliente CSV");
  await page.getByRole("button", { name: `CSV ${id}`, exact: true }).click();
  await page.getByRole("button", { name: "Casos de teste", exact: true }).click();
  await page.getByRole("button", { name: "Importar CSV", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Arquivo CSV (UTF-8, até 256 KiB)", { exact: true }).setInputFiles(path.resolve("tests/fixtures/cases.csv"));
  await expect(dialog.getByLabel("Coluna: Título", { exact: true })).toHaveValue("Nome");
  await dialog.getByRole("button", { name: "Gerar prévia CSV", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Prévia CSV", exact: true })).toContainText("2 com erro");
  await expect(dialog.getByRole("button", { name: "Importar 2 casos", exact: true })).toBeDisabled();
  await dialog.getByLabel("Coluna: Identificação externa", { exact: true }).selectOption("Identificador");
  await dialog.getByLabel("Coluna: Resultado esperado", { exact: true }).selectOption("Esperado");
  await dialog.getByRole("button", { name: "Gerar prévia CSV", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Prévia CSV", exact: true })).toContainText("0 com erro");
  await dialog.getByRole("button", { name: "Importar 2 casos", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "TC-001 Validar compra", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "TC-002 Validar cupom", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Buscar registros", exact: true }).fill("TC-001");
  await expect(page.getByText("1 caso encontrado", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV dos filtros", exact: true }).click();
  const output = await readFile((await (await downloadPromise).path())!, "utf8");
  expect(output).toContain("Validar compra");
  expect(output).not.toContain("Validar cupom");
  await page.getByRole("button", { name: "Importar CSV", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Arquivo CSV (UTF-8, até 256 KiB)", { exact: true }).setInputFiles({ name: "atualizacao.csv", mimeType: "text/csv", buffer: Buffer.from(output.replace("Validar compra", "Validar compra CSV atualizada"), "utf8") });
  await dialog.getByLabel("Modo de importação", { exact: true }).selectOption("UPSERT");
  await dialog.getByRole("button", { name: "Gerar prévia CSV", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Prévia CSV", exact: true })).toContainText("Atualizar");
  await dialog.getByRole("button", { name: "Importar 1 caso", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "TC-001 Validar compra CSV atualizada", exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Selecionar TC-001", exact: true }).check();
  await page.getByRole("button", { name: "Editar em lote", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Campo", { exact: true }).selectOption("priority");
  await dialog.getByLabel("Novo valor", { exact: true }).selectOption("CRITICAL");
  await dialog.getByRole("button", { name: "Aplicar em 1 caso", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Validar compra CSV atualizada" })).toContainText("Crítica");
  await page.route("**/api/data/overview", route => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Leitura indisponível depois de salvar" }) }));
  await page.getByRole("button", { name: "Duplicar Validar compra CSV atualizada", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("A alteração foi salva");
  await page.unroute("**/api/data/overview");
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(page.getByRole("button", { name: "TC-003 Validar compra CSV atualizada (cópia)", exact: true })).toBeVisible();
  await expect(page.getByText("3 casos encontrados", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ambientes e versões", exact: true }).click();
  await page.getByRole("button", { name: "Novo ambiente", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome", { exact: true }).fill("QA");
  await dialog.getByLabel("URL do ambiente", { exact: true }).fill("https://qa.example.test");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Editar ambiente QA", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Nova versão", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome", { exact: true }).fill("Checkout");
  await dialog.getByLabel("Versão", { exact: true }).fill("2.0.0");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Editar versão Checkout", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Arquivado", { exact: true }).check();
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("region", { name: "Ambientes e versões", exact: true })).toContainText("2.0.0 · Arquivada");
});
