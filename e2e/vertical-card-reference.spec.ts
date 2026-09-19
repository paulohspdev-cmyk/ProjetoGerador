import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL || "";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(adminEmail);
  await page.locator('input[aria-label="Senha"]').fill(adminPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"));
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
  await expect(page.getByRole("button", { name: /^Todos$/ })).toBeVisible();

  const comap = page.locator('[data-controller-vendor="comap"]').filter({ hasText: "VERTCOMAP" });
  const dse = page.locator('[data-controller-vendor="dse"]').filter({ hasText: "VERTDSE" });

  await expect(comap).toBeVisible();
  await expect(dse).toBeVisible();

  for (const card of [comap, dse]) {
    await expect(card.getByText("KW", { exact: true })).toBeVisible();
    await expect(card.getByText("POWER FLOW")).toBeVisible();
    await expect(card.locator(".vref-clock")).toHaveCount(0);
    await expect(card.locator(".vref-power")).not.toContainText("%");
    await expect(card.locator(".vref-flow")).not.toContainText(/RPM/);
    await expect(card.getByText("ENGINE STATUS")).toBeVisible();
    await expect(card.getByRole("heading", { name: "RPM" })).toBeVisible();
    await expect(card.getByText("MAINS / GENERATOR")).toBeVisible();
    await expect(card.locator(".vref-summary-grid")).toBeVisible();
    await expect(card.getByText(/ALARM LIST/)).toHaveCount(0);
    await expect(card).toHaveAttribute("data-mains-state", "unknown");
  }

  await expect(comap.getByRole("button", { name: "OFF" })).toBeVisible();
  await expect(comap.getByRole("button", { name: "MAN" })).toBeVisible();
  await expect(comap.getByRole("button", { name: "AUT" })).toBeVisible();
  await expect(comap.getByRole("button", { name: "TEST" })).toBeVisible();
  await expect(comap.getByText("CONTROL", { exact: true })).toBeVisible();

  await expect(dse.getByText("CONTROL (DSE STYLE)")).toBeVisible();
  await expect(dse.getByRole("button", { name: "DSE manual mode" })).toBeVisible();
  await expect(dse.getByRole("button", { name: "DSE manual mode" }).locator("svg")).toHaveCount(1);
  await expect(dse.getByRole("button", { name: "AUTO" })).toBeVisible();

  for (const card of [comap, dse]) {
    await expect(card.getByRole("button", { name: "START" })).toBeVisible();
    await expect(card.getByRole("button", { name: "STOP" })).toBeVisible();
    await expect(card.getByText("HORN RESET")).toHaveCount(0);
    await expect(card.getByText("FAULT RESET")).toHaveCount(0);
    await expect(card.locator(".vref-breaker-badge")).toHaveCount(2);
  }
});

test("vertical preserva todo o conteúdo e rola a grade quando a altura é curta", async ({
  browser,
}) => {
  test.setTimeout(180_000);

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

    for (let index = 1; index <= 8; index += 1) {
      const response = await createGenerator(page, {
        tag: "VFIT" + String(index).padStart(2, "0"),
        controller: index % 2 === 0 ? "DSE DSE8620 MKII" : "ComAp InteliGen 200",
        listenPort: 15200 + index,
        modbusUnit: 80 + index,
        rapidDeviceNum: 410 + index,
      });
      expect([201, 409]).toContain(response);
    }

    await page.goto("/p/geradores");
    await expect(page.getByRole("button", { name: /^Todos$/ })).toBeVisible();
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
