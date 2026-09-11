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
const navGroupsSource = nav;
const visibleNavSlugs = [...navGroupsSource.matchAll(/slug:\s*"([^"]*)"/g)].map(
  (match) => match[1],
);
const navSlugs = visibleNavSlugs;
if (visibleNavSlugs.length < 50) {
  failures.push(
    `menu deve expor todas as superfícies implementadas; encontrou ${visibleNavSlugs.length}`,
  );
}
const requiredTechnicalMenus = [
  "tendencias",
  "canais",
  "tags",
  "templates",
  "rapid-scada",
  "diagnostico",
  "fabricantes",
  "lib-controladoras",
  "protocolos",
  "controller-packs",
  "laboratorio",
  "api",
  "webhooks",
  "email",
  "whatsapp",
  "erp-bms",
];
for (const slug of requiredTechnicalMenus) {
  if (!visibleNavSlugs.includes(slug)) failures.push(`menu técnico continua oculto: ${slug}`);
}
if (new Set(navSlugs).size !== navSlugs.length) failures.push("menu contém slug duplicado");

const specialRoutes = new Set(["", "geradores"]);
const registryBody = registry.split("export const screens", 2)[1] ?? "";
const registryKeys = new Set([
  ...[...registryBody.matchAll(/^\s*"([^"]+)"\s*:/gm)].map((match) => match[1]),
  ...[...registryBody.matchAll(/^\s*([a-zA-Z][\w-]*)\s*:/gm)].map((match) => match[1]),
]);
for (const slug of navSlugs) {
  if (!specialRoutes.has(slug) && !registryKeys.has(slug)) {
    failures.push(`menu sem tela no registry: ${slug}`);
  }
}
for (const slug of registryKeys) {
  if (!navSlugs.includes(slug)) failures.push(`tela implementada sem menu visível: ${slug}`);
}
if (!existsSync(join(root, "src/routes/index.tsx"))) {
  failures.push("rota própria da Visão Geral ausente");
}
if (!existsSync(join(root, "src/routes/p.$slug.tsx"))) {
  failures.push("rota genérica /p/$slug ausente");
}
if (!existsSync(join(root, "src/routes/p.geradores.$id.tsx"))) {
  failures.push("rota de detalhe de gerador ausente");
}

const rootRoute = read("src/routes/__root.tsx");
const rootComponent =
  rootRoute.split("function RootComponent()", 2)[1]?.split("function AppShell()", 1)[0] ?? "";
const appShell = rootRoute.split("function AppShell()", 2)[1] ?? "";
if (
  rootComponent.includes("<GeneratorsProvider>") ||
  rootComponent.includes("<ScadaOpsProvider>")
) {
  failures.push("providers autenticados voltaram a montar antes da confirmação de sessão");
}
if (!appShell.includes("<GeneratorsProvider>") || !appShell.includes("<ScadaOpsProvider>")) {
  failures.push("AppShell autenticado perdeu providers de geradores/operação");
}
if (
  appShell.indexOf("if (!user)") < 0 ||
  appShell.indexOf("<GeneratorsProvider>") < appShell.indexOf("if (!user)")
) {
  failures.push("providers de dados precisam montar somente depois do guard `if (!user)`");
}

const generatorEdit = read("src/components/generators/GeneratorEditDialog.tsx");
if (generatorEdit.includes("useEffect(() =>") || generatorEdit.includes("[generator, open]")) {
  failures.push("edição de gerador voltou a ressincronizar campos durante polling");
}
for (const marker of ["handleOpenChange", "resetFieldsFromGenerator", "max-h-[90dvh]"]) {
  if (!generatorEdit.includes(marker))
    failures.push(`edição de gerador perdeu proteção: ${marker}`);
}

const rootShell = read("src/routes/__root.tsx");
const screenKit = read("src/components/scada/kit.tsx");
const generatorTable = read("src/components/generators/GeneratorTable.tsx");
if (
  !rootShell.includes("flex h-dvh w-full overflow-hidden") ||
  !rootShell.includes("flex h-dvh min-w-0 flex-1 flex-col overflow-hidden")
) {
  failures.push("shell voltou a permitir scroll vertical concorrente");
}
if (!screenKit.includes("overflow-y-auto overscroll-contain")) {
  failures.push("ScreenBody perdeu o scroll vertical único por tela");
}
if (generatorTable.includes("hidden h-full overflow-auto")) {
  failures.push("lista de geradores voltou a criar scroll vertical aninhado");
}

