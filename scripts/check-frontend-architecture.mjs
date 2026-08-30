import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];
const warnings = [];

const exists = (relative) => fs.existsSync(path.join(root, relative));
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

for (const required of [
  "src/assets",
  "src/components",
  "src/styles",
  "src/styles/index.css",
  "src/styles/tokens.css",
  "src/styles/base.css",
  "scripts",
]) {
  if (!exists(required)) errors.push(`estrutura obrigatória ausente: ${required}`);
}

if (exists("src/styles.css")) {
  errors.push("src/styles.css voltou a existir; use src/styles/index.css");
}

if (exists("src/styles/index.css")) {
  const entry = read("src/styles/index.css");
  if (!entry.includes('./tokens.css')) errors.push("styles/index.css não importa tokens.css");
  if (!entry.includes('./base.css')) errors.push("styles/index.css não importa base.css");
}

if (exists("components.json")) {
  const config = JSON.parse(read("components.json"));
  if (config?.tailwind?.css !== "src/styles/index.css") {
    errors.push("components.json deve apontar Tailwind para src/styles/index.css");
  }
}

function walk(relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return [];
  const out = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) out.push(...walk(child));
    else out.push(child.split(path.sep).join("/"));
  }
  return out;
}

const sourceFiles = walk("src");
for (const file of sourceFiles) {
  if (file.endsWith(".css") && !file.startsWith("src/styles/") && !file.startsWith("src/components/")) {
    errors.push(`CSS fora de styles/ ou do componente proprietário: ${file}`);
  }

  if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;
  const text = read(file);
  if (text.includes("../styles.css") || text.includes("@/styles.css")) {
    errors.push(`import legado de styles.css: ${file}`);
  }
  if (file !== "src/data/controller-images.ts" && text.includes("@/data/controller-images")) {
    warnings.push(`import de compatibilidade ainda usado em ${file}; migrar para @/assets/controllers`);
  }
}

const componentFiles = sourceFiles.filter((file) => file.startsWith("src/components/") && file.endsWith(".tsx"));
for (const file of componentFiles) {
  const lines = read(file).split(/\r?\n/).length;
  if (lines > 500) warnings.push(`componente grande (${lines} linhas): ${file}`);
}

if (warnings.length) {
  console.warn("Avisos de arquitetura:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length) {
  console.error("Erros de arquitetura:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Arquitetura frontend: estrutura base OK");
