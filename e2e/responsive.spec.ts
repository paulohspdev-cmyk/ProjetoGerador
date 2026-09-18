import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL || "";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(adminEmail);
  await page.locator('input[aria-label="Senha"]').fill(adminPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"));
}

async function contextAt(
  browser: Browser,
  width: number,
  height: number,
  hasTouch = false,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch,
    isMobile: width <= 430,
  });
  const page = await context.newPage();
  await login(page);
  return { context, page };
}

async function expectNoGlobalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test("rotas críticas não estouram a viewport", async ({ browser }) => {
  test.setTimeout(180_000);
  const viewports = [
    { width: 360, height: 800, touch: true },
    { width: 390, height: 844, touch: true },
    { width: 430, height: 932, touch: true },
    { width: 768, height: 1024, touch: true },
    { width: 1024, height: 768, touch: true },
    { width: 1366, height: 768, touch: false },
    { width: 1920, height: 1080, touch: false },
    { width: 3840, height: 2160, touch: false },
  ];
  const routes = [
    "/",
    "/p/geradores",
    "/p/central-de-operacao",
    "/p/alarmes",
    "/p/mapa",
    "/p/controladoras",
    "/p/usuarios",
    "/p/configuracoes",
  ];

  for (const viewport of viewports) {
    const { context, page } = await contextAt(
      browser,
      viewport.width,
      viewport.height,
      viewport.touch,
    );
    for (const route of routes) {
      await page.goto(route);
      await expectNoGlobalOverflow(page);
    }
    await context.close();
  }
});

test("touchscreen recebe alvos mínimos de 44px", async ({ browser }) => {
  test.setTimeout(180_000);
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
  ]) {
    const { context, page } = await contextAt(browser, viewport.width, viewport.height, true);
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

    await page.goto("/p/geradores");
    const menu = page.getByRole("button", { name: "Abrir menu" });
    await expect(menu).toBeVisible();
    expect((await menu.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

    const theme = page.getByRole("button", { name: /Ativar tema/ }).first();
    expect((await theme.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

    const previous = page.getByRole("button", { name: "Anterior" });
    expect((await previous.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

    const search = page.getByLabel("Buscar gerador");
    expect((await search.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

    await context.close();
  }
});

test("tablet usa cards na lista de geradores e TV aumenta texto compacto", async ({ browser }) => {
  test.setTimeout(180_000);
  const { context: tablet, page } = await contextAt(browser, 1024, 768, true);

  const created = await page.evaluate(async () => {
    const response = await fetch("/api/generators", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tag: "RESP001",
        name: "Gerador Responsivo",
        customer: "Cliente Responsivo",
        site: "Unidade Responsiva",
        controller: "ComAp InteliGen 200",
        transport: "reverse_tcp",
        listenPort: 15001,
        modbusUnit: 2,
        rapidDeviceNum: 299,
      }),
    });
    return response.status;
  });
  expect([201, 409]).toContain(created);

  await page.goto("/p/geradores");
  await page.getByRole("button", { name: /Principal/ }).click();
  await page.getByRole("menuitemradio", { name: "Lista" }).click();
  await page.getByRole("button", { name: /Online/ }).click();
  await page.getByRole("menuitemradio", { name: "Todos" }).click();

  await expect(page.locator("article").filter({ hasText: "RESP001" })).toBeVisible();
  await expect(page.locator('table[class*="min-w-[2080px]"]')).toBeHidden();
  await tablet.close();

  const { context: tv, page: tvPage } = await contextAt(browser, 3840, 2160, false);
  await tvPage.goto("/p/controladoras");
  const compactFontSizes = await tvPage.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => /text-\[(8|9|10|11|12)px\]/.test(element.className))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none";
      })
      .map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
  );
  expect(compactFontSizes.length).toBeGreaterThan(0);
  expect(Math.min(...compactFontSizes)).toBeGreaterThanOrEqual(15);
  await tv.close();
});
