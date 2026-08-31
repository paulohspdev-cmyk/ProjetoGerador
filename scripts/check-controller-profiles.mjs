import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const read = (path) => readFileSync(join(root, path), "utf8");
const load = (path) => JSON.parse(read(path));

const labPaths = [
  "controllers/lab/comap/amf-09/manifest.json",
  "controllers/lab/comap/amf-25/manifest.json",
  "controllers/lab/comap/ig4-200/manifest.json",
  "controllers/lab/comap/ig-nt/manifest.json",
  "controllers/lab/comap/inteli-mains-comap/manifest.json",
];
const forbiddenCommands = [
  "start",
  "stop",
  "auto",
  "manual",
  "test",
  "mcb_open",
  "mcb_close",
  "gcb_open",
  "gcb_close",
  "paralleling",
];

for (const path of labPaths) {
  const profile = load(path);
  if (profile.schema !== 3) failures.push(`${path}: schema deve ser 3`);
  if (profile.status !== "documented") failures.push(`${path}: deve permanecer documented`);
  if (!profile.mapping?.readOnly) failures.push(`${path}: deve permanecer somente leitura`);
  if ((profile.validatedTelemetry ?? []).length !== 0) {
    failures.push(`${path}: telemetria documental não pode ser homologada automaticamente`);
  }
  for (const command of forbiddenCommands) {
    if (profile.capabilities?.[command] !== false) {
      failures.push(`${path}: comando ${command} não pode ser habilitado por documento`);
    }
  }
}

const ig200 = load("controllers/production/comap/inteligen-200/manifest.json");
const map = ig200.modbusMapping?.registers ?? {};
const expected = {
  rpm: [1000, 1],
  fuel_rate: [1004, 0.1],
  coolant_temperature: [1005, 1],
  intake_temperature: [1006, 1],
  oil_pressure: [1007, 0.01],
  intake_pressure: [1008, 0.01],
  engine_load: [1009, 1],
  power_kw: [1019, 1],
  power_kvar: [1023, 1],
  power_kva: [1027, 1],
  power_factor: [1031, 0.01],
  frequency: [1035, 0.1],
  voltage_l1: [1036, 1],
  voltage_l2: [1037, 1],
  voltage_l3: [1038, 1],
  voltage_l1_l2: [1039, 1],
  voltage_l2_l3: [1040, 1],
  voltage_l3_l1: [1041, 1],
  current_l1: [1042, 1],
  current_l2: [1043, 1],
  current_l3: [1044, 1],
  battery_voltage: [1083, 0.1],
  alternator_voltage: [1084, 0.1],
  fuel_level: [1087, 1],
  nominal_power_kw: [1227, 1],
  nominal_voltage: [1228, 1],
  nominal_current: [1229, 1],
  genset_kwh: [1230, 1],
  run_hours: [1238, 0.1],
  number_starts: [1240, 1],
  maintenance_hours: [1241, 1],
  engine_state_raw: [1258, 1],
  breaker_state_raw: [1259, 1],
  controller_mode_raw: [1342, 1],
};

for (const [metric, [address, scale]] of Object.entries(expected)) {
  if (map[metric]?.address !== address || map[metric]?.scale !== scale) {
    failures.push(`IG200: ${metric} deve permanecer em ${address} / escala ${scale}`);
  }
  if (!(ig200.validatedTelemetry ?? []).includes(metric)) {
    failures.push(`IG200: ${metric} perdeu homologação de campo`);
  }
  if (!(ig200.rapid?.channels ?? []).some((channel) => channel.key === metric)) {
    failures.push(`IG200: canal Rapid ausente para ${metric}`);
  }
}

if (
  ig200.modbusMapping?.exportStatus !== "field_validated" ||
  ig200.modbusMapping?.exportName !== "in200.txt" ||
  ig200.modbusMapping?.exportTool !== "ComAp InteliConfig"
) {
  failures.push("IG200: export in200.txt validado deixou de ser a fonte do mapa");
}
if (ig200.metricUnits?.fuel_level !== "L" || ig200.metricUnits?.oil_pressure !== "bar") {
  failures.push("IG200: unidades reais de combustível/óleo foram alteradas");
}
if (
  ig200.capabilities?.start !== true ||
  ig200.capabilities?.stop !== true ||
  forbiddenCommands.slice(2).some((command) => ig200.capabilities?.[command] !== false)
) {
  failures.push("IG200: política de comandos homologados foi alterada");
}

const template = read("rapid/templates/DrvModbus_RC_IG200.xml");
for (const marker of [
  'tagCode="coolant_temperature"',
  'tagCode="oil_pressure_raw"',
  'address="1019"',
  'tagCode="power_kw"',
  'address="1035"',
  'tagCode="frequency_raw"',
  'address="1087"',
  'tagCode="fuel_level"',
  'address="1227"',
  'tagCode="nominal_power_kw"',
  'address="1238"',
  'tagCode="run_hours_raw"',
  'address="1258"',
  'tagCode="engine_state_raw"',
  'address="1342"',
  'tagCode="controller_mode_raw"',
  'readOnly="true"',
  "<Cmds />",
]) {
  if (!template.includes(marker)) failures.push(`IG200 template perdeu: ${marker}`);
}

const card = read("src/components/generators/PowerFlowCard.tsx");
for (const marker of [
  "metricUnits",
  'metricNumber(gen, "power_factor"',
  "powerFactor={powerFactor}",
]) {
  if (!card.includes(marker)) failures.push(`card perdeu telemetria real: ${marker}`);
}

const metricHelper = read("src/components/generators/generator-metrics.ts");
if (!metricHelper.includes("gen.metrics")) failures.push("helper não prioriza telemetria atual");

const dashboard = read("src/components/scada/overview-dashboard-model.ts");
if (!dashboard.includes('metricUnit(generator, "fuel_level", "%") === "%"')) {
  failures.push("dashboard voltou a misturar litros com percentual de combustível");
}

const rapid = read("backend/app/rapid.py");
for (const marker of [
  '"metrics": dict(values)',
  "_is_undefined_raw",
  "_derive_breaker_feedback",
  '"nominalPower": values.get("nominal_power_kw")',
]) {
  if (!rapid.includes(marker)) failures.push(`overlay Rapid perdeu: ${marker}`);
}

if (failures.length) {
  console.error("Controller profile check falhou:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(
  "Controller profile check OK: IG200 usa in200.txt validado no GEN005 e mantém escrita industrial bloqueada.",
);
