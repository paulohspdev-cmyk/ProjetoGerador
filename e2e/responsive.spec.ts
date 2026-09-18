import { test } from "@playwright/test";
import fs from "node:fs";

const adminEmail = process.env.E2E_ADMIN_EMAIL || "";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "";

const navText = fs.readFileSync(process.cwd() + "/src/data/nav.ts", "utf8");
const slugs = [...new Set([...navText.matchAll(/slug:\s*"([^"]*)"/g)].map((match) => match[1]))];
const routes = slugs.map((slug) => (slug === "" ? "/" : "/p/" + slug));

const viewports = [
  { name: "mobile-360", width: 360, height: 800 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-430", width: 430, height: 932 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "notebook", width: 1366, height: 768 },
  { name: "desktop-fhd", width: 1920, height: 1080 },
  { name: "tv-4k", width: 3840, height: 2160 },
];

test("auditoria responsiva de todas as rotas", async ({ browser, baseURL }) => {
  test.setTimeout(300000);
  const result: any = { routes: routes.length, summary: {}, consoleErrors: [] };

  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        result.consoleErrors.push({
          viewport: vp.name,
          url: page.url(),
          text: msg.text().slice(0, 220),
        });
      }
    });

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(adminEmail);
    await page.locator('input[aria-label="Senha"]').fill(adminPassword);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL((url) => !url.pathname.endsWith("/login"));

    const rows: any[] = [];
    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(40);
      const metrics = await page.evaluate(() => {
        const root = document.documentElement;
        const body = document.body;
        const visible = (element: Element) => {
          const el = element as HTMLElement;
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        };
        const interactive = [...document.querySelectorAll('button,a,input,select,textarea,[role="button"]')].filter(visible);
        const smallTouch = interactive.filter((element) => {
          const rect = (element as HTMLElement).getBoundingClientRect();
          return rect.width < 40 || rect.height < 40;
        }).length;
        const verySmallTouch = interactive.filter((element) => {
          const rect = (element as HTMLElement).getBoundingClientRect();
          return rect.width < 24 || rect.height < 24;
        }).length;
        const horizontalScrollers = [...document.querySelectorAll("*")].filter((element) => {
          const el = element as HTMLElement;
          const style = getComputedStyle(el);
          return visible(el) && ["auto", "scroll"].includes(style.overflowX) && el.scrollWidth > el.clientWidth + 2;
        }).length;
        const minText = [...document.querySelectorAll("body *")].filter(visible).reduce((min, element) => {
          const size = parseFloat(getComputedStyle(element as HTMLElement).fontSize || "999");
          return size > 0 ? Math.min(min, size) : min;
        }, 999);
        return {
          overflow: Math.max(root.scrollWidth, body?.scrollWidth || 0) - innerWidth,
          smallTouch,
          verySmallTouch,
          horizontalScrollers,
          minText: minText === 999 ? null : minText,
        };
      });
      rows.push({ route, ...metrics });
    }

    result.summary[vp.name] = {
      routes: rows.length,
      globalOverflowRoutes: rows.filter((row) => row.overflow > 1),
      maxHorizontalScrollers: Math.max(...rows.map((row) => row.horizontalScrollers)),
      maxSmallTouch: Math.max(...rows.map((row) => row.smallTouch)),
      maxVerySmallTouch: Math.max(...rows.map((row) => row.verySmallTouch)),
      minTextPx: Math.min(...rows.map((row) => row.minText ?? 999)),
      worstSmallTouchRoutes: [...rows].sort((a,b) => b.smallTouch - a.smallTouch).slice(0,8),
    };

    await context.close();
  }

  console.log("RESPONSIVE_AUDIT_JSON=" + JSON.stringify(result));
});
