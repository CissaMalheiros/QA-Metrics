import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

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
