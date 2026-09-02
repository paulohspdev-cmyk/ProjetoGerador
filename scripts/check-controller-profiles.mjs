import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = process.cwd();
const failures = [];
const read = (path) => readFileSync(join(root, path), "utf8");
const load = (path) => JSON.parse(read(path));

function manifestPaths(base) {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name === "manifest.json") {
        found.push(relative(root, join(root, path)));
      }
    }
  };
  walk(base);
  return found.sort();
}

const labPaths = manifestPaths("controllers/lab");
const productionPaths = manifestPaths("controllers/production");
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

function validateSource(path, profile) {
  const mapping = profile.mapping ?? profile.modbusMapping;
  if (!mapping?.sourceFile) return;
  if (!/^[0-9a-f]{64}$/.test(mapping.sourceSha256 ?? "")) {
    failures.push(`${path}: SHA-256 da fonte ausente ou inválido`);
    return;
  }
  const manifestDirectory = dirname(join(root, path));
  const sourcePath = resolve(manifestDirectory, mapping.sourceFile);
  if (!sourcePath.startsWith(resolve(manifestDirectory) + "/")) {
    failures.push(`${path}: fonte deve permanecer dentro do próprio Controller Pack`);
    return;
  }
  if (!existsSync(sourcePath)) {
    failures.push(`${path}: fonte documental ausente: ${mapping.sourceFile}`);
    return;
  }
  const digest = createHash("sha256").update(readFileSync(sourcePath)).digest("hex");
  if (digest !== mapping.sourceSha256) {
    failures.push(`${path}: SHA-256 não confere com a fonte documental`);
  }
  const lines = readFileSync(sourcePath).toString("latin1").split(/\r?\n/);
  const entries = mapping.registers ?? mapping.objects ?? {};
  for (const [metric, entry] of Object.entries(entries)) {
    const objectNumber = entry.object == null ? "" : String(entry.object);
    const candidates =
      entry.address == null
        ? lines.filter((line) => new RegExp(`^\\s*${objectNumber}\\s+`).test(line))
        : lines.filter((line) => new RegExp(`^\\s*0*${Number(entry.address)}(?:\\s|-)`).test(line));
    if (
      candidates.length === 0 ||
      (objectNumber && !candidates.some((line) => new RegExp(`\\b${objectNumber}\\b`).test(line)))
    ) {
      failures.push(`${path}: ${metric} não confere com a fonte documental`);
    }
  }
}

if (labPaths.length === 0) failures.push("nenhum Controller Pack LAB encontrado");
if (productionPaths.length === 0) failures.push("nenhum Controller Pack production encontrado");

for (const path of labPaths) {
  const profile = load(path);
  validateSource(path, profile);
  if (profile.schema !== 3) failures.push(`${path}: schema deve ser 3`);
  if (!["investigation", "documented", "lab_validated"].includes(profile.status)) {
    failures.push(`${path}: lifecycle LAB não pode usar status ${profile.status}`);
  }
  if (profile.mapping && profile.mapping.readOnly !== true) {
    failures.push(`${path}: qualquer mapa LAB deve permanecer somente leitura`);
  }
  if (profile.status === "investigation" && (profile.validatedTelemetry ?? []).length !== 0) {
    failures.push(`${path}: investigação não pode declarar telemetria validada`);
  }
  for (const command of forbiddenCommands) {
    if (profile.capabilities?.[command] !== false) {
      failures.push(`${path}: comando ${command} não pode ser habilitado em LAB`);
    }
  }
}

for (const path of productionPaths) {
  const profile = load(path);
  validateSource(path, profile);
  if (profile.schema !== 3) failures.push(`${path}: production exige schema 3`);
  if (profile.status !== "field_validated") {
    failures.push(`${path}: production exige status field_validated`);
  }
}

const ig200Path = "controllers/production/comap/inteligen-200/manifest.json";
if (!productionPaths.includes(ig200Path)) failures.push("IG200 homologado não está em production");
const ig200 = load(ig200Path);
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
  "readGeneratorTelemetry(gen)",
  "gen.capabilities?.start === true",
  "gen.capabilities?.stop === true",
  "powerFactor={powerFactor}",
]) {
  if (!card.includes(marker)) failures.push(`card perdeu contrato seguro: ${marker}`);
}
for (const forbidden of ["oilTone(", "coolantTone(", "fuelTone(", "alternatorTone(", "1000;"]) {
  if (card.includes(forbidden)) {
    failures.push(`card voltou a conter inferência industrial: ${forbidden}`);
  }
}

const health = read("src/components/generators/generator-health.ts");
if (!health.includes("toneFromLimit") || !health.includes("gen.metricLimits")) {
  failures.push("saúde visual não está centralizada em limites homologáveis");
}
if (health.includes("value < 2") || health.includes("value > 105") || health.includes(": 1000")) {
  failures.push("saúde visual voltou a conter limite industrial presumido");
}

const metricHelper = read("src/components/generators/generator-metrics.ts");
if (!metricHelper.includes("gen.metrics")) failures.push("helper não prioriza telemetria atual");

const rapid = read("backend/app/rapid.py");
for (const marker of [
  '"metrics": dict(values)',
  '"definedMetrics": defined_metrics',
  '"configuredMetrics": configured_metrics',
  '"metricStates": metric_states',
  '"capabilities": _effective_capabilities',
  "_cache_lock",
  "_is_undefined_raw",
  "_derive_breaker_feedback",
]) {
  if (!rapid.includes(marker)) failures.push(`overlay Rapid perdeu: ${marker}`);
}

if (failures.length) {
  console.error("Controller profile check falhou:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(
  `Controller profile check OK: ${productionPaths.length} production e ${labPaths.length} LAB cobertos recursivamente.`,
);
