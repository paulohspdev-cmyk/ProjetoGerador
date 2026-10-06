import { expect, test, type Page } from "@playwright/test";

import { ensureApprovedModem } from "./modem-fixture";

const adminEmail = process.env.E2E_ADMIN_EMAIL || "";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(adminEmail);
  await page.locator('input[aria-label="Senha"]').fill(adminPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"));
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

async function createGenerator(
  page: Page,
  payload: {
    tag: string;
    controller: string;
    listenPort: number;
    modbusUnit: number;
    rapidDeviceNum: number;
  },
) {
  await ensureApprovedModem(page, payload.listenPort);
  return page.evaluate(async (body) => {
    const response = await fetch("/api/generators", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tag: body.tag,
        name: body.tag,
        customer: "Vertical Reference",
        site: "Vertical Lab",
        controller: body.controller,
        transport: "reverse_tcp",
        listenPort: body.listenPort,
        modbusUnit: body.modbusUnit,
        rapidDeviceNum: body.rapidDeviceNum,
      }),
    });
    return response.status;
  }, payload);
}

test("vertical nasce diferente para ComAp e DSE", async ({ page }) => {
  await login(page);

  expect([201, 409]).toContain(
    await createGenerator(page, {
      tag: "VERTCOMAP",
      controller: "ComAp InteliGen 200",
      listenPort: 15101,
      modbusUnit: 71,
      rapidDeviceNum: 391,
    }),
  );

  expect([201, 409]).toContain(
    await createGenerator(page, {
      tag: "VERTDSE",
      controller: "DSE DSE8620 MKII",
      listenPort: 15102,
      modbusUnit: 72,
      rapidDeviceNum: 392,
    }),
  );

  await page.goto("/p/geradores");
  await openGeneratorTools(page);
  await expect(
    page
      .locator("button:visible")
      .filter({ hasText: /^Todos$/ })
      .first(),
  ).toBeVisible();

  const search = page.locator('input[aria-label="Buscar gerador"]:visible').first();

  async function assertCommonCard(vendor: "comap" | "dse", tag: string) {
    await search.fill(tag);
    const card = page.locator(`[data-controller-vendor="${vendor}"]`).filter({ hasText: tag });
    await expect(card).toBeVisible();
    await expect(card.getByRole("heading", { name: "KW", exact: true })).toBeVisible();
    await expect(card.getByText("POWER FLOW")).toBeVisible();
    await expect(card.locator(".vref-clock")).toHaveCount(0);
    await expect(card.locator(".vref-power")).not.toContainText("%");
    await expect(card.locator(".vref-flow")).not.toContainText(/RPM/);
    await expect(card.getByText("ENGINE STATUS")).toBeVisible();
    await expect(card.getByRole("heading", { name: "RPM" })).toBeVisible();
    await expect(card.locator(".vref-data-table")).toBeVisible();
    await expect(card.locator(".vref-summary-grid")).toHaveCount(0);
    await expect(card.getByText("Horímetro", { exact: true })).toHaveCount(0);
    await expect(card.getByText("Energia", { exact: true })).toHaveCount(0);
    await expect(card.getByText("Partidas", { exact: true })).toHaveCount(0);
    await expect(card.getByText(/ALARM LIST/)).toHaveCount(0);
    await expect(card).toHaveAttribute("data-mains-state", "unknown");
    await expect(card.getByRole("button", { name: "START" })).toBeVisible();
    await expect(card.getByRole("button", { name: "STOP" })).toBeVisible();
    await expect(card.getByText("HORN RESET")).toHaveCount(0);
    await expect(card.getByText("FAULT RESET")).toHaveCount(0);
    return card;
  }

  const comap = await assertCommonCard("comap", "VERTCOMAP");
  await expect(comap.getByRole("button", { name: "OFF" })).toBeVisible();
  await expect(comap.getByRole("button", { name: "MAN" })).toBeVisible();
  await expect(comap.getByRole("button", { name: "AUT" })).toBeVisible();
  await expect(comap.getByRole("button", { name: "TEST" })).toBeVisible();

  const dse = await assertCommonCard("dse", "VERTDSE");
  await expect(dse.getByRole("button", { name: "Manual" })).toBeVisible();
  await expect(dse.getByRole("button", { name: "Manual" }).locator("svg")).toHaveCount(1);
  await expect(dse.getByRole("button", { name: "Automático" })).toBeVisible();
});

