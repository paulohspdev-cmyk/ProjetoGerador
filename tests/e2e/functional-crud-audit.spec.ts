import { expect, test, type Page } from "@playwright/test";

import { ensureApprovedModem } from "./modem-fixture";

const adminEmail = process.env.E2E_ADMIN_EMAIL || "";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(adminEmail);
  await page.locator('input[aria-label="Senha"]').fill(adminPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

const form = (page: Page) => page.locator("form:visible").first();
const row = (page: Page, text: string) => page.locator("tr").filter({ hasText: text }).first();

async function acceptDialog(page: Page, action: () => Promise<unknown>) {
  page.once("dialog", (dialog) => void dialog.accept());
  await action();
}

async function createFixtureGenerator(page: Page) {
  await ensureApprovedModem(page, 15555);
  const status = await page.evaluate(async () => {
    const response = await fetch("/api/generators", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tag: "AUDITGEN",
        name: "Audit Generator",
        customer: "Audit",
        site: "Audit Site",
        controller: "InteliCompact NT MINT",
        transport: "reverse_tcp",
        listenPort: 15555,
        modbusUnit: 55,
      }),
    });
    return response.status;
  });
  expect([201, 409]).toContain(status);
}

test("clientes, unidades e agenda fazem CRUD real pela UI", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);

  await page.goto("/p/clientes");
  let f = form(page);
  await f.locator("input").nth(0).fill("Audit Cliente");
  await f.locator("input").nth(1).fill("2");
  await f.locator("input").nth(2).fill("1");
  await f.locator("input").nth(3).fill("99,9%");
  await f.locator('button[type="submit"]').click();
  let r = row(page, "Audit Cliente");
  await expect(r).toBeVisible();
  await r.getByRole("button", { name: "Editar" }).click();
  f = form(page);
  await f.locator("input").nth(0).fill("Audit Cliente Editado");
  await f.locator('button[type="submit"]').click();
  r = row(page, "Audit Cliente Editado");
  await expect(r).toBeVisible();
  await r.getByRole("button", { name: "Desativar" }).click();
  await expect(row(page, "Audit Cliente Editado")).toContainText("Inativo");
  await row(page, "Audit Cliente Editado").getByRole("button", { name: "Ativar" }).click();

  await page.goto("/p/unidades");
  f = form(page);
  await f.locator("input").nth(0).fill("Audit Unidade");
  await f.locator("select").selectOption({ label: "Audit Cliente Editado" });
  await f.locator("input").nth(1).fill("Poços de Caldas");
  await f.locator("input").nth(2).fill("MG");
  await f.locator("input").nth(3).fill("Rua Audit");
  await f.locator("input").nth(4).fill("-21.78");
  await f.locator("input").nth(5).fill("-46.56");
  await f.locator('button[type="submit"]').click();
  r = row(page, "Audit Unidade");
  await expect(r).toBeVisible();
  await r.getByRole("button", { name: "Editar" }).click();
  f = form(page);
  await f.locator("input").nth(0).fill("Audit Unidade Editada");
  await f.locator('button[type="submit"]').click();
  await expect(row(page, "Audit Unidade Editada")).toBeVisible();

  await page.goto("/p/agenda");
  f = form(page);
  await f.locator("input").nth(0).fill("Audit Agenda");
  await f.locator("input").nth(1).fill("29/09 10:00");
  await f.locator("input").nth(2).fill("Audit Unidade Editada");
  await f.locator('button[type="submit"]').click();
  r = row(page, "Audit Agenda");
  await expect(r).toBeVisible();
  await r.getByRole("button", { name: "Editar" }).click();
  f = form(page);
  await f.locator("input").nth(0).fill("Audit Agenda Editada");
  await f.locator('button[type="submit"]').click();
  r = row(page, "Audit Agenda Editada");
  await r.getByRole("button", { name: "Cancelar" }).click();
  await expect(row(page, "Audit Agenda Editada")).toContainText("Cancelado");
  await row(page, "Audit Agenda Editada").getByRole("button", { name: "Reativar" }).click();
  await acceptDialog(page, () =>
    row(page, "Audit Agenda Editada").getByRole("button", { name: "Excluir" }).click(),
  );

  await page.goto("/p/unidades");
  await row(page, "Audit Unidade Editada").getByRole("button", { name: "Excluir" }).click();
  await page.goto("/p/clientes");
  await row(page, "Audit Cliente Editado").getByRole("button", { name: "Excluir" }).click();
});

