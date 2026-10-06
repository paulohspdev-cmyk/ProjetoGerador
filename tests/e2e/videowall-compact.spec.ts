import { expect, test, type Browser, type Page } from "@playwright/test";
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

async function openTools(page: Page) {
  const opener = page.locator('button[aria-label="Abrir menu da lista"]:visible').first();
  await expect(opener).toBeVisible();
  await opener.click();
  await expect(page.locator('input[aria-label="Buscar gerador"]:visible').first()).toBeVisible();
}

async function switchToCompact(page: Page) {
  await openTools(page);
  await page
    .locator("button:visible")
    .filter({ hasText: /vertical/i })
    .first()
    .click();
  await page.getByRole("menuitemradio", { name: "Compacto" }).click();
  await expect(page.locator(".compact-generator-grid")).toBeVisible();
}

async function installGeneratorMock(page: Page, rows: unknown[]) {
  await page.route("**/api/generators*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname === "/api/generators") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(rows),
      });
      return;
    }
    await route.continue();
  });
}

async function validateViewport(
  browser: Browser,
  rows: unknown[],
  width: number,
  height: number,
  expectedPageSize?: number,
) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await installGeneratorMock(page, rows);
  await login(page);
  await page.goto("/p/geradores");
  await switchToCompact(page);

  const grid = page.locator(".compact-generator-grid");
  await expect(grid).toBeVisible();

  const firstCard = grid.locator(".compact-card").first();
  await expect(firstCard.locator(".compact-card__electrical-heading")).toHaveText("ELECTRICAL");
  await expect(firstCard.locator(".compact-card__electrical-row")).toHaveCount(5);
  await expect(
    firstCard.locator(".compact-card__electrical-row").nth(2).locator("span.num"),
  ).toHaveCount(2);
  await expect(
    firstCard
      .locator(".compact-card__electrical-row")
      .nth(2)
      .locator(".compact-card__electrical-values"),
  ).toHaveClass(/is-right/);
  await expect(
    firstCard.locator(".compact-card__electrical-row").nth(3).locator("span.num"),
  ).toHaveCount(3);
  await expect(
    firstCard.locator(".compact-card__electrical-row").nth(4).locator("span.num"),
  ).toHaveCount(3);

  const result = await grid.evaluate((element) => {
    const grid = element as HTMLElement;
    const cards = Array.from(grid.querySelectorAll<HTMLElement>("article"));
    const gridRect = grid.getBoundingClientRect();
    const violations: Array<Record<string, unknown>> = [];

    for (const [index, card] of cards.entries()) {
      const cardRect = card.getBoundingClientRect();
      if (
        cardRect.left < gridRect.left - 1 ||
        cardRect.right > gridRect.right + 1 ||
        cardRect.top < gridRect.top - 1 ||
        cardRect.bottom > gridRect.bottom + 1
      ) {
        violations.push({ index, kind: "card-outside-grid" });
      }
      if (card.scrollWidth > card.clientWidth + 1 || card.scrollHeight > card.clientHeight + 1) {
        violations.push({
          index,
          kind: "card-scroll-overflow",
          scrollWidth: card.scrollWidth,
          clientWidth: card.clientWidth,
          scrollHeight: card.scrollHeight,
          clientHeight: card.clientHeight,
        });
      }

      for (const selector of [
        ".compact-card__header",
        ".compact-card__body",
        ".compact-card__electrical",
        ".compact-card__stale",
      ]) {
        const child = card.querySelector<HTMLElement>(selector);
        if (!child) continue;
        const rect = child.getBoundingClientRect();
        if (
          rect.left < cardRect.left - 1 ||
          rect.right > cardRect.right + 1 ||
          rect.top < cardRect.top - 1 ||
          rect.bottom > cardRect.bottom + 1
        ) {
          violations.push({
            index,
            kind: "child-outside-card",
            selector,
            child: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
            card: {
              left: cardRect.left,
              right: cardRect.right,
              top: cardRect.top,
              bottom: cardRect.bottom,
            },
          });
        }
      }
    }

    const styles = getComputedStyle(grid);
    return {
      pageSize: Number(grid.dataset.pageSize || "0"),
      density: grid.dataset.density || "",
      columns: Number(styles.getPropertyValue("--compact-cols") || "0"),
      rows: Number(styles.getPropertyValue("--compact-rows") || "0"),
      cardCount: cards.length,
      violations,
      globalOverflow:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
    };
  });

  console.log("VIDEOWALL", width + "x" + height, JSON.stringify(result));
  expect(result.pageSize).toBeGreaterThan(0);
  expect(result.pageSize).toBeLessThanOrEqual(30);
  if (expectedPageSize != null) expect(result.pageSize).toBe(expectedPageSize);
  expect(result.cardCount).toBe(Math.min(result.pageSize, rows.length));
  expect(result.violations).toEqual([]);
  expect(result.globalOverflow).toBeLessThanOrEqual(1);

  if ((width === 1920 && height === 1080) || (width === 3840 && height === 2160)) {
    await page.screenshot({
      path: `test-results/videowall-${width}x${height}.png`,
      fullPage: false,
    });
  }

  await context.close();
  return result;
}

test("compacto videowall acomoda até 30 cards sem recorte", async ({ browser, page }) => {
  test.setTimeout(240_000);

  await login(page);
  await ensureApprovedModem(page, 15990);
  const status = await page.evaluate(async () => {
    const response = await fetch("/api/generators", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tag: "VWBASE",
        name: "Videowall Base",
        customer: "Videowall",
        site: "Lab",
        controller: "ComAp InteliGen 200",
        transport: "reverse_tcp",
        listenPort: 15990,
        modbusUnit: 90,
        rapidDeviceNum: 490,
      }),
    });
    return response.status;
  });
  expect([201, 409]).toContain(status);

  const source = await page.evaluate(async () => {
    const response = await fetch("/api/generators", { credentials: "include" });
    if (!response.ok) throw new Error("falha ao obter gerador base");
    return response.json();
  });
  const base = (source as Array<Record<string, unknown>>).find((item) => item.tag === "VWBASE");
  expect(base).toBeTruthy();

  const rows = Array.from({ length: 35 }, (_, index) => ({
    ...base,
    id: `vw-${index + 1}`,
    tag: `VW${String(index + 1).padStart(2, "0")}`,
    name: `Gerador Videowall ${index + 1}`,
  }));

  await validateViewport(browser, rows, 1366, 768);
  await validateViewport(browser, rows, 1920, 1080, 30);
  await validateViewport(browser, rows, 2560, 1440, 30);
  await validateViewport(browser, rows, 3840, 2160, 30);
  await validateViewport(browser, rows, 5760, 2160, 30);
});
