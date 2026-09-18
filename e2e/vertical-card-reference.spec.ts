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
  await page.getByRole("button", { name: /online/i }).click();
  await page.getByRole("menuitemradio", { name: "Todos" }).click();

  const comap = page.locator('[data-controller-vendor="comap"]').filter({ hasText: "VERTCOMAP" });
  const dse = page.locator('[data-controller-vendor="dse"]').filter({ hasText: "VERTDSE" });

  await expect(comap).toBeVisible();
  await expect(dse).toBeVisible();

  for (const card of [comap, dse]) {
    await expect(card.getByText("GENERATOR POWER")).toBeVisible();
    await expect(card.getByText("POWER FLOW")).toBeVisible();
    await expect(card.getByText("ENGINE STATUS")).toBeVisible();
    await expect(card.getByRole("heading", { name: "RPM" })).toBeVisible();
    await expect(card.getByText("MAINS / GENERATOR")).toBeVisible();
    await expect(card.getByText("VALUES", { exact: true })).toBeVisible();
    await expect(card.getByText(/ALARM LIST/)).toBeVisible();
    await expect(card).toHaveAttribute("data-mains-state", "absent");
  }

  await expect(comap.getByRole("button", { name: "OFF" })).toBeVisible();
  await expect(comap.getByRole("button", { name: "MAN" })).toBeVisible();
  await expect(comap.getByRole("button", { name: "AUT" })).toBeVisible();
  await expect(comap.getByRole("button", { name: "TEST" })).toBeVisible();
  await expect(comap.getByText("CONTROL", { exact: true })).toBeVisible();

  await expect(dse.getByText("CONTROL (DSE STYLE)")).toBeVisible();
  await expect(dse.getByRole("button", { name: "DSE manual mode" })).toBeVisible();
  await expect(dse.getByRole("button", { name: /AUTO/ })).toBeVisible();
  await expect(dse.getByRole("button", { name: "OFF" })).toHaveCount(0);
  await expect(dse.getByRole("button", { name: "MAN" })).toHaveCount(0);
  await expect(dse.getByRole("button", { name: "TEST" })).toHaveCount(0);
});

test("vertical mantém largura da viewport em celular e desktop", async ({ browser }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.width <= 1024,
      isMobile: viewport.width <= 430,
    });
    const page = await context.newPage();
    await login(page);
    await page.goto("/p/geradores");
    const overflow = await page.evaluate(
      () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await context.close();
  }
});
