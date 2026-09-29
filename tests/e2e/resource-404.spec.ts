import { expect, test } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL || "";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "";

test("identifica recursos quebrados da tela inicial", async ({ page }) => {
  const failures: string[] = [];
  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      !(response.status() === 401 && response.url().includes("/api/auth/me"))
    )
      failures.push(`${response.status()} ${response.url()}`);
  });
  page.on("requestfailed", (request) => {
    failures.push(`FAILED ${request.url()} ${request.failure()?.errorText ?? ""}`);
  });
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(adminEmail);
  await page.locator('input[aria-label="Senha"]').fill(adminPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  await page.goto("/", { waitUntil: "networkidle" });
  console.log("RESOURCE_FAILURES", JSON.stringify(failures));
  expect(failures, failures.join("\n")).toEqual([]);
});