test("um único gerador permanece na primeira coluna à esquerda", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await login(page);

  expect([201, 409]).toContain(
    await createGenerator(page, {
      tag: "VERTSINGLELEFT",
      controller: "ComAp InteliGen 200",
      listenPort: 15121,
      modbusUnit: 75,
      rapidDeviceNum: 395,
    }),
  );

  await page.goto("/p/geradores");
  await openGeneratorTools(page);
  await page.locator('input[aria-label="Buscar gerador"]:visible').first().fill("VERTSINGLELEFT");

  await expect(page.locator(".vref-card-frame")).toHaveCount(1);
  await expect(page.locator(".vref-card-frame").first()).toBeVisible();

  const layout = await page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>(".generator-reference-card-grid");
    const frame = grid?.querySelector<HTMLElement>(".vref-card-frame");
    if (!grid || !frame) throw new Error("grade/card vertical não encontrado");

    const gridRect = grid.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const style = getComputedStyle(grid);
    const columns = Number.parseInt(style.getPropertyValue("--vref-columns").trim(), 10);
    const gap = Number.parseFloat(style.getPropertyValue("--vref-gap")) || 0;
    const padding = Number.parseFloat(style.getPropertyValue("--vref-padding")) || 0;
    const expectedWidth =
      (grid.clientWidth - padding * 2 - gap * Math.max(0, columns - 1)) / columns;

    return {
      columns,
      gridLeft: gridRect.left,
      gridWidth: gridRect.width,
      frameLeft: frameRect.left,
      frameWidth: frameRect.width,
      expectedWidth,
      padding,
    };
  });

  expect(layout.columns).toBeGreaterThan(1);
  expect(Math.abs(layout.frameLeft - (layout.gridLeft + layout.padding))).toBeLessThanOrEqual(2);
  expect(Math.abs(layout.frameWidth - layout.expectedWidth)).toBeLessThanOrEqual(2);
  expect(layout.frameWidth).toBeLessThan(layout.gridWidth / 2);
});

test("vertical sem rede remove a concessionária do fluxo em ComAp e DSE", async ({ page }) => {
  await login(page);

  for (const spec of [
    {
      tag: "VERTCOMAPISO",
      controller: "ComAp InteliGen 200",
      listenPort: 15111,
      modbusUnit: 73,
      rapidDeviceNum: 393,
    },
    {
      tag: "VERTDSEISO",
      controller: "DSE DSE8620 MKII",
      listenPort: 15112,
      modbusUnit: 74,
      rapidDeviceNum: 394,
    },
  ]) {
    await ensureApprovedModem(page, spec.listenPort);
    const status = await page.evaluate(async (body) => {
      const response = await fetch("/api/generators", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tag: body.tag,
          name: body.tag,
          customer: "Vertical Reference",
          site: "Vertical Lab",
          controller: body.controller,
          transport: "reverse_tcp",
          listenPort: body.listenPort,
          modbusUnit: body.modbusUnit,
          rapidDeviceNum: body.rapidDeviceNum,
          powerTopology: "genset_only",
        }),
      });
      return response.status;
    }, spec);
    expect([201, 409]).toContain(status);
  }

  await page.goto("/p/geradores");
  await openGeneratorTools(page);
  const search = page.locator('input[aria-label="Buscar gerador"]:visible').first();

  for (const spec of [
    { vendor: "comap", tag: "VERTCOMAPISO" },
    { vendor: "dse", tag: "VERTDSEISO" },
  ]) {
    await search.fill(spec.tag);
    const card = page
      .locator(`[data-controller-vendor="${spec.vendor}"]`)
      .filter({ hasText: spec.tag });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-power-topology", "genset_only");
    await expect(card.locator('svg[aria-label="Power flow horizontal sem rede"]')).toBeVisible();
    await expect(card.locator('[role="button"][aria-label^="MCB"]')).toHaveCount(0);
    await expect(card.locator('[role="button"][aria-label^="GCB"]')).toHaveCount(1);
    await expect(card.getByText("CARGA", { exact: true })).toBeVisible();
  }
});

