import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const failures = [];

const dashboard = [
  read("src/components/scada/OverviewDashboard.tsx"),
  read("src/components/scada/overview-dashboard-summary.tsx"),
  read("src/components/scada/overview-dashboard-actions.tsx"),
].join("\n");
for (const marker of [
  "Resumo operacional",
  "Modems online",
  "Geradores online",
  "Alarmes abertos",
  "OS abertas",
  "Dados hoje",
  "Combustível médio",
  "Consumo de dados dos modems",
  "Disponibilidade",
  "Alarmes por prioridade",
  "Trabalho pendente",
]) {
  if (!dashboard.includes(marker))
    failures.push(`dashboard perdeu indicador de decisão: ${marker}`);
}
for (const forbidden of [
  "Rapid SCADA",
  "Controller Pack",
  "StatusPill",
  "toFixed(0)} rpm",
  "toFixed(1)} Hz",
]) {
  if (dashboard.includes(forbidden))
    failures.push(`dashboard voltou a expor detalhe técnico: ${forbidden}`);
}
if (dashboard.includes("generator.tag") && dashboard.includes("/p/geradores/$id")) {
  failures.push("dashboard voltou a listar geradores individualmente");
}

const dashboardModel = read("src/components/scada/overview-dashboard-model.ts");
for (const marker of ["fuel_level", "todayBytes", "monthBytes", "friendlyAlarmMessage"]) {
  if (!dashboardModel.includes(marker))
    failures.push(`modelo de decisão perdeu fonte real: ${marker}`);
}

const board = read("src/components/generators/GeneratorsBoard.tsx");
const triggers = [...board.matchAll(/<DropdownMenuTrigger\b/g)].length;
if (triggers !== 2)
  failures.push(`toolbar de geradores deve ter dois seletores; encontrou ${triggers}`);
for (const marker of [
  "Visualização",
  "Filtrar por status",
  'label: "Vertical"',
  'label: "Compacto"',
  'label: "Lista"',
  "<CompactCard",
  "<GeneratorTable",
  "ResizeObserver",
  "minimumWidth",
  "minimumHeight",
  "columns * rows",
  "compact-generator-grid",
]) {
  if (!board.includes(marker))
    failures.push(`toolbar/modos de geradores perdeu seletor ou contrato responsivo: ${marker}`);
}
for (const forbidden of ["Cards verticais", "Cards compactos"]) {
  if (board.includes(forbidden))
    failures.push(`toolbar voltou ao grupo de botões antigo: ${forbidden}`);
}
if (!board.includes('useState<GenStatus | "todos">("todos")')) {
  failures.push("board deixou de abrir mostrando toda a frota, inclusive equipamentos offline");
}
if (board.includes('import "./operator-card-refinement.css"')) {
  failures.push("board voltou a carregar CSS concorrente do card vertical");
}

const compact = read("src/components/generators/CompactCard.tsx");
for (const marker of [
  "controllerImageSrc",
  "controller-image-area",
  'label="Endpoint"',
  'label="Bateria"',
  'label="Frequência"',
  'label="Tempo operação"',
  'label="Manutenção"',
  'label="Latência"',
  "Abrir gerador",
]) {
  if (!compact.includes(marker)) failures.push(`card compacto clássico perdeu conteúdo: ${marker}`);
}
for (const forbidden of [
  "CompactPowerGauge",
  "compact-flow-line",
  "compact-command",
  "rcApi.generators.command",
  "useIndustrialCommandGuard",
]) {
  if (compact.includes(forbidden))
    failures.push(`card compacto voltou ao redesenho operacional rejeitado: ${forbidden}`);
}

