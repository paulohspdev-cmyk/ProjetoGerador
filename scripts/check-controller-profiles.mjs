import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const read = (path) => readFileSync(join(root, path), "utf8");
const load = (path) => JSON.parse(read(path));

const paths = {
  amf09: "controllers/lab/comap/amf-09/manifest.json",
  amf25: "controllers/lab/comap/amf-25/manifest.json",
  ig4: "controllers/lab/comap/ig4-200/manifest.json",
  ignt: "controllers/lab/comap/ig-nt/manifest.json",
  mains: "controllers/lab/comap/inteli-mains-comap/manifest.json",
};
const profiles = Object.fromEntries(
  Object.entries(paths).map(([key, path]) => [key, load(path)]),
);

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

for (const [key, profile] of Object.entries(profiles)) {
  if (profile.schema !== 3) failures.push(`${key}: schema deve ser 3`);
  if (profile.status !== "documented")
    failures.push(`${key}: perfil novo deve permanecer documented`);
  if (!profile.mapping?.readOnly)
    failures.push(`${key}: mapa documental deve ser somente leitura`);
  if ((profile.validatedTelemetry ?? []).length !== 0) {
    failures.push(`${key}: documento não pode ser promovido a telemetria validada`);
  }
  if (!(profile.documentedTelemetry ?? []).length)
    failures.push(`${key}: sem telemetria documentada`);
  for (const command of forbiddenCommands) {
    if (profile.capabilities?.[command] !== false) {
      failures.push(`${key}: comando ${command} não pode ser habilitado por documento`);
    }
  }
}

const amf09Fuel = profiles.amf09.mapping.registers.fuel_level;
if (amf09Fuel.address !== 1040 || amf09Fuel.scale !== 1 || amf09Fuel.unit !== "L") {
  failures.push("AMF 09: combustível deve permanecer 1040 / escala 1 / L");
}
if (profiles.amf09.metricUnits.oil_pressure !== "kgf") {
  failures.push("AMF 09: pressão de óleo não pode ser rotulada como bar");
}

const amf25Fuel = profiles.amf25.mapping.registers.fuel_level;
if (amf25Fuel.address !== 1057 || amf25Fuel.scale !== 0.1 || amf25Fuel.unit !== "L") {
  failures.push("AMF 25: combustível deve permanecer 1057 / escala 0,1 / L");
}
if (profiles.amf25.mapping.registers.run_hours.address !== 1271) {
  failures.push("AMF 25: horímetro deve permanecer no registro documentado 1271");
}

const ig4Fuel = profiles.ig4.mapping.registers.fuel_level;
if (ig4Fuel.address !== 1055 || ig4Fuel.unit !== "L") {
  failures.push("IG4 200: combustível deve permanecer 1055 / L");
}
if (profiles.ig4.mapping.registers.total_fuel_consumption.address !== 1311) {
  failures.push("IG4 200: consumo total de combustível documentado deve permanecer em 1311");
}
if (
  profiles.ig4.mapping.registers.gcb_closed.address !== 0 ||
  profiles.ig4.mapping.registers.mcb_closed.address !== 1
) {
  failures.push("IG4 200: feedbacks GCB/MCB documentados foram alterados");
}

if (
  profiles.ignt.metricUnits.fuel_level !== "%" ||
  profiles.ignt.mapping.objects.fuel_level.object !== 9157
) {
  failures.push("IG-NT: combustível deve permanecer percentual no objeto 9157");
}
if (profiles.ignt.mapping.registers || profiles.ignt.rapid) {
  failures.push(
    "IG-NT: object table não pode virar template/register Modbus sem tradução documental",
  );
}

const forbiddenMainsMetrics = ["rpm", "oil_pressure", "coolant_temperature", "fuel_level"];
if (profiles.mains.application !== "mains")
  failures.push("InteliMains: application deve ser mains");
for (const metric of forbiddenMainsMetrics) {
  if (profiles.mains.documentedTelemetry.includes(metric)) {
    failures.push(`InteliMains: métrica de motor indevida ${metric}`);
  }
}
if (profiles.mains.mapping.registers || profiles.mains.rapid) {
  failures.push(
    "InteliMains: object table não pode virar template/register Modbus sem tradução documental",
  );
}