// Auditoria de shell/navegação: uma única rolagem vertical por página composta,
// retry global respeitando permissões e nomenclatura profissional da interface.
if (!nav.includes('title: "Sistema"') || nav.includes('title: "Administração"')) {
  failures.push('grupo administrativo visível deve permanecer nomeado como "Sistema"');
}
if (!rootShell.includes('if (can("manageUsers")) void refreshUsers()')) {
  failures.push("retry global voltou a consultar usuários sem verificar permissão");
}
const controllersLifecycle = read("src/components/scada/ControllersLifecycleScreen.tsx");
const controllersV3 = read("src/components/scada/ControllersV3Screen.tsx");
if (
  !controllersLifecycle.includes("<ControllersV3Screen embedded />") ||
  (controllersLifecycle.match(/<ScreenBody/g) ?? []).length !== 1 ||
  !controllersV3.includes("embedded = false") ||
  !controllersV3.includes("return embedded ? content : <ScreenBody>{content}</ScreenBody>")
) {
  failures.push("Controladoras voltou a criar duas áreas verticais de rolagem");
}
const maintenanceHub = read("src/components/scada/MaintenanceHubScreen.tsx");
const maintenanceV3 = read("src/components/scada/IndustrialMaintenanceScreen.tsx");
if (
  !maintenanceHub.includes("<MaintenanceV3Screen embedded />") ||
  (maintenanceHub.match(/<ScreenBody/g) ?? []).length !== 1 ||
  !maintenanceV3.includes("embedded = false") ||
  !maintenanceV3.includes("return embedded ? content : <ScreenBody>{content}</ScreenBody>")
) {
  failures.push("Manutenção voltou a criar duas áreas verticais de rolagem");
}

const loginScreen = read("src/components/auth/LoginScreen.tsx");
for (const marker of ["E-mail", 'type="email"', 'autoComplete="username"']) {
  if (!loginScreen.includes(marker)) failures.push(`login perdeu semântica de e-mail: ${marker}`);
}

// Guardas contra envio duplicado e contra fechar formulários de edição após erro.
for (const [file, markers] of [
  [
    "src/components/scada/ControllersLifecycleScreen.tsx",
    [
      "const [busy, setBusy]",
      "if (busy) return false",
      "if (saved) setEditingController(null)",
      "if (saved) setEditingConnection(null)",
      "disabled={busy}",
    ],
  ],
  [
    "src/components/scada/IndustrialMaintenanceScreen.tsx",
    ["const [busy, setBusy]", "disabled={busy}"],
  ],
  ["src/components/scada/ErpBmsLifecycleScreen.tsx", ["const [busy, setBusy]", "disabled={busy}"]],
  [
    "src/components/scada/IndustrialEscalationScreen.tsx",
    ["const [busy, setBusy]", "disabled={busy}"],
  ],
  [
    "src/components/scada/ControllersV3Screen.tsx",
    ["const [linking, setLinking]", "disabled={linking}"],
  ],
  [
    "src/components/scada/UsersV3Screen.tsx",
    ["const [busy, setBusy]", "disabled={busy}", 'autoComplete="new-password"'],
  ],
  [
    "src/components/scada/IntegrationsV3Screens.tsx",
    ["if (busy) return", "disabled={!status?.configured || busy}"],
  ],
]) {
  const source = read(file);
  for (const marker of markers) {
    if (!source.includes(marker)) failures.push(`${file} perdeu proteção de mutação: ${marker}`);
  }
}

const generatorBoard = read("src/components/generators/GeneratorsBoard.tsx");
for (const marker of [
  "error",
  "refresh",
  "Falha ao carregar geradores",
  "Nenhum gerador cadastrado",
]) {
  if (!generatorBoard.includes(marker)) {
    failures.push(`tela de geradores perdeu diagnóstico obrigatório: ${marker}`);
  }
}

const overview = read("src/components/scada/OverviewDashboard.tsx");
for (const marker of ["generatorsError", "refreshGenerators", "retryAll"]) {
  if (!overview.includes(marker)) {
    failures.push(`dashboard voltou a mascarar falha do parque: ${marker}`);
  }
}