test("modems, gateways, webhooks e ERP/BMS fazem CRUD real", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);

  for (const spec of [
    { path: "/p/modems", name: "Audit Modem", values: ["Audit Modem", "M1", "10.0.0.11"] },
    {
      path: "/p/gateways",
      name: "Audit Gateway",
      values: ["Audit Gateway", "G1", "10.0.0.12", "SER-AUDIT"],
    },
  ]) {
    await page.goto(spec.path);
    let f = form(page);
    for (let i = 0; i < spec.values.length; i += 1) {
      await f.locator("input").nth(i).fill(spec.values[i]!);
    }
    await f.locator('button[type="submit"]').click();
    let r = row(page, spec.name);
    await expect(r).toBeVisible();
    await r.getByRole("button", { name: "Editar" }).click();
    f = form(page);
    await f
      .locator("input")
      .nth(0)
      .fill(spec.name + " Editado");
    await f.locator('button[type="submit"]').click();
    r = row(page, spec.name + " Editado");
    await r.getByRole("button", { name: "Desativar" }).click();
    await expect(row(page, spec.name + " Editado")).toContainText("Inativo");
    await acceptDialog(page, () =>
      row(page, spec.name + " Editado")
        .getByRole("button", { name: "Excluir" })
        .click(),
    );
  }

  await page.goto("/p/webhooks");
  let f = form(page);
  await f.locator("input").nth(0).fill("https://example.test/audit");
  await f.locator("input").nth(1).fill("audit.created");
  await f.locator('button[type="submit"]').click();
  const r = row(page, "audit.created");
  await r.getByRole("button", { name: "Editar" }).click();
  f = form(page);
  await f.locator("input").nth(1).fill("audit.updated");
  await f.locator('button[type="submit"]').click();
  await row(page, "audit.updated").getByRole("button", { name: "Excluir" }).click();

  await page.goto("/p/erp-bms");
  f = form(page);
  await f.locator("input").nth(0).fill("https://erp.example.test/rc");
  await f.locator("input").nth(1).fill("audit.erp");
  await f.locator('button[type="submit"]').click();
  await expect(row(page, "audit.erp")).toBeVisible();
  await row(page, "audit.erp").getByRole("button", { name: "Excluir" }).click();

  await page.goto("/p/email");
  await expect(page.getByRole("button", { name: "Enfileirar teste" })).toBeDisabled();
  await page.goto("/p/whatsapp");
  await expect(page.getByRole("button", { name: "Enfileirar teste" })).toBeDisabled();
});