const ig200 = load("controllers/production/comap/inteligen-200/manifest.json");
const ig200Map = ig200.modbusMapping?.registers ?? {};
const expectedRegisters = {
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

for (const [metric, [address, scale]] of Object.entries(expectedRegisters)) {
  if (ig200Map[metric]?.address !== address || ig200Map[metric]?.scale !== scale) {
    failures.push(
      `InteliGen 200 production: ${metric} deve permanecer em ${address} / escala ${scale}`,
    );
  }
  if (!(ig200.validatedTelemetry ?? []).includes(metric)) {
    failures.push(`InteliGen 200 production: ${metric} perdeu homologação de campo`);
  }
  if (!(ig200.rapid?.channels ?? []).some((channel) => channel.key === metric)) {
    failures.push(`InteliGen 200 production: canal Rapid ausente para ${metric}`);
  }
}

const ig200Objects = ig200.documentedObjects ?? {};
const ig200ObjectExpectations = {
  power_kw: 8202,
  battery_voltage: 8213,
  fuel_level: 9153,
  coolant_temperature: 10155,
  oil_pressure: 10157,
  engine_load: 10159,
  run_hours: 8206,
  alternator_voltage: 10603,
};
for (const [metric, object] of Object.entries(ig200ObjectExpectations)) {
  if (ig200Objects[metric]?.object !== object) {
    failures.push(
      `InteliGen 200 production: Com.Obj documental de ${metric} deve permanecer ${object}`,
    );
  }
}

if (ig200.metricUnits?.fuel_level !== "L" || ig200.metricUnits?.oil_pressure !== "bar") {
  failures.push(
    "InteliGen 200 production: unidades documentais de combustível/óleo foram alteradas",
  );
}

if (
  ig200.modbusMapping?.kind !== "configuration_dependent_export" ||
  ig200.modbusMapping?.exportRequired !== true ||
  ig200.modbusMapping?.exportStatus !== "field_validated" ||
  ig200.modbusMapping?.exportName !== "in200.txt" ||
  ig200.modbusMapping?.exportTool !== "ComAp InteliConfig"
) {
  failures.push(
    "InteliGen 200 production: export Modbus in200.txt validado deixou de ser a fonte do mapa",
  );
}

if (
  ig200.capabilities?.start !== true ||
  ig200.capabilities?.stop !== true ||
  ig200.capabilities?.auto !== false ||
  ig200.capabilities?.manual !== false ||
  ig200.capabilities?.test !== false ||
  ig200.capabilities?.mcb_open !== false ||
  ig200.capabilities?.mcb_close !== false ||
  ig200.capabilities?.gcb_open !== false ||
  ig200.capabilities?.gcb_close !== false ||
  ig200.capabilities?.paralleling !== false
) {
  failures.push("InteliGen 200 production: política de comandos homologados foi alterada");
}

const ig200Template = read("rapid/templates/DrvModbus_RC_IG200.xml");
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
  if (!ig200Template.includes(marker)) {
    failures.push(`InteliGen 200 production: template perdeu mapa validado: ${marker}`);
  }
}

const card = read("src/components/generators/PowerFlowCard.tsx");
for (const marker of [
  "metricUnits",
  "oilUnit",
  "fuelUnit",
  "fuelIsPercent",
  "bar={fuelIsPercent}",
  'metricNumber(gen, "power_factor"',
  "powerFactor={powerFactor}",
]) {
  if (!card.includes(marker)) failures.push(`card perdeu telemetria/unidade real: ${marker}`);
}

const metricHelper = read("src/components/generators/generator-metrics.ts");
if (!metricHelper.includes("gen.metrics")) {
  failures.push("helper de métricas não prioriza o mapa de telemetria atual");
}

const dashboard = read("src/components/scada/overview-dashboard-model.ts");
if (!dashboard.includes('metricUnit(generator, "fuel_level", "%") === "%"')) {
  failures.push("dashboard voltou a misturar litros com percentual de combustível");
}

const rapid = read("backend/app/rapid.py");
for (const marker of [
  "pack_for_model",
  "_metric_units",
  '"metricUnits": _metric_units',
  '"metrics": dict(values)',
  "_is_undefined_raw",
  "_derive_breaker_feedback",
  '"nominalPower": values.get("nominal_power_kw")',
]) {
  if (!rapid.includes(marker))
    failures.push(`overlay Rapid perdeu telemetria validada: ${marker}`);
}

const library = read("backend/app/controller_library.py");
for (const marker of ["documentedTelemetry", "metricUnits", "_pack_telemetry_state"]) {
  if (!library.includes(marker))
    failures.push(`biblioteca perdeu metadado documental: ${marker}`);
}

const controllerAssets = read("src/assets/controllers.ts");
for (const forbidden of [
  'key.includes("INTELILITE")',
  'key.includes("INTELIMAINS")',
  'key.includes("COMAP")',
]) {
  if (controllerAssets.includes(forbidden)) {
    failures.push(`imagem de controladora voltou a usar fallback de outro modelo: ${forbidden}`);
  }
}

if (failures.length) {
  console.error("Controller profile check falhou:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Controller profile check OK: IG200 usa export in200.txt validado no GEN005 e mantém comandos não homologados bloqueados.",
);
