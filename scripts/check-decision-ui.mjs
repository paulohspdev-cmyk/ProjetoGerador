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
]) {
  if (!board.includes(marker))
    failures.push(`toolbar/modos de geradores perdeu seletor: ${marker}`);
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
  "CompactPowerGauge",
  "compact-flow-line",
  'className="compact-command start"',
  'className="compact-command stop"',
  "readGeneratorTelemetry",
]) {
  if (!compact.includes(marker))
    failures.push(`card compacto perdeu função operacional: ${marker}`);
}
for (const forbidden of [
  'command(gen.id, "auto")',
  'command(gen.id, "manual")',
  'command(gen.id, "test")',
  'command(gen.id, "mcb_close")',
  'command(gen.id, "gcb_close")',
]) {
  if (compact.includes(forbidden))
    failures.push(`card compacto habilitou comando não homologado: ${forbidden}`);
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
  "grid-template-rows: minmax(0, 1fr)",
  ".comap-engine > span:nth-child(3):empty",
  ".comap-panel-v2 .comap-flow-v2",
  "height: 100%",
]) {
  if (!cardCss.includes(marker))
    failures.push(`layout vertical perdeu regra de encaixe: ${marker}`);
}
if (!cardCss.includes("@media (max-height: 860px)")) {
  failures.push("modo vertical perdeu densidade automática para viewport baixa");
}

if (failures.length) {
  console.error("Decision UI check falhou:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(
  "Decision UI check OK: dashboard, card vertical, compacto horizontal, lista completa e guardrails industriais validados.",
);
