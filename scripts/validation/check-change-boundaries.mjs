import { execFileSync } from "node:child_process";

function normalize(path) {
  return String(path || "")
    .trim()
    .replaceAll("\\", "/");
}

function isAuxiliary(path) {
  return (
    path.startsWith("docs/") ||
    path.startsWith("tests/") ||
    path.startsWith("backend/tests/") ||
    path === "README.md" ||
    path === "AGENTS.md" ||
    path === "CLAUDE.md" ||
    path === ".github/copilot-instructions.md" ||
    path === ".github/PULL_REQUEST_TEMPLATE.md"
  );
}

export function changeDomain(input) {
  const path = normalize(input);
  if (!path || isAuxiliary(path)) return null;

  if (
    path === "frontend/src/features/generators/PowerFlowCard.tsx" ||
    path.startsWith("frontend/src/features/generators/vertical-card/") ||
    /\/Vertical[^/]*\.(tsx?|css)$/.test(path)
  ) {
    return "frontend:generator-vertical";
  }

  if (
    path === "frontend/src/features/generators/CompactCard.tsx" ||
    path === "frontend/src/features/generators/compact-card.css" ||
    /\/Compact[^/]*\.(tsx?|css)$/.test(path)
  ) {
    return "frontend:generator-compact";
  }

  if (path === "frontend/src/features/generators/GeneratorTable.tsx") {
    return "frontend:generator-list";
  }

  if (path === "frontend/src/features/generators/GeneratorsBoard.tsx") {
    return "frontend:generator-board";
  }

  if (
    [
      "frontend/src/features/generators/generator-health.ts",
      "frontend/src/features/generators/generator-presence.ts",
      "frontend/src/features/generators/generator-metrics.ts",
      "frontend/src/data/generators.ts",
    ].includes(path)
  ) {
    return "frontend:generator-semantics";
  }

  if (path === "frontend/src/features/generators/GeneratorsProvider.tsx") {
    return "frontend:generator-provider";
  }

  if (path.startsWith("frontend/src/features/generators/detail/")) {
    return "frontend:generator-detail";
  }

  if (path.startsWith("frontend/src/features/generators/")) return "frontend:generator-shared";

  if (path.startsWith("frontend/src/theme/")) return "frontend:theme";
  if (path.startsWith("frontend/src/lib/")) return "frontend:lib-api";
  if (path.startsWith("frontend/src/routes/")) return "frontend:routing";
  if (path.startsWith("frontend/src/components/")) return "frontend:shared-components";
  if (path.startsWith("frontend/src/features/")) {
    const feature = path.split("/")[3] || "unknown";
    return `frontend:feature:${feature}`;
  }
  if (path.startsWith("frontend/")) return "frontend:other";

  if (path.startsWith("controllers/production/")) {
    const p = path.split("/");
    return p.length >= 4
      ? `controller-pack:${p.slice(0, 4).join("/")}`
      : "controller-pack:production";
  }
  if (path.startsWith("controllers/lab/")) return "controller-pack:lab";
  if (path.startsWith("controllers/catalog/")) return "controller-catalog";
  if (path.startsWith("controllers/schema/")) return "controller-schema";
  if (path.startsWith("controllers/")) return "controller-tooling";

  if (
    path === "backend/app/control.py" ||
    path === "backend/app/dse_control.py" ||
    path === "backend/app/ig4_lab.py"
  ) {
    return "backend:industrial-command";
  }

  if (
    path === "backend/app/bridge.py" ||
    path === "backend/app/bridge_runtime.py" ||
    path === "backend/app/bridge_runtime_port_override.py" ||
    path === "backend/app/transport_store.py" ||
    path === "backend/app/traffic_store.py"
  ) {
    return "backend:bridge-transport";
  }

  if (
    path === "backend/app/rapid.py" ||
    path === "backend/app/binding_store.py" ||
    path.startsWith("rapid/")
  ) {
    return "rapid";
  }

  if (
    path === "backend/app/db.py" ||
    path === "backend/app/migrations.py" ||
    path.endsWith("_store.py")
  ) {
    return "backend:database";
  }

  if (path.startsWith("backend/app/")) return "backend:product";

  if (path.startsWith("ops/") || path.startsWith("infrastructure/")) {
    return "deploy-infrastructure";
  }

  if (path.startsWith("scripts/validation/") || path.startsWith(".github/workflows/")) {
    return "governance-ci";
  }

  if (
    path === "package.json" ||
    path === "package-lock.json" ||
    path === "tsconfig.json" ||
    path === "vite.config.ts" ||
    path === "playwright.config.ts" ||
    path === "eslint.config.js"
  ) {
    return "tooling";
  }

  return "repository-other";
}

function validate(files) {
  const classified = files
    .map((path) => ({ path: normalize(path), domain: changeDomain(path) }))
    .filter((item) => item.path);

  const primaries = [...new Set(classified.map((x) => x.domain).filter(Boolean))].sort();

  if (primaries.length > 1) {
    const detail = classified
      .filter((x) => x.domain)
      .map((x) => `  - ${x.domain}: ${x.path}`)
      .join("\n");
    throw new Error(
      [
        "PR mistura domínios funcionais e foi bloqueado.",
        `Domínios encontrados: ${primaries.join(", ")}`,
        detail,
        "",
        "Divida a alteração em PRs encadeados. Docs e testes podem acompanhar o domínio principal.",
        "Consulte docs/governance/CHANGE_BOUNDARIES.md.",
      ].join("\n"),
    );
  }

  const primary = primaries[0] || "docs/tests-only";
  process.stdout.write(
    `Fronteira OK: ${primary}; ${files.length} arquivo(s) alterado(s).\n`,
  );
}

function changedFiles() {
  if (process.env.CHANGE_FILES?.trim()) {
    return process.env.CHANGE_FILES.split(/\r?\n/).map(normalize).filter(Boolean);
  }

  let base = process.env.CHANGE_BASE_SHA?.trim();
  if (!base || /^0+$/.test(base)) base = "HEAD^";

  const output = execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMRD", `${base}...HEAD`],
    { encoding: "utf8" },
  );
  return output.split(/\r?\n/).map(normalize).filter(Boolean);
}

if (process.argv.includes("--self-test")) {
  validate([
    "frontend/src/features/generators/PowerFlowCard.tsx",
    "tests/e2e/vertical-card-reference.spec.ts",
    "docs/governance/PROJECT_STATE.md",
  ]);

  let rejected = false;
  try {
    validate([
      "frontend/src/features/generators/PowerFlowCard.tsx",
      "frontend/src/features/generators/CompactCard.tsx",
    ]);
  } catch {
    rejected = true;
  }
  if (!rejected) {
    throw new Error("self-test: mistura Vertical+Compacto deveria ser rejeitada");
  }
  process.stdout.write("Self-test de fronteiras: OK\n");
} else {
  validate(changedFiles());
}
