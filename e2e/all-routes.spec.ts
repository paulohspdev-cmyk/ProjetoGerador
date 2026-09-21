import { expect, test, type Page } from "@playwright/test";

import { navGroups } from "../src/data/nav";

const adminEmail = process.env.E2E_ADMIN_EMAIL || "";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(adminEmail);
  await page.locator('input[aria-label="Senha"]').fill(adminPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

test("HTML da aplicação não fica preso em cache entre releases", async ({ page }) => {
  const response = await page.goto("/login", { waitUntil: "domcontentloaded" });
  expect(response).not.toBeNull();
  expect(response!.status()).toBeLessThan(400);
  expect(response!.headers()["content-type"] ?? "").toContain("text/html");
  expect(response!.headers()["cache-control"] ?? "").toContain("no-store");
});


test("asset retido fora do manifesto Nitro continua disponível após troca de release", async ({
  request,
}) => {
  const response = await request.get("/assets/__retained-release-e2e.js");
  expect(response.status()).toBe(200);
  expect(response.headers()["x-rc-retained-asset"]).toBe("1");
  expect(response.headers()["cache-control"] ?? "").toContain("immutable");
  expect(await response.text()).toContain("__RC_RETAINED_E2E__");
});

test("fallback de asset retido rejeita path traversal", async ({ request }) => {
  const response = await request.get("/assets/%2e%2e%2fpackage.json");
  expect(response.status()).toBe(404);
  expect(response.headers()["x-rc-retained-asset"]).toBeUndefined();
});

test("todas as superfícies de navegação renderizam sem rota quebrada", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);

  const slugs = Array.from(
    new Set(navGroups.flatMap((group) => group.items.map((item) => item.slug))),
  );

  const failures: string[] = [];
  for (const slug of slugs) {
    const target = slug ? `/p/${slug}` : "/";
    const response = await page.goto(target, { waitUntil: "domcontentloaded" });
    if (!response || response.status() >= 400) {
      failures.push(`${target}: HTTP ${response?.status() ?? "sem resposta"}`);
      continue;
    }
    if (/\/login$/.test(page.url())) {
      failures.push(`${target}: redirecionou para login`);
      continue;
    }
    const bodyText = (await page.locator("body").innerText()).slice(0, 20_000);
    if (/application error|internal server error|unexpected application error/i.test(bodyText)) {
      failures.push(`${target}: erro de aplicação visível`);
    }
  }

  expect(failures, failures.join("\n")).toEqual([]);
});
