import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL || "";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "";
const viewerEmail = process.env.E2E_VIEWER_EMAIL || "";
const viewerPassword = process.env.E2E_VIEWER_PASSWORD || "";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.locator('input[aria-label="Senha"]').fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("autenticação e RBAC funcionam no navegador", async ({ browser }) => {
  const admin = await browser.newContext();
  const adminPage = await admin.newPage();
  await login(adminPage, adminEmail, adminPassword);
  await expect(adminPage).not.toHaveURL(/\/login$/);
  await expect(adminPage.getByText("Gestor do sistema")).toBeVisible();
  await expect(adminPage.getByText("Usuários", { exact: true })).toBeVisible();

  const viewer = await browser.newContext();
  const viewerPage = await viewer.newPage();
  await login(viewerPage, viewerEmail, viewerPassword);
  await expect(viewerPage).not.toHaveURL(/\/login$/);
  await expect(viewerPage.getByText("Visualização")).toBeVisible();
  await expect(viewerPage.getByText("Usuários", { exact: true })).toHaveCount(0);

  const usersResponse = await viewerPage.request.get("/api/users");
  expect(usersResponse.status()).toBe(403);

  await admin.close();
  await viewer.close();
});

test("rota de recuperação é renderizada", async ({ page }) => {
  await page.goto("/reset-password?token=e2e-invalid-token");
  await expect(page.getByRole("heading", { name: "Redefinir senha" })).toBeVisible();
  await expect(page.getByLabel("Nova senha")).toBeVisible();
  await expect(page.getByLabel("Confirmar nova senha")).toBeVisible();
});
