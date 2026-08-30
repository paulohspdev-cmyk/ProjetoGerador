import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "src/assets",
  "src/assets/index.ts",
  "src/components",
  "src/styles",
  "src/styles/tokens.css",
  "src/styles/base.css",
  "src/styles/utilities.css",
  "scripts",
];

for (const path of required) {
  if (!existsSync(join(root, path))) {
    failures.push(`estrutura obrigatória ausente: ${path}`);
  }
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const appComponentLimit = 20 * 1024;
const uiPrimitiveLimit = 30 * 1024;
for (const file of walk(join(root, "src/components"))) {
  if (![".tsx", ".ts"].includes(extname(file))) continue;
  const rel = relative(root, file).replaceAll("\\", "/");
  const isUiPrimitive = rel.startsWith("src/components/ui/");
  const limit = isUiPrimitive ? uiPrimitiveLimit : appComponentLimit;
  const size = statSync(file).size;
  if (size > limit) {
    failures.push(
      `${isUiPrimitive ? "primitive UI" : "componente de negócio"} acima de ${limit / 1024} KiB: ${rel} (${Math.ceil(size / 1024)} KiB)`,
    );
  }
}

const legacyAssetShim = join(root, "src/data/controller-images.ts");
if (existsSync(legacyAssetShim)) {
  failures.push(
    "shim legado src/data/controller-images.ts ainda existe; assets devem vir de @/assets",
  );
}

for (const file of walk(join(root, "src"))) {
  if (![".tsx", ".ts"].includes(extname(file))) continue;
  const source = readFileSync(file, "utf8");
  if (source.includes("@/data/controller-images")) {
    failures.push(`import legado de assets: ${relative(root, file)}`);
  }
}

const stylesEntry = join(root, "src/styles.css");
if (existsSync(stylesEntry)) {
  const source = readFileSync(stylesEntry, "utf8");
  const forbiddenDefinitions = [
    [/^\s*:root\s*\{/m, ":root {"],
    [/^\s*\.dark\s*\{/m, ".dark {"],
    [/--background\s*:/, "--background:"],
    [/--primary\s*:/, "--primary:"],
  ];
  for (const [pattern, label] of forbiddenDefinitions) {
    if (pattern.test(source)) {
      failures.push(`src/styles.css deve ser apenas entrypoint; encontrou definição ${label}`);
    }
  }
}

const tokenFile = join(root, "src/styles/tokens.css");
if (existsSync(tokenFile)) {
  const source = readFileSync(tokenFile, "utf8");
  for (const requiredToken of [
    "--primary:",
    "--info:",
    "--online:",
    "--alert:",
    "--offline:",
    "--industrial-bg:",
    "--industrial-panel:",
  ]) {
    if (!source.includes(requiredToken)) {
      failures.push(`token semântico obrigatório ausente: ${requiredToken}`);
    }
  }
}

const tokenizedCss = [
  "src/components/generators/comap-panel.css",
  "src/components/generators/generator-detail.css",
  "src/components/generators/powerflow-card-v2.css",
];
const rawColorPattern = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(/;
for (const path of tokenizedCss) {
  const full = join(root, path);
  if (!existsSync(full)) continue;
  const source = readFileSync(full, "utf8");
  if (rawColorPattern.test(source)) {
    failures.push(`cor bruta em stylesheet governado por tokens: ${path}`);
  }
}

const generatorsRoot = join(root, "src/components/generators");
const forbiddenGeneratorPatterns = [
  ["Generator Freq.", "métrica duplicada Generator Freq."],
  ["autoKwScale", "escala automática de kW"],
  ["meterColor", "classificação visual por limites locais"],
  ["batt < 12", "limiar genérico de bateria"],
  ["n < 12.2", "limiar genérico de bateria"],
  ["n < 11.5", "limiar genérico de bateria"],
];
for (const file of walk(generatorsRoot)) {
  if (![".tsx", ".ts"].includes(extname(file))) continue;
  const source = readFileSync(file, "utf8");
  for (const [pattern, label] of forbiddenGeneratorPatterns) {
    if (source.includes(pattern)) {
      failures.push(`${label}: ${relative(root, file)}`);
    }
  }
}

if (failures.length) {
  console.error("Architecture check falhou:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  "Architecture check OK: estrutura, componentização, assets, tokens semânticos e guardrails validados.",
);
