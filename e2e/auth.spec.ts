import { createHmac } from "node:crypto";

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

function decodeBase32(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];

  for (const char of value.replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error(`Base32 inválido: ${char}`);
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function totpCode(secret: string, now = Date.now()) {
  const counter = BigInt(Math.floor(now / 1000 / 30));
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

test("autenticação e RBAC funcionam no navegador", async ({ browser }) => {
  const admin = await browser.newContext();
  const adminPage = await admin.newPage();
  await login(adminPage, adminEmail, adminPassword);
  await expect(adminPage).not.toHaveURL(/\/login$/);
  const adminMe = await adminPage.evaluate(async () => {
    const response = await fetch("/api/auth/me", { credentials: "include" });
    return { status: response.status, body: await response.json() };
  });
  expect(adminMe.status).toBe(200);
  expect(adminMe.body.role).toBe("administrador");
  const adminUsersStatus = await adminPage.evaluate(async () => {
    const response = await fetch("/api/users", { credentials: "include" });
    return response.status;
  });
  expect(adminUsersStatus).toBe(200);

  const viewer = await browser.newContext();
  const viewerPage = await viewer.newPage();
  await login(viewerPage, viewerEmail, viewerPassword);
  await expect(viewerPage).not.toHaveURL(/\/login$/);
  const viewerMe = await viewerPage.evaluate(async () => {
    const response = await fetch("/api/auth/me", { credentials: "include" });
    return { status: response.status, body: await response.json() };
  });
  expect(viewerMe.status).toBe(200);
  expect(viewerMe.body.role).toBe("visualizacao");
  const usersStatus = await viewerPage.evaluate(async () => {
    const response = await fetch("/api/users", { credentials: "include" });
    return response.status;
  });
  expect(usersStatus).toBe(403);

  await admin.close();
  await viewer.close();
});

test("gestor consegue ativar e desativar 2FA pela tela Usuários", async ({ browser }) => {
  const owner = await browser.newContext();
  const ownerPage = await owner.newPage();
  const temp = await browser.newContext();
  const tempPage = await temp.newPage();
  const tempEmail = `twofa-e2e-${Date.now()}@example.invalid`;
  const tempPassword = "E2E-Totp-Temp-7391!";
  let tempUserId = "";

  try {
    await login(ownerPage, adminEmail, adminPassword);
    await expect(ownerPage).not.toHaveURL(/\/login$/);

    const created = await ownerPage.evaluate(
      async ({ email, password }) => {
        const response = await fetch("/api/users", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Gestor 2FA E2E",
            email,
            password,
            role: "administrador",
          }),
        });
        const body = await response.json();
        return { status: response.status, body };
      },
      { email: tempEmail, password: tempPassword },
    );
    expect(created.status).toBe(201);
    tempUserId = String(created.body.id || "");
    expect(tempUserId).not.toBe("");

    await login(tempPage, tempEmail, tempPassword);
    await expect(tempPage).not.toHaveURL(/\/login$/);
    await tempPage.goto("/p/usuarios");

    await expect(tempPage.getByText("2FA obrigatório pendente")).toBeVisible();
    await tempPage.getByRole("button", { name: "Configurar 2FA" }).click();

    const secret = (await tempPage.getByTestId("twofa-secret").textContent())?.trim() || "";
    expect(secret.length).toBeGreaterThan(10);

    await tempPage.getByLabel("Código 2FA para ativação").fill(totpCode(secret));
    await tempPage.getByRole("button", { name: "Ativar 2FA" }).click();
    await expect(tempPage.getByText("2FA ativo", { exact: true })).toBeVisible();

    const usersAfterEnable = await tempPage.evaluate(async () => {
      const response = await fetch("/api/users", { credentials: "include" });
      return response.status;
    });
    expect(usersAfterEnable).toBe(200);

    await tempPage.getByText("Desativar ou trocar 2FA").click();
    await tempPage.getByLabel("Senha atual para desativar 2FA").fill(tempPassword);
    await tempPage.getByLabel("Código 2FA para desativação").fill(totpCode(secret));
    await tempPage.getByRole("button", { name: "Desativar 2FA" }).click();
    await expect(tempPage.getByText("2FA obrigatório pendente")).toBeVisible();
  } finally {
    if (tempUserId) {
      await ownerPage.evaluate(async (userId) => {
        await fetch(`/api/users/${encodeURIComponent(userId)}`, {
          method: "DELETE",
          credentials: "include",
        });
      }, tempUserId);
    }
    await temp.close();
    await owner.close();
  }
});

test("rota de recuperação é renderizada", async ({ page }) => {
  await page.goto("/reset-password?token=e2e-invalid-token");
  await expect(page.getByRole("heading", { name: "Redefinir senha" })).toBeVisible();
  await expect(page.getByLabel("Nova senha", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Confirmar nova senha", { exact: true })).toBeVisible();
});
