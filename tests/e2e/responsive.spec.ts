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

async function openGeneratorTools(page: Page) {
  const width = page.viewportSize()?.width ?? 0;
  if (width < 1024) {
    const mobileMenu = page.locator('button[aria-label="Abrir menu"]:visible').first();
    await expect(mobileMenu).toBeVisible();
    await mobileMenu.click();
  }

  const opener = page.locator('button[aria-label="Abrir menu da lista"]:visible').first();
  await expect(opener).toBeVisible();
  await opener.click();
  await expect(page.locator('input[aria-label="Buscar gerador"]:visible').first()).toBeVisible();
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
    { width: 2560, height: 1440, touch: false },
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

    await page.goto("/p/central-de-operacao");
    if (viewport.width < 1024) {
      const menu = page.getByRole("button", { name: "Abrir menu" });
      await expect(menu).toBeVisible();
      expect((await menu.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    } else {
      const overviewLink = page.getByRole("link", { name: "Resumo Operacional" }).first();
      await expect(overviewLink).toBeVisible();
      expect((await overviewLink.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    const theme = page.locator('button[aria-label^="Ativar tema"]:visible').first();
    await expect(theme).toBeVisible();
    expect((await theme.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

    await page.goto("/p/geradores");
    await openGeneratorTools(page);
    const previous = page.locator('button[aria-label="Página anterior"]:visible').first();
    await expect(previous).toBeVisible();
    expect((await previous.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

    const search = page.locator('input[aria-label="Buscar gerador"]:visible').first();
    expect((await search.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

    await context.close();
  }
});

test("tablet usa cards e TV 4K preserva densidade do console", async ({ browser }) => {
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
  await openGeneratorTools(page);
  await page
    .locator("button:visible")
    .filter({ hasText: /vertical/i })
    .first()
    .click();
  await page.getByRole("menuitemradio", { name: "Lista" }).click();
  await expect(
    page
      .locator("button:visible")
      .filter({ hasText: /^Todos$/ })
      .first(),
  ).toBeVisible();

  await expect(page.locator("article").filter({ hasText: "RESP001" })).toBeVisible();
  await expect(page.locator('table[class*="min-w-[2080px]"]')).toBeHidden();
  await tablet.close();

  const { context: tv, page: tvPage } = await contextAt(browser, 3840, 2160, false);
  await tvPage.goto("/p/geradores");
  await openGeneratorTools(tvPage);
  const density = await tvPage.evaluate(() => {
    const rootFont = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const bodyFont = Number.parseFloat(getComputedStyle(document.body).fontSize);
    const topbar = document.querySelector<HTMLElement>(".rc-topbar");
    const sidebar = document.querySelector<HTMLElement>(".rc-sidebar");
    return {
      rootFont,
      bodyFont,
      topbarHeight: topbar?.getBoundingClientRect().height ?? 0,
      sidebarWidth: sidebar?.getBoundingClientRect().width ?? 0,
    };
  });
  expect(density.rootFont).toBeLessThanOrEqual(17.5);
  expect(density.bodyFont).toBeLessThanOrEqual(16.5);
  expect(density.topbarHeight).toBeLessThanOrEqual(100);
  expect(density.sidebarWidth).toBeLessThanOrEqual(360);

  const previousTv = tvPage.locator('button[aria-label="Página anterior"]:visible').first();
  await expect(previousTv).toBeVisible();
  const previousFontSize = await previousTv.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  expect(previousFontSize).toBeGreaterThanOrEqual(12);
  expect(previousFontSize).toBeLessThanOrEqual(17);
  await expectNoGlobalOverflow(tvPage);
  await tv.close();
});