test("vertical preserva todo o conteúdo e rola a grade quando a altura é curta", async ({
  browser,
}) => {
  test.setTimeout(300_000);

  const prefix = "VFIT";
  const setupContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const setupPage = await setupContext.newPage();
  await login(setupPage);
  for (let index = 1; index <= 12; index += 1) {
    const response = await createGenerator(setupPage, {
      tag: prefix + String(index).padStart(2, "0"),
      controller: index % 2 === 0 ? "DSE DSE8620 MKII" : "ComAp InteliGen 200",
      listenPort: 15200 + index,
      modbusUnit: 80 + index,
      rapidDeviceNum: 410 + index,
    });
    expect([201, 409]).toContain(response);
  }
  await expect
    .poll(
      () =>
        setupPage.evaluate(async (searchPrefix) => {
          const response = await fetch("/api/generators", { credentials: "include" });
          if (!response.ok) return 0;
          const rows = (await response.json()) as Array<{ tag?: string }>;
          return rows.filter((item) => String(item.tag || "").startsWith(searchPrefix)).length;
        }, prefix),
      { timeout: 15_000 },
    )
    .toBe(12);
  await setupContext.close();

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 3840, height: 2160 },
  ]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.width <= 1024,
      isMobile: viewport.width <= 430,
    });
    const page = await context.newPage();
    await login(page);

    await page.goto("/p/geradores", { waitUntil: "networkidle" });
    await openGeneratorTools(page);
    await expect(
      page
        .locator("button:visible")
        .filter({ hasText: /^Vertical$/ })
        .first(),
    ).toBeVisible();
    await page.locator('input[aria-label="Buscar gerador"]:visible').first().fill(prefix);
    await expect(page.locator(".vref-card-frame").first()).toBeVisible({
      timeout: 15_000,
    });

    const metrics = await page.evaluate(() => {
      const grid = document.querySelector<HTMLElement>(".generator-reference-card-grid");
      if (!grid) throw new Error("grid vertical não encontrado");
      const gridRect = grid.getBoundingClientRect();
      const frames = [...grid.querySelectorAll<HTMLElement>(".vref-card-frame")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const card = element.querySelector<HTMLElement>(".vref-card");
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
            cardOverflowHeight: card ? card.scrollHeight - card.clientHeight : 999,
            cardOverflowWidth: card ? card.scrollWidth - card.clientWidth : 999,
          };
        });
      const style = getComputedStyle(grid);
      const declaredColumns = Number.parseInt(style.getPropertyValue("--vref-columns").trim(), 10);
      const declaredRows = Number.parseInt(style.getPropertyValue("--vref-rows").trim(), 10);
      return {
        globalOverflow:
          Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        gridClientHeight: grid.clientHeight,
        gridScrollHeight: grid.scrollHeight,
        gridClientWidth: grid.clientWidth,
        gridScrollWidth: grid.scrollWidth,
        declaredColumns: Number.isFinite(declaredColumns) ? declaredColumns : 0,
        declaredRows: Number.isFinite(declaredRows) ? declaredRows : 0,
        gridRect: {
          left: gridRect.left,
          right: gridRect.right,
          top: gridRect.top,
          bottom: gridRect.bottom,
        },
        frames,
      };
    });

    expect(metrics.globalOverflow).toBeLessThanOrEqual(1);
    expect(metrics.gridScrollWidth).toBeLessThanOrEqual(metrics.gridClientWidth + 1);
    expect(metrics.gridScrollHeight).toBeGreaterThanOrEqual(metrics.gridClientHeight - 1);
    expect(metrics.frames.length).toBeGreaterThan(0);

    for (const frame of metrics.frames) {
      expect(frame.left).toBeGreaterThanOrEqual(metrics.gridRect.left - 1);
      expect(frame.right).toBeLessThanOrEqual(metrics.gridRect.right + 1);
      expect(frame.top).toBeGreaterThanOrEqual(metrics.gridRect.top - 1);
      expect(frame.width).toBeGreaterThan(0);
      expect(frame.height).toBeGreaterThan(0);
      expect(frame.cardOverflowHeight).toBeLessThanOrEqual(1);
      expect(frame.cardOverflowWidth).toBeLessThanOrEqual(1);
    }

    expect(metrics.declaredColumns).toBeGreaterThan(0);
    expect(metrics.declaredRows).toBeGreaterThan(0);
    expect(metrics.frames.length).toBeLessThanOrEqual(
      metrics.declaredColumns * metrics.declaredRows,
    );

    if (viewport.width === 1920) {
      expect(metrics.frames.length).toBeGreaterThanOrEqual(5);
      expect(metrics.declaredColumns).toBeGreaterThanOrEqual(5);
      expect(Math.min(...metrics.frames.map((frame) => frame.width))).toBeGreaterThanOrEqual(280);
      expect(Math.min(...metrics.frames.map((frame) => frame.height))).toBeGreaterThanOrEqual(795);
    }

    if (viewport.width === 3840) {
      expect(metrics.frames.length).toBeGreaterThanOrEqual(10);
      expect(metrics.declaredColumns).toBeGreaterThanOrEqual(10);
      expect(Math.min(...metrics.frames.map((frame) => frame.width))).toBeGreaterThanOrEqual(280);
      expect(Math.max(...metrics.frames.map((frame) => frame.width))).toBeLessThanOrEqual(345);
    }

    await context.close();
  }
});
