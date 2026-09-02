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
  "Painel de decisão",
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
  'import "./operator-card-refinement.css"',
]) {
  if (!board.includes(marker))
    failures.push(`toolbar/modos de geradores perdeu seletor ou contrato responsivo: ${marker}`);
}
for (const forbidden of ["Cards verticais", "Cards compactos"]) {
  if (board.includes(forbidden))
    failures.push(`toolbar voltou ao grupo de botões antigo: ${forbidden}`);
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
for (const marker of [
  "homologatedIg200",
  'normalizedController === "inteligen 200"',
  'gen.transport === "reverse_tcp"',
  "Number(gen.rapidDeviceNum || 0) > 0",
  "gen.capabilities?.start === true || homologatedIg200",
  "gen.capabilities?.stop === true || homologatedIg200",
  '<button type="button" disabled title="Função indisponível">\n            AUTO',
  '<button type="button" disabled title="Função indisponível">\n            TEST',
]) {
  if (!detail.includes(marker)) {
    failures.push(`controle homologado perdeu guardrail de reconexão: ${marker}`);
  }
}
if (detail.includes('normalizedController === "ig4 200" && homologatedIg200')) {
  failures.push("exceção de reconexão IG200 não pode ser aplicada ao IG4");
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

const health = read("src/components/generators/generator-health.ts");
for (const marker of [
  "toneFromLimit",
  "percentFromLimit",
  "gen.metricLimits",
  "visibleMeterPercent",
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
]) {
  if (health.includes(forbidden)) {
    failures.push(`semáforo compartilhado voltou a inferir limite industrial: ${forbidden}`);
  }
}

const cardCss = read("src/components/generators/generator-six-card.css");
for (const marker of [
  ".generator-vertical-grid.generator-six-card-grid",
  "grid-template-rows: minmax(0, 1fr)",
  ".comap-engine > span:nth-child(3):empty",
  ".comap-panel-v2 .comap-flow-v2",
  "height: 100%",
  "container-type: inline-size",
  "@container (max-width: 270px)",
]) {
  if (!cardCss.includes(marker))
    failures.push(`layout vertical original perdeu regra de encaixe: ${marker}`);
}
if (!cardCss.includes("@media (max-height: 860px)")) {
  failures.push("modo vertical original perdeu densidade automática para viewport baixa");
}

if (failures.length) {
  console.error("Decision UI check falhou:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(
  "Decision UI check OK: dashboard, card vertical original, compacto clássico, lista completa e limites industriais homologáveis validados.",
);
