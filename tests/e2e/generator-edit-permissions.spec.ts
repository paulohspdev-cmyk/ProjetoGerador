import { expect, test } from "@playwright/test";

import { ensureApprovedModem } from "./modem-fixture";

const adminEmail = process.env.E2E_ADMIN_EMAIL || "";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "";

test("cadastro edita dados sem acessar o controle industrial de ativação", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(adminEmail);
  await page.locator('input[aria-label="Senha"]').fill(adminPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login$/);

  await ensureApprovedModem(page, 15572);
  const suffix = String(Date.now()).slice(-9);
  const tag = "CADROLE" + suffix;
  const email = "cadastro-e2e-" + suffix + "@example.invalid";
  const password = "Cadastro-E2E-2026!";

  const userResult = await page.request.post("/api/users", {
    data: { name: "Cadastro E2E", email, password, role: "cadastro" },
  });
  expect(userResult.status()).toBe(201);

  const createResult = await page.request.post("/api/generators", {
    data: {
      tag,
      name: "Cadastro protegido",
      site: "Unidade E2E",
      controller: "ComAp InteliGen 200",
      transport: "reverse_tcp",
      listenPort: 15572,
      modbusUnit: 71,
    },
  });
  expect(createResult.status()).toBe(201);
  const generator: { id: string } = await createResult.json();

  const url = new URL(page.url());
  const origin = url.origin;
  await page.goto(origin + "/p/geradores/" + encodeURIComponent(generator.id));
  await page.getByRole("button", { name: "Editar" }).click();
  const adminDialog = page.getByRole("dialog");
  await expect(adminDialog.locator('input[type="checkbox"]')).toHaveCount(1);
  await page.keyboard.press("Escape");

  const cadastroContext = await browser.newContext();
  try {
    const cadastroPage = await cadastroContext.newPage();
    await cadastroPage.goto(origin + "/login");
    await cadastroPage.getByLabel("E-mail").fill(email);
    await cadastroPage.locator('input[aria-label="Senha"]').fill(password);
    await cadastroPage.getByRole("button", { name: "Entrar" }).click();
    await expect(cadastroPage).not.toHaveURL(/\/login$/);
    await cadastroPage.goto(origin + "/p/geradores/" + encodeURIComponent(generator.id));
    await cadastroPage.getByRole("button", { name: "Editar" }).click();

    const dialog = cadastroPage.getByRole("dialog");
    await expect(dialog.locator('input[type="checkbox"]')).toHaveCount(0);
    await expect(
      dialog.getByText(/Somente administradores podem alterar a ativação/),
    ).toBeVisible();
    await dialog.getByLabel("Nome do gerador").fill("Cadastro E2E atualizado");
    await dialog.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(dialog).not.toBeVisible();

    const saved = await cadastroPage.request.get(origin + "/api/generators/" + generator.id);
    expect(saved.status()).toBe(200);
    const entry: { name: string; enabled: boolean } = await saved.json();
    expect(entry.name).toBe("Cadastro E2E atualizado");
    expect(entry.enabled).toBe(true);
  } finally {
    await cadastroContext.close();
  }
});
