import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL || "";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "";
const realGeneratorTags = (process.env.E2E_REAL_GENERATOR_TAGS || "")
  .split(",")
  .map((tag) => tag.trim())
  .filter(Boolean);

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(adminEmail);
  await page.locator('input[aria-label="Senha"]').fill(adminPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"));
}

async function createGeneratorWithoutTelemetry(
  page: Page,
  fixture: {
    tag: string;
    controller: string;
    listenPort: number;
    modbusUnit: number;
    rapidDeviceNum: number;
  },
) {
  return page.evaluate(async (input) => {
    const response = await fetch("/api/generators", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tag: input.tag,
        name: input.tag,
        customer: "E2E isolado",
        site: "E2E sem telemetria",
        controller: input.controller,
        transport: "reverse_tcp",
        listenPort: input.listenPort,
        modbusUnit: input.modbusUnit,
        rapidDeviceNum: input.rapidDeviceNum,
      }),
    });
    if (!response.ok && response.status !== 409) {
      throw new Error("falha ao criar fixture sem telemetria: " + response.status);
    }
    if (response.ok) return response.json();

    const rows = await fetch("/api/generators", { credentials: "include" }).then((r) => r.json());
    return rows.find((item: { tag?: string }) => item.tag === input.tag);
  }, fixture);
}

test("detalhe usa layout de tendência e mantém N/D quando não existe histórico", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await login(page);

  for (const fixture of [
    {
      tag: "DETAIL-DSE-NODATA",
      controller: "DSE DSE8620 MKII",
      listenPort: 15621,
      modbusUnit: 81,
      rapidDeviceNum: 521,
    },
    {
      tag: "DETAIL-COMAP-NODATA",
      controller: "ComAp InteliGen 200",
      listenPort: 15622,
      modbusUnit: 82,
      rapidDeviceNum: 522,
    },
  ]) {
    const generator = await createGeneratorWithoutTelemetry(page, fixture);
    expect(generator?.id).toBeTruthy();

    await page.goto("/p/geradores/" + encodeURIComponent(String(generator.id)));

    const trends = page.getByLabel("Tendências elétricas 24 horas");
    await expect(trends).toBeVisible();
    await expect(page.getByLabel("Período das tendências")).toBeVisible();
    await expect(page.getByRole("button", { name: "1h", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "6h", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "24h", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "7d", exact: true })).toBeVisible();

    await expect(page.getByText("Tensão do gerador · L1 L2 L3")).toBeVisible();
    await expect(page.getByText("Corrente do gerador · I1 I2 I3")).toBeVisible();
    await expect(page.getByText("Potência e fator de potência")).toBeVisible();
    await expect(page.getByText("Frequência do gerador")).toBeVisible();
    await expect(
      page.getByText("Canal histórico não provisionado nesta controladora").first(),
    ).toBeVisible();
    await expect(page.getByText("Gráfico Rede — L1 L2 L3")).toHaveCount(0);
    await expect(page.getByText("Gráfico Gerador — L1 L2 L3")).toHaveCount(0);

    for (const viewport of [
      { width: 1366, height: 768 },
      { width: 1920, height: 1080 },
      { width: 2560, height: 1440 },
      { width: 3840, height: 2160 },
    ]) {
      await page.setViewportSize(viewport);
      const overflow = await page.evaluate(
        () =>
          Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
      const box = await trends.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThan(0);
      expect(box?.height ?? 0).toBeLessThan(500);
    }

    await page.getByRole("button", { name: "7d", exact: true }).click();
    await expect(page.getByLabel("Tendências elétricas 7 dias")).toBeVisible();
  }
});

test("geradores com histórico real renderizam linhas e consultam o período selecionado", async ({
  page,
}) => {
  test.skip(realGeneratorTags.length === 0, "E2E_REAL_GENERATOR_TAGS não informado.");
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await login(page);

  const generators = await page.evaluate(async () => {
    const response = await fetch("/api/generators", { credentials: "include" });
    if (!response.ok) throw new Error("falha ao listar geradores: " + response.status);
    return response.json();
  });

  for (const tag of realGeneratorTags) {
    const generator = generators.find(
      (item: { tag?: string }) => String(item.tag || "").toUpperCase() === tag.toUpperCase(),
    );
    expect(generator, "gerador real não encontrado: " + tag).toBeTruthy();

    const trendRequests: string[] = [];
    const onRequest = (request: { url(): string }) => {
      if (request.url().includes("/trends/")) trendRequests.push(request.url());
    };
    page.on("request", onRequest);

    await page.goto("/p/geradores/" + encodeURIComponent(String(generator.id)));
    const trends24h = page.getByLabel("Tendências elétricas 24 horas");
    await expect(trends24h).toBeVisible();
    await expect
      .poll(() => page.locator("svg.recharts-surface").count(), { timeout: 60_000 })
      .toBeGreaterThan(0);
    await expect(page.getByText("Gráfico Rede — L1 L2 L3")).toHaveCount(0);
    await expect(page.getByText("Gráfico Gerador — L1 L2 L3")).toHaveCount(0);

    await page.getByRole("button", { name: "7d", exact: true }).click();
    await expect(page.getByLabel("Tendências elétricas 7 dias")).toBeVisible();
    await expect
      .poll(
        () =>
          trendRequests.some((url) => url.includes("hours=168") && url.includes("archiveBit=2")),
        { timeout: 60_000 },
      )
      .toBeTruthy();

    page.off("request", onRequest);
  }
});