const api = read("src/lib/api.ts");
const generatorsStart = api.indexOf("\n  generators: {");
const generatorsEnd = generatorsStart >= 0 ? api.indexOf("\n  audit:", generatorsStart) : -1;
if (generatorsStart < 0 || generatorsEnd < 0) {
  failures.push("cliente frontend perdeu bloco rcApi.generators esperado");
} else {
  const generatorsApi = api.slice(generatorsStart, generatorsEnd);
  if (/\bremove\s*:/.test(generatorsApi) || /method:\s*["']DELETE["']/.test(generatorsApi)) {
    failures.push("cliente frontend voltou a expor DELETE direto de gerador");
  }
}
const deleteButton = read("src/components/generators/DeleteGeneratorButton.tsx");
if (!deleteButton.includes("industrialApi.lifecycle.retire")) {
  failures.push("retirada de gerador não usa lifecycle seguro");
}

const registerGenerator = read("src/components/generators/RegisterGeneratorButton.tsx");
for (const marker of [
  'onboardingMode === "lab_read_only"',
  "selectedController?.registerable",
  "LAB (somente leitura)",
  "Cadastrar para homologação",
]) {
  if (!registerGenerator.includes(marker)) {
    failures.push(`cadastro de controladora LAB perdeu contrato seguro: ${marker}`);
  }
}
if (!registerGenerator.includes("if (selectedController?.provisionable)")) {
  failures.push("cadastro LAB deixou de separar criação e provisionamento industrial");
}

const connectivity = read("src/components/scada/equip-connectivity.tsx");
for (const marker of [
  "statusFresh",
  "sessions",
  "remoteIp",
  "todayBytes",
  "monthBytes",
  "reconnections",
  "timeouts",
]) {
  if (!connectivity.includes(marker)) {
    failures.push(`Conectividade física perdeu marcador obrigatório: ${marker}`);
  }
}
const bridge = read("backend/app/bridge.py");
for (const marker of ["bytes_rx", "bytes_tx", "last_rx_at", "last_tx_at"]) {
  if (!bridge.includes(marker)) {
    failures.push(`bridge perdeu contador físico obrigatório: ${marker}`);
  }
}
const equipmentBarrel = read("src/components/scada/equip-auto.tsx");
if (!equipmentBarrel.includes('from "./equip-connectivity"')) {
  failures.push("equip-auto deixou de exportar as telas de conectividade física");
}

const sixCardCss = read("src/components/generators/generator-six-card.css");
for (const selector of [
  ".comap-engine.opacity-65 .engine-value::after",
  '.kw-gauge-svg[aria-label="Potência indisponível"] + .kw-gauge-value::after',
]) {
  if (sixCardCss.includes(selector)) {
    failures.push(`card voltou a substituir telemetria indisponível por valor visual: ${selector}`);
  }
}

const scadaLib = read("src/components/scada/scada-lib.tsx");
const scadaLibEffects = [...scadaLib.matchAll(/\buseEffect\s*\(/g)].length;
if (scadaLibEffects !== 1) {
  failures.push(
    `scada-lib deve manter exatamente o useEffect mount-only revisado; encontrou ${scadaLibEffects}`,
  );
}
if (!scadaLib.includes("function useRemote<T>(loader: () => Promise<T>, initial: T)")) {
  failures.push("scada-lib perdeu o helper useRemote mount-only revisado");
}

const automation = read("backend/app/automation_engine.py");
if (!automation.includes('ALLOWED_ACTIONS = {"notify", "work_order"}')) {
  failures.push("allowlist de automação não industrial foi alterada");
}
if (
  !automation.includes(
    'ALLOWED_TRIGGERS = {"generator_offline", "generator_online", "generator_alert"}',
  )
) {
  failures.push("allowlist de gatilhos foi alterada");
}

for (const testFile of [
  "backend/tests/session_inventory.py",
  "backend/tests/rapid_overlay_resilience.py",
]) {
  if (!existsSync(join(root, testFile))) {
    failures.push(`teste de homologação pós-VM ausente: ${testFile}`);
  }
}

const rapid = read("backend/app/rapid.py");
for (const marker of [
  "def _overlay_generators",
  "math.isfinite",
  "Telemetria Rapid indisponível",
]) {
  if (!rapid.includes(marker)) {
    failures.push(`overlay Rapid perdeu proteção de inventário: ${marker}`);
  }
}

const bridgeService = read("ops/systemd/rc-geradores-bridge.service");
if (!bridgeService.includes("-m app.bridge_runtime")) {
  failures.push("systemd da bridge não usa bridge_runtime canônico");
}
for (const file of walk(join(root, "ops"))) {
  if (!/\.(sh|service)$/.test(file)) continue;
  const source = readFileSync(file, "utf8");
  if (/\-m\s+app\.bridge(?:\s|$)/.test(source)) {
    failures.push(`entrada legacy app.bridge encontrada em ${relative(root, file)}`);
  }
}

const backup = read("backend/app/backup_manager.py");
for (const marker of ["PRAGMA quick_check", "_pre_restore_snapshot", "_rollback_database"]) {
  if (!backup.includes(marker)) failures.push(`restore sem proteção obrigatória: ${marker}`);
}

const opsStore = read("backend/app/ops_store.py");
if (opsStore.includes('data.get("tech") or "Equipe campo"')) {
  failures.push("ordem de serviço voltou a inventar responsável padrão");
}

const operationalMap = read("src/components/scada/OperationalMap.tsx");
if (operationalMap.includes("Number(g.load || 0)")) {
  failures.push("mapa voltou a converter potência ausente em zero");
}
if (!operationalMap.includes("load: measuredLoad.length")) {
  failures.push("mapa perdeu distinção entre potência medida e N/D");
}

const generatorCardCss = read("src/components/generators/generator-six-card.css");
if (generatorCardCss.includes(".engine-status-block .comap-engine:last-child")) {
  failures.push("card compacto voltou a ocultar o horímetro");
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
  if (!existsSync(join(root, "src/assets/industrial", asset))) {
    failures.push(`asset industrial selecionado ausente: ${asset}`);
  }
}

if (failures.length) {
  console.error("Functional surfaces check falhou:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(
  `Functional surfaces check OK: ${visibleNavSlugs.length} menus visíveis, superfícies técnicas reativadas, autenticação, lifecycles e guardrails críticos conferidos.`,
);