test("manutenção, regras, exercício, scheduler, escalonamento e relatórios persistem", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await login(page);
  await createFixtureGenerator(page);
  await page.reload({ waitUntil: "networkidle" });

  await page.goto("/p/manutencao");
  let f = form(page);
  await expect(f.locator("select").locator("option")).toHaveCount(1);
  await expect(f.locator("select")).toContainText("AUDITGEN");
  await f.locator("input").nth(0).fill("Audit Preventiva");
  await f.locator("input").nth(1).fill("250");
  await f.locator('button[type="submit"]').click();
  await expect(page.getByText("Audit Preventiva", { exact: true })).toBeVisible();

  await page.goto("/p/regras");
  f = form(page);
  await f.locator("input").nth(0).fill("Audit Regra");
  await expect(f.locator("select").nth(1)).toContainText("AUDITGEN");
  await f.locator("select").nth(1).selectOption({ label: "AUDITGEN" });
  await f.locator("input").nth(1).fill("panel");
  await f.locator('button[type="submit"]').click();
  let r = row(page, "Audit Regra");
  await expect(r).toBeVisible();
  await r.getByRole("button", { name: /Aprovar e ligar/i }).click();
  await expect(row(page, "Audit Regra")).toContainText("ON");
  await expect(row(page, "Audit Regra")).toContainText("approved_nonindustrial");
  await row(page, "Audit Regra")
    .getByRole("button", { name: /Desligar/i })
    .click();
  await expect(row(page, "Audit Regra")).toContainText("OFF");
  await acceptDialog(page, () =>
    row(page, "Audit Regra").getByRole("button", { name: "Excluir" }).click(),
  );

  await page.goto("/p/exercicio-automatico");
  f = form(page);
  await f.locator("input").nth(0).fill("29/09 11:00");
  await f.locator("input").nth(1).fill("Audit Site");
  await f.locator('button[type="submit"]').click();
  r = row(page, "Audit Site");
  await expect(r).toBeVisible();
  await acceptDialog(page, () => r.getByRole("button", { name: "Excluir" }).click());

  await page.goto("/p/agendamentos");
  f = form(page);
  await f.locator("input").nth(0).fill("Audit Backup Job");
  await f.locator('button[type="submit"]').click();
  r = row(page, "Audit Backup Job");
  await r.getByRole("button", { name: /Pausar/i }).click();
  await expect(row(page, "Audit Backup Job")).toContainText("Pausado");
  await row(page, "Audit Backup Job").getByRole("button", { name: "Editar" }).click();
  f = form(page);
  await f.locator("input").nth(0).fill("Audit Backup Job Editado");
  await f.locator('button[type="submit"]').click();
  await acceptDialog(page, () =>
    row(page, "Audit Backup Job Editado").getByRole("button", { name: "Excluir" }).click(),
  );

  await page.goto("/p/escalonamento");
  f = form(page);
  await f.locator("input").nth(0).fill("Audit Escalonamento");
  await f.locator('button[type="submit"]').click();
  r = row(page, "Audit Escalonamento");
  await r.getByRole("button", { name: "Pausar" }).click();
  await expect(row(page, "Audit Escalonamento")).toContainText("Pausada");
  await acceptDialog(page, () =>
    row(page, "Audit Escalonamento").getByRole("button", { name: "Excluir" }).click(),
  );

  await page.goto("/p/relatorios");
  f = form(page);
  await f.locator("input").nth(0).fill("Audit Relatório");
  await expect(f.locator("input").nth(1)).toHaveValue("Fotografia operacional");
  await expect(f.locator("input").nth(1)).toHaveAttribute("readonly", "");
  await f.locator("select").selectOption("CSV");
  await f.locator('button[type="submit"]').click();
  r = row(page, "Audit Relatório");
  await expect(r).toContainText("Pronto");
  await r.getByRole("button", { name: "Baixar" }).click();
  await acceptDialog(page, () => r.getByRole("button", { name: "Excluir" }).click());

  await page.goto("/p/notificacoes");
  await page.getByRole("button", { name: "Testar painel" }).click();
  await expect(page.locator("tr").filter({ hasText: "panel" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Processar fila" }).click();
});

test("backup e cadastro técnico de controladora funcionam sem comando industrial", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await login(page);

  await page.goto("/p/controladoras");
  const f = form(page);
  await f.locator("input").nth(0).fill("AUDITATS");
  await f.locator("input").nth(1).fill("Audit ATS");
  await f.locator("input").nth(2).fill("Audit Site");
  await f.locator("input").nth(3).fill("audit-fw");
  await f.locator("select").nth(0).selectOption("DSE335");
  const connection = f.locator('input[type="checkbox"]');
  if (await connection.isChecked()) await connection.uncheck();
  await f.locator('button[type="submit"]').click();
  await expect(page.getByText(/Equipamento cadastrado/)).toBeVisible();
  await expect(page.locator("option").filter({ hasText: "AUDITATS" }).first()).toHaveCount(1);

  let controllerRow = page
    .locator("tr")
    .filter({ hasText: "AUDITATS" })
    .filter({ hasText: "DSE335" })
    .first();
  await expect(controllerRow).toBeVisible();
  await controllerRow.getByRole("button", { name: "Editar" }).click();
  const editForm = page
    .locator("form:visible")
    .filter({ has: page.locator('input[aria-label="Controladora"]') });
  await editForm.locator('input:not([aria-label="Controladora"])').fill("audit-fw-2");
  await editForm.getByRole("button", { name: "Salvar" }).click();
  controllerRow = page
    .locator("tr")
    .filter({ hasText: "AUDITATS" })
    .filter({ hasText: "DSE335" })
    .first();
  await expect(controllerRow).toContainText("audit-fw-2");
  await controllerRow.getByRole("button", { name: "Desativar" }).click();
  controllerRow = page
    .locator("tr")
    .filter({ hasText: "AUDITATS" })
    .filter({ hasText: "DSE335" })
    .first();
  await expect(controllerRow).toContainText("Inativa");
  await expect(controllerRow.getByRole("button", { name: "Excluir" })).toBeEnabled();
  await acceptDialog(page, () => controllerRow.getByRole("button", { name: "Excluir" }).click());
  await expect(
    page.locator("tr").filter({ hasText: "AUDITATS" }).filter({ hasText: "DSE335" }),
  ).toHaveCount(0);
  await expect(page.getByText("Controladora removida.")).toBeVisible();

  let assetRow = page
    .locator("tr")
    .filter({ hasText: "AUDITATS" })
    .filter({ hasText: "Domínio v3" })
    .first();
  await expect(assetRow).toBeVisible();
  await expect(assetRow.getByRole("button", { name: "Desativar" })).toBeEnabled();
  await assetRow.getByRole("button", { name: "Desativar" }).click();
  await expect(page.getByText("Asset desativado.")).toBeVisible();
  assetRow = page
    .locator("tr")
    .filter({ hasText: "AUDITATS" })
    .filter({ hasText: "Domínio v3" })
    .first();
  await expect(assetRow).toContainText("Inativo");
  await expect(assetRow.getByRole("button", { name: "Excluir" })).toBeEnabled();
  await acceptDialog(page, () => assetRow.getByRole("button", { name: "Excluir" }).click());
  await expect(page.getByText("Asset removido.")).toBeVisible();
  await expect(page.locator("tr").filter({ hasText: "AUDITATS" })).toHaveCount(0);

  await page.goto("/p/backups");
  const before = await page.locator("tbody tr").count();
  await page.getByRole("button", { name: "Fazer backup agora" }).click();
  await expect.poll(() => page.locator("tbody tr").count()).toBeGreaterThan(before);
  const backupRow = page.locator("tbody tr").first();
  await expect(backupRow).toContainText("OK");
  await backupRow.getByRole("button", { name: "Baixar" }).click();
  await acceptDialog(page, () => backupRow.getByRole("button", { name: "Excluir" }).click());
});

test("cadastro registration-only salva e mantém comandos bloqueados", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  const nextReversePort = await page.evaluate(async () => {
    const response = await fetch("/api/generators", { credentials: "include" });
    const rows = (await response.json()) as Array<{ transport?: string; listenPort?: number }>;
    const used = rows
      .filter((item) => item.transport === "reverse_tcp")
      .map((item) => Number(item.listenPort || 0))
      .filter((value) => value >= 15001 && value <= 65535);
    return Math.max(15000, ...used) + 1;
  });
  await ensureApprovedModem(page, nextReversePort);
  await page.goto("/p/geradores");

  await page
    .getByRole("button", { name: /Adicionar gerador/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Nome do gerador").fill("Audit Registration Generator");
  await dialog.getByLabel("Unidade").fill("Audit Site");
  await dialog.getByLabel("Controladora").selectOption("InteliCompact NT MINT");
  await dialog.getByRole("button", { name: /Continuar/i }).click();

  await expect(dialog.getByText("Configuração automática", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: /Continuar/i }).click();
  await expect(
    dialog.getByText(/Cadastro técnico liberado|Cadastro liberado pelo fluxo/),
  ).toBeVisible();

  const finalSubmit = dialog.locator('button[type="submit"]');
  await expect(finalSubmit).toBeVisible();
  const finalLabel = (await finalSubmit.textContent())?.trim() || "";
  expect(finalLabel).not.toBe("Criar e configurar");
  if (finalLabel !== "Configurando…") {
    expect(["Cadastrar gerador", "Cadastrar para homologação"]).toContain(finalLabel);
    await finalSubmit.click();
  }
  await expect(dialog).not.toBeVisible({ timeout: 15_000 });

  await expect(page.getByText("Audit Registration Generator", { exact: true })).toBeVisible();

  const card = page
    .locator(".vref-card-frame")
    .filter({ hasText: "Audit Registration Generator" })
    .first();
  if (await card.count()) {
    const start = card.getByRole("button", { name: "START" });
    const stop = card.getByRole("button", { name: "STOP" });
    if (await start.count()) await expect(start).toBeDisabled();
    if (await stop.count()) await expect(stop).toBeDisabled();
  }

  const state = await page.evaluate(async () => {
    const response = await fetch("/api/generators", { credentials: "include" });
    const rows = (await response.json()) as Array<{
      name?: string;
      controllerPackLifecycle?: string | null;
      controlAvailable?: boolean;
    }>;
    return rows.find((item) => item.name === "Audit Registration Generator") ?? null;
  });
  expect(state).not.toBeNull();
  expect(state?.controlAvailable).not.toBe(true);
});
