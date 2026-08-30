import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const failures = [];
const read = (path) => readFileSync(join(root, path), "utf8");

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const nav = read("src/data/nav.ts");
const registry = read("src/components/scada/registry.ts");
const navSlugs = [...nav.matchAll(/slug:\s*"([^"]*)"/g)].map((match) => match[1]);
if (navSlugs.length !== 54)
  failures.push(`menu deve ter exatamente 54 entradas; encontrou ${navSlugs.length}`);
if (new Set(navSlugs).size !== navSlugs.length) failures.push("menu contém slug duplicado");

const specialRoutes = new Set(["", "geradores"]);
const registryBody = registry.split("export const screens", 2)[1] ?? "";
const registryKeys = new Set([
  ...[...registryBody.matchAll(/^\s*"([^"]+)"\s*:/gm)].map((match) => match[1]),
  ...[...registryBody.matchAll(/^\s*([a-zA-Z][\w-]*)\s*:/gm)].map((match) => match[1]),
]);
for (const slug of navSlugs) {
  if (!specialRoutes.has(slug) && !registryKeys.has(slug))
    failures.push(`menu sem tela no registry: ${slug}`);
}
if (!existsSync(join(root, "src/routes/index.tsx")))
  failures.push("rota própria da Visão Geral ausente");
if (!existsSync(join(root, "src/routes/p.$slug.tsx")))
  failures.push("rota genérica /p/$slug ausente");
if (!existsSync(join(root, "src/routes/p.geradores.$id.tsx")))
  failures.push("rota de detalhe de gerador ausente");

const rootRoute = read("src/routes/__root.tsx");
const rootComponent = rootRoute.split("function RootComponent()", 2)[1]?.split("function AppShell()", 1)[0] ?? "";
const appShell = rootRoute.split("function AppShell()", 2)[1] ?? "";
if (rootComponent.includes("<GeneratorsProvider>") || rootComponent.includes("<ScadaOpsProvider>"))
  failures.push("providers autenticados voltaram a montar antes da confirmação de sessão");
if (!appShell.includes("<GeneratorsProvider>") || !appShell.includes("<ScadaOpsProvider>"))
  failures.push("AppShell autenticado perdeu providers de geradores/operação");
if (appShell.indexOf("if (!user)") < 0 || appShell.indexOf("<GeneratorsProvider>") < appShell.indexOf("if (!user)"))
  failures.push("providers de dados precisam montar somente depois do guard `if (!user)`");

const generatorBoard = read("src/components/generators/GeneratorsBoard.tsx");
for (const marker of ["error", "refresh", "Falha ao carregar geradores", "Nenhum gerador cadastrado"])
  if (!generatorBoard.includes(marker))
    failures.push(`tela de geradores perdeu diagnóstico obrigatório: ${marker}`);
const overview = read("src/components/scada/OverviewDashboard.tsx");
for (const marker of ["generatorsError", "refreshGenerators", "Falha ao carregar o parque"])
  if (!overview.includes(marker))
    failures.push(`dashboard voltou a mascarar falha do parque: ${marker}`);

