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
  "sm:grid-cols-2",
  "lg:grid-cols-3",
  "2xl:grid-cols-4",
]) {
  if (!board.includes(marker))
    failures.push(`toolbar/modos de geradores perdeu seletor ou grade responsiva: ${marker}`);
}
for (const forbidden of ["Cards verticais", "Cards compactos"]) {
  if (board.includes(forbidden))
    failures.push(`toolbar voltou ao grupo de botões antigo: ${forbidden}`);
}
if (!board.includes('view === "principal" ? 5')) {
  failures.push("modo vertical deixou de limitar a cinco cards por página");
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
  if (!compact.includes(marker))
    failures.push(`card compacto clássico perdeu conteúdo: ${marker}`);
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
  "oilTone",
  "coolantTone",
  "fuelTone",
  "alternatorTone",
  "maintenanceTone",
  "visibleMeterPercent",
]) {
  if (!health.includes(marker)) failures.push(`semáforo compartilhado perdeu regra: ${marker}`);
}

const cardCss = read("src/components/generators/generator-six-card.css");
for (const marker of [
  ".generator-vertical-grid.generator-six-card-grid",
  "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
  "grid-auto-rows: auto",
  ".comap-engine > span:nth-child(3):empty",
  ".comap-panel-v2 .comap-flow-v2",
  ".generator-power-instrument",
  ".generator-power-gauge",
  "@media (max-height: 860px)",
  "@media (max-height: 720px)",
  "@media (max-width: 639px)",
]) {
  if (!cardCss.includes(marker))
    failures.push(`layout vertical perdeu regra responsiva: ${marker}`);
}
for (const forbidden of ["grid-template-rows: minmax(0, 1fr)", ".kw-gauge-"]) {
  if (cardCss.includes(forbidden))
    failures.push(`layout vertical manteve regra obsoleta/conflitante: ${forbidden}`);
}

if (failures.length) {
  console.error("Decision UI check falhou:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(
  "Decision UI check OK: dashboard, vertical responsivo, compacto clássico, lista completa e guardrails industriais validados.",
);