const detail = read("src/components/generators/GeneratorDetailScreen.tsx");
const detailTop = read("src/components/generators/detail/GeneratorDetailProfessionalTop.tsx");
const detailLower = read("src/components/generators/detail/GeneratorDetailProfessionalLower.tsx");
const detailModel = read("src/components/generators/detail/generator-detail-model.ts");
const detailControlSurface = `${detail}
${detailTop}
${detailLower}
${detailModel}`;
for (const marker of [
  "gen.capabilities?.[action] === true",
  "!gen.telemetryStale",
  'gen.status !== "offline"',
  'data-command="manual"',
  'data-command="auto"',
  'data-command="test"',
]) {
  if (!detailControlSurface.includes(marker)) {
    failures.push(`controle perdeu decisão autoritativa/estado seguro: ${marker}`);
  }
}
for (const forbidden of [
  "homologatedIg200",
  'normalizedController === "inteligen 200"',
  "gen.capabilities?.start === true ||",
  "gen.capabilities?.stop === true ||",
  'formatMetric(model.fuel, "%"',
  'unit="bar"',
  '"Off - Ready"',
  "Em carga / rotação",
  ">= 80",
  ">= 20",
]) {
  if (detailControlSurface.includes(forbidden)) {
    failures.push(`detalhe voltou a inferir estado/unidade industrial localmente: ${forbidden}`);
  }
}

const table = read("src/components/generators/GeneratorTable.tsx");
for (const marker of [
  '"RPM"',
  '"Hz"',
  '"kW"',
  '"PF"',
  '"Óleo"',
  '"Coolant"',
  '"Combustível"',
  '"Alternador"',
  '"MCB"',
  '"GCB"',
  '"G L1-N"',
]) {
  if (!table.includes(marker)) failures.push(`lista perdeu telemetria operacional: ${marker}`);
}

const metrics = read("src/components/generators/generator-metrics.ts");
for (const marker of [
  "if (gen.telemetryStale) return null",
  "gen.definedMetrics ?? gen.availableMetrics",
]) {
  if (!metrics.includes(marker)) {
    failures.push(`telemetria perdeu proteção contra exibição de valor obsoleto: ${marker}`);
  }
}

const health = read("src/components/generators/generator-health.ts");
for (const marker of [
  "toneFromLimit",
  "percentFromLimit",
  "gen.metricLimits",
  "visibleMeterPercent",
  "fuelCapacity",
  "coolantUnit",
]) {
  if (!health.includes(marker)) {
    failures.push(`semáforo compartilhado perdeu regra segura: ${marker}`);
  }
}
for (const forbidden of [
  "oilTone(",
  "coolantTone(",
  "fuelTone(",
  "alternatorTone(",
  "maintenanceTone(",
  "value < 2",
  "value > 105",
  ": 1000",
  "displayMax: 10,",
  "displayMin: -40,",
  "displayMax: 30,",
  "visualTone(",
]) {
  if (health.includes(forbidden)) {
    failures.push(`semáforo compartilhado voltou a inferir limite industrial: ${forbidden}`);
  }
}

const reporting = read("backend/app/reporting.py");
for (const forbidden of ['"Combustível %"']) {
  if (reporting.includes(forbidden)) {
    failures.push(`relatório voltou a presumir unidade de combustível: ${forbidden}`);
  }
}
for (const marker of ['"Unidade combustível"', "telemetryStale", "definedMetrics"]) {
  if (!reporting.includes(marker)) {
    failures.push(`relatório perdeu verdade operacional: ${marker}`);
  }
}

const rapidBackend = read("backend/app/rapid.py");
const industrialStore = read("backend/app/industrial_store.py");
for (const source of [
  ["dashboard Rapid", rapidBackend],
  ["industrial store", industrialStore],
]) {
  if (!source[1].includes("_current_metric_keys")) {
    failures.push(`${source[0]} perdeu proteção de métrica atual`);
  }
}

const cardCss = read("src/components/generators/vertical-card/vertical-reference-card.css");
for (const marker of [
  ".generator-vertical-grid.generator-reference-card-grid",
  "grid-template-columns: repeat(var(--vref-columns",
  "grid-auto-rows: var(--vref-card-height",
  ".vref-card",
  "height: 100%",
  "container-type: size",
  "@container vref",
  "@container vref (max-height: 780px)",
]) {
  if (!cardCss.includes(marker))
    failures.push(`layout vertical legível perdeu regra de encaixe: ${marker}`);
}

if (failures.length) {
  console.error("Decision UI check falhou:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(
  "Decision UI check OK: dashboard, card vertical operacional, compacto clássico, lista completa e limites industriais homologáveis validados.",
);