const api = read("src/lib/api.ts");
const generatorsStart = api.indexOf("\n  generators: {");
const generatorsEnd = generatorsStart >= 0 ? api.indexOf("\n  audit:", generatorsStart) : -1;
if (generatorsStart < 0 || generatorsEnd < 0) {
  failures.push("cliente frontend perdeu bloco rcApi.generators esperado");
} else {
  const generatorsApi = api.slice(generatorsStart, generatorsEnd);
  if (/\bremove\s*:/.test(generatorsApi) || /method:\s*["']DELETE["']/.test(generatorsApi))
    failures.push("cliente frontend voltou a expor DELETE direto de gerador");
}
const deleteButton = read("src/components/generators/DeleteGeneratorButton.tsx");
if (!deleteButton.includes("industrialApi.lifecycle.retire"))
  failures.push("retirada de gerador não usa lifecycle seguro");

const connectivity = read("src/components/scada/equip-connectivity.tsx");
for (const marker of [
  "statusFresh",
  "sessions",
  "remoteIp",
  "bytesRx",
  "reconnections",
  "timeouts",
]) {
  if (!connectivity.includes(marker))
    failures.push(`Conectividade física perdeu marcador obrigatório: ${marker}`);
}
const equipmentBarrel = read("src/components/scada/equip-auto.tsx");
if (!equipmentBarrel.includes('from "./equip-connectivity"'))
  failures.push("equip-auto deixou de exportar as telas de conectividade física");

const scadaLib = read("src/components/scada/scada-lib.tsx");
const scadaLibEffects = [...scadaLib.matchAll(/\buseEffect\s*\(/g)].length;
if (scadaLibEffects !== 1)
  failures.push(
    `scada-lib deve manter exatamente o useEffect mount-only revisado; encontrou ${scadaLibEffects}`,
  );
if (!scadaLib.includes("function useRemote<T>(loader: () => Promise<T>, initial: T)"))
  failures.push("scada-lib perdeu o helper useRemote mount-only revisado");

const automation = read("backend/app/automation_engine.py");
if (!automation.includes('ALLOWED_ACTIONS = {"notify", "work_order"}'))
  failures.push("allowlist de automação não industrial foi alterada");
if (
  !automation.includes(
    'ALLOWED_TRIGGERS = {"generator_offline", "generator_online", "generator_alert"}',
  )
)
  failures.push("allowlist de gatilhos foi alterada");

for (const testFile of [
  "backend/tests/session_inventory.py",
  "backend/tests/rapid_overlay_resilience.py",
]) {
  if (!existsSync(join(root, testFile))) failures.push(`teste de homologação pós-VM ausente: ${testFile}`);
}

const rapid = read("backend/app/rapid.py");
for (const marker of ["def _overlay_generators", "math.isfinite", "Telemetria Rapid indisponível"])
  if (!rapid.includes(marker)) failures.push(`overlay Rapid perdeu proteção de inventário: ${marker}`);

const bridgeService = read("ops/systemd/rc-geradores-bridge.service");
if (!bridgeService.includes("-m app.bridge_runtime"))
  failures.push("systemd da bridge não usa bridge_runtime canônico");
for (const file of walk(join(root, "ops"))) {
  if (!/\.(sh|service)$/.test(file)) continue;
  const source = readFileSync(file, "utf8");
  if (/\-m\s+app\.bridge(?:\s|$)/.test(source))
    failures.push(`entrada legacy app.bridge encontrada em ${relative(root, file)}`);
}

const backup = read("backend/app/backup_manager.py");
for (const marker of ["PRAGMA quick_check", "_pre_restore_snapshot", "_rollback_database"]) {
  if (!backup.includes(marker)) failures.push(`restore sem proteção obrigatória: ${marker}`);
}

const forbidden = [
  ["fuelLevel < 40", "limiar genérico inventado de combustível"],
  ["battery < 12", "limiar genérico inventado de bateria"],
  ["maintenance < 80", "limiar genérico inventado de manutenção"],
  ["batt < 12", "limiar genérico inventado de bateria"],
];
for (const file of walk(join(root, "src"))) {
  if (!/\.(ts|tsx)$/.test(file)) continue;
  const source = readFileSync(file, "utf8");
  for (const [pattern, label] of forbidden) {
    if (source.includes(pattern)) failures.push(`${label}: ${relative(root, file)}`);
  }
}

for (const asset of [
  "generator.svg",
  "batteries.svg",
  "consumption.svg",
  "power-transformer.svg",
  "solar-panels.svg",
]) {
  if (!existsSync(join(root, "src/assets/industrial", asset)))
    failures.push(`asset industrial selecionado ausente: ${asset}`);
}

if (failures.length) {
  console.error("Functional surfaces check falhou:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(
  "Functional surfaces check OK: 54 menus, rotas, autenticação, lifecycles e guardrails críticos conferidos.",
);
