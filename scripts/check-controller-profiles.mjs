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
const profiles = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, load(path)]));

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
  if (!profile.mapping?.readOnly) failures.push(`${key}: mapa documental deve ser somente leitura`);
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
const ig200Battery = (ig200.rapid?.channels ?? []).find(
  (channel) => channel.key === "battery_voltage",
);
if (
  !ig200Battery ||
  ig200Battery.tagCode !== "battery_voltage_raw" ||
  ig200Battery.scale !== 0.1 ||
  ig200Battery.unit !== "V" ||
  ig200Battery.source !== "field_validated_map"
) {
  failures.push("InteliGen 200 production: bateria deve permanecer homologada como 1083 / x0,1 V");
}
if (!(ig200.validatedTelemetry ?? []).includes("battery_voltage")) {
  failures.push("InteliGen 200 production: battery_voltage perdeu homologação de campo");
}
for (const metric of ["fuel_level", "oil_pressure", "coolant_temperature", "run_hours"]) {
  if ((ig200.validatedTelemetry ?? []).includes(metric)) {
    failures.push(`InteliGen 200 production: métrica ainda não homologada foi promovida: ${metric}`);
  }
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
  'address="1083" name="Bateria"',
  'tagCode="battery_voltage_raw"',
  'readOnly="true"',
]) {
  if (!ig200Template.includes(marker)) {
    failures.push(`InteliGen 200 production: template perdeu leitura de bateria homologada: ${marker}`);
  }
}

const card = read("src/components/generators/PowerFlowCard.tsx");
for (const marker of [
  "metricUnits",
  "oilUnit",
  "fuelUnit",
  "fuelIsPercent",
  "bar={fuelIsPercent}",
]) {
  if (!card.includes(marker)) failures.push(`card perdeu tratamento de unidade real: ${marker}`);
}

const dashboard = read("src/components/scada/overview-dashboard-model.ts");
if (!dashboard.includes('metricUnit(generator, "fuel_level", "%") === "%"')) {
  failures.push("dashboard voltou a misturar litros com percentual de combustível");
}

const rapid = read("backend/app/rapid.py");
for (const marker of ["pack_for_model", "_metric_units", '"metricUnits": _metric_units']) {
  if (!rapid.includes(marker))
    failures.push(`overlay Rapid perdeu unidade do Controller Pack: ${marker}`);
}

const library = read("backend/app/controller_library.py");
for (const marker of ["documentedTelemetry", "metricUnits", "_pack_telemetry_state"]) {
  if (!library.includes(marker)) failures.push(`biblioteca perdeu metadado documental: ${marker}`);
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
  "Controller profile check OK: perfis documentais preservados e bateria IG200 homologada em campo.",
);
