import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const required = [
  "src/assets",
  "src/components",
  "src/styles",
  "src/styles/tokens.css",
  "scripts",
];

const failures = [];
for (const path of required) {
  if (!existsSync(join(root, path))) failures.push(`estrutura obrigatória ausente: ${path}`);
}

const maxComponentBytes = 30 * 1024;
function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

for (const file of walk(join(root, "src/components"))) {
  if (![".tsx", ".ts"].includes(extname(file))) continue;
  const size = statSync(file).size;
  if (size > maxComponentBytes) {
    failures.push(`componente acima de 30 KiB: ${relative(root, file)} (${Math.ceil(size / 1024)} KiB)`);
  }
}

if (failures.length) {
  console.error("Architecture check falhou:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Architecture check OK: assets/components/styles/scripts presentes e componentes dentro do limite.");
