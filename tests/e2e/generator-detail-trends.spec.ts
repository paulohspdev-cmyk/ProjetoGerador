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

test("detalhe do gerador usa tendências reais em linha e não barras gigantes", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await login(page);

  const generator = await page.evaluate(async () => {
    const response = await fetch("/api/generators", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tag: "DETAILTREND",
        name: "DETAILTREND",
        customer: "Trend Audit",
        site: "Trend Lab",
        controller: "DSE DSE8620 MKII",
        transport: "reverse_tcp",
        listenPort: 15621,
        modbusUnit: 81,
        rapidDeviceNum: 521,
      }),
    });
    if (!response.ok && response.status !== 409) {
      throw new Error("falha ao criar fixture: " + response.status);
    }
    if (response.ok) return response.json();

    const rows = await fetch("/api/generators", { credentials: "include" }).then((r) => r.json());
    return rows.find((item: { tag?: string }) => item.tag === "DETAILTREND");
  });

  expect(generator?.id).toBeTruthy();
  const generatorId = String(generator.id);

  const metricKeys = [
    "voltage_l1",
    "voltage_l2",
    "voltage_l3",
    "current_l1",
    "current_l2",
    "current_l3",
    "power_kw",
    "frequency",
    "rpm",
    "oil_pressure",
    "coolant_temperature",
    "fuel_level",
    "battery_voltage",
    "engine_load",
    "alternator_voltage",
    "mains_voltage_l1",
    "mains_voltage_l2",
    "mains_voltage_l3",
    "mains_frequency",
    "mains_power_kw",
  ];

  await page.route("**/api/generators/*/metrics", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(metricKeys.map((key, index) => ({ key, cnl: 9000 + index, scale: 1 }))),
    });
  });

  await page.route("**/api/generators/*/trends/*", async (route) => {
    const url = new URL(route.request().url());
    const metric = decodeURIComponent(url.pathname.split("/trends/")[1] ?? "");
    const base = Date.now() - 5 * 60 * 60 * 1000;
    const multiplier = metric.includes("voltage")
      ? 220
      : metric.includes("frequency")
        ? 50
        : metric.includes("rpm")
          ? 1500
          : 10;
    const points = Array.from({ length: 18 }, (_, index) => ({
      timestamp: new Date(base + index * 20 * 60 * 1000).toISOString(),
      value: multiplier + index * 0.4,
      stat: 1,
    }));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        generatorId,
        tag: "DETAILTREND",
        metric,
        cnl: 9000,
        scale: 1,
        archiveBit: 1,
        start: points[0]!.timestamp,
        end: points.at(-1)!.timestamp,
        points,
      }),
    });
  });

  await page.goto("/p/geradores/" + encodeURIComponent(generatorId));

  const electrical = page.getByLabel("Tendências elétricas 24h");
  await expect(electrical).toBeVisible();
  await expect(page.getByText("Tensão do gerador · L1 L2 L3")).toBeVisible();
  await expect(page.getByText("Corrente do gerador · I1 I2 I3")).toBeVisible();
  await expect(page.getByText("Potência ativa")).toBeVisible();
  await expect(page.getByText("Frequência do gerador")).toBeVisible();
  await expect(page.getByText("Tensão da rede · L1 L2 L3")).toBeVisible();
  await expect(page.getByText("Frequência / potência da rede")).toBeVisible();

  const engine = page.getByLabel("Tendências do motor 24h");
  await expect(engine).toBeVisible();
  for (const label of [
    "RPM",
    "Pressão de óleo",
    "Temp. motor",
    "Combustível",
    "Bateria",
    "Carga do motor",
  ]) {
    await expect(engine.getByText(label, { exact: true })).toBeVisible();
  }

  await expect.poll(() => page.locator("svg.recharts-surface").count()).toBeGreaterThanOrEqual(10);
  await expect(page.getByText("Gráfico Rede — L1 L2 L3")).toHaveCount(0);
  await expect(page.getByText("Gráfico Gerador — L1 L2 L3")).toHaveCount(0);

  const firstPanel = electrical.locator("section").first();
  const box = await firstPanel.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(250);
  expect(box?.height ?? 0).toBeGreaterThan(100);
});
