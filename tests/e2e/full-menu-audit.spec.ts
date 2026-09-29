import { expect, test, type Page, type Response } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { navGroups } from "../../frontend/src/data/nav";

const adminEmail = process.env.E2E_ADMIN_EMAIL || "";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(adminEmail);
  await page.locator('input[aria-label="Senha"]').fill(adminPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

test("auditoria completa de menus e controles", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page);

  const report: Array<{
    group: string;
    label: string;
    slug?: string;
    target: string;
    title: string;
    controls: unknown;
    pageErrors: string[];
    consoleErrors: string[];
    apiFailures: string[];
  }> = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const apiFailures: string[] = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("response", (response: Response) => {
    const url = response.url();
    if (url.includes("/api/") && response.status() >= 400) {
      apiFailures.push(`${response.request().method()} ${url} -> ${response.status()}`);
    }
  });

  const items = navGroups.flatMap((group) =>
    group.items.map((item) => ({ group: group.title, ...item })),
  );

  for (const item of items) {
    const target = item.slug ? `/p/${item.slug}` : "/";
    const beforePageErrors = pageErrors.length;
    const beforeConsoleErrors = consoleErrors.length;
    const beforeApiFailures = apiFailures.length;

    const response = await page.goto(target, { waitUntil: "networkidle" });
    expect(response, `${target}: sem resposta`).not.toBeNull();
    expect(response!.status(), `${target}: HTTP ${response!.status()}`).toBeLessThan(400);
    expect(page.url(), `${target}: redirecionou para login`).not.toMatch(/\/login$/);

    const bodyText = (await page.locator("body").innerText()).slice(0, 50_000);
    expect(bodyText, `${target}: módulo inexistente`).not.toMatch(/Módulo não encontrado/i);
    expect(bodyText, `${target}: erro visível`).not.toMatch(
      /application error|internal server error|unexpected application error/i,
    );

    const controls = await page.locator("body").evaluate(() => {
      const visible = (el: Element) => {
        const node = el as HTMLElement;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || "1") > 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const text = (el: Element) =>
        (el.getAttribute("aria-label") || el.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 140);

      return {
        forms: Array.from(document.querySelectorAll("form"))
          .filter(visible)
          .map((form) => ({
            text: text(form),
            inputs: Array.from(form.querySelectorAll("input"))
              .filter(visible)
              .map((el) => ({
                type: (el as HTMLInputElement).type,
                name: (el as HTMLInputElement).name,
                aria: el.getAttribute("aria-label"),
                placeholder: el.getAttribute("placeholder"),
                disabled: (el as HTMLInputElement).disabled,
              })),
            selects: Array.from(form.querySelectorAll("select"))
              .filter(visible)
              .map((el) => ({
                name: (el as HTMLSelectElement).name,
                aria: el.getAttribute("aria-label"),
                disabled: (el as HTMLSelectElement).disabled,
              })),
            buttons: Array.from(form.querySelectorAll("button"))
              .filter(visible)
              .map((el) => ({
                text: text(el),
                type: (el as HTMLButtonElement).type,
                disabled: (el as HTMLButtonElement).disabled,
              })),
          })),
        buttons: Array.from(document.querySelectorAll("button"))
          .filter(visible)
          .map((el) => ({ text: text(el), disabled: (el as HTMLButtonElement).disabled }))
          .filter((x) => x.text),
        inputs: Array.from(document.querySelectorAll("input"))
          .filter(visible)
          .map((el) => ({
            type: (el as HTMLInputElement).type,
            name: (el as HTMLInputElement).name,
            aria: el.getAttribute("aria-label"),
            placeholder: el.getAttribute("placeholder"),
            disabled: (el as HTMLInputElement).disabled,
          })),
        selects: Array.from(document.querySelectorAll("select"))
          .filter(visible)
          .map((el) => ({
            name: (el as HTMLSelectElement).name,
            aria: el.getAttribute("aria-label"),
            disabled: (el as HTMLSelectElement).disabled,
          })),
        links: Array.from(document.querySelectorAll("a"))
          .filter(visible)
          .map((el) => ({ text: text(el), href: el.getAttribute("href") }))
          .filter((x) => x.text || x.href),
      };
    });

    report.push({
      group: item.group,
      label: item.label,
      slug: item.slug,
      target,
      title: await page.title(),
      controls,
      pageErrors: pageErrors.slice(beforePageErrors),
      consoleErrors: consoleErrors.slice(beforeConsoleErrors),
      apiFailures: apiFailures.slice(beforeApiFailures),
    });
  }

  writeFileSync("/tmp/rc-ui-audit.json", JSON.stringify(report, null, 2));

  const routeFailures = report.flatMap((row) => [
    ...row.pageErrors.map((x: string) => `${row.target} pageerror: ${x}`),
    ...row.consoleErrors.map((x: string) => `${row.target} console: ${x}`),
    ...row.apiFailures.map((x: string) => `${row.target} api: ${x}`),
  ]);
  expect(routeFailures, routeFailures.join("\n")).toEqual([]);
});
