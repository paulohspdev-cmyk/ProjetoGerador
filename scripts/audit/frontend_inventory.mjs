import ts from "typescript";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const output = join(root, "docs/audit/system-2026-10-14");
mkdirSync(output, { recursive: true });
const controls = [];
const forms = [];
const navigation = [];
const kinds = new Set([
  "button",
  "Button",
  "input",
  "Input",
  "select",
  "Select",
  "textarea",
  "Textarea",
  "form",
  "img",
  "Dialog",
  "Checkbox",
  "Switch",
  "Link",
]);
function visitFile(path) {
  const text = readFileSync(join(root, path), "utf8");
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const kind = node.tagName.getText(source);
      if (kinds.has(kind)) {
        const attrs = Object.fromEntries(
          node.attributes.properties
            .filter(ts.isJsxAttribute)
            .filter((a) => !["className", "style"].includes(a.name.getText(source)))
            .map((a) => [
              a.name.getText(source),
              a.initializer?.getText(source)?.slice(0, 200) ?? true,
            ]),
        );
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        const owner = node.parent;
        const label = ts.isJsxElement(owner)
          ? owner.children
              .map((n) => (ts.isJsxText(n) ? n.text.trim() : ""))
              .filter(Boolean)
              .join(" ")
              .slice(0, 160)
          : "";
        const item = {
          id: `UI-${String(controls.length + 1).padStart(4, "0")}`,
          source: path,
          line,
          kind,
          label,
          attributes: attrs,
          status:
            "inventariado; ocorrência em código não equivale a ação validada em todas as telas",
        };
        controls.push(item);
        if (kind === "form") forms.push(item);
      }
    }
    if (path.endsWith("registry.ts") && ts.isPropertyAssignment(node)) {
      navigation.push({
        slug: node.name.getText(source).replace(/^"|"$/g, ""),
        component: node.initializer.getText(source),
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
function walk(path) {
  for (const entry of readdirSync(join(root, path), { withFileTypes: true })) {
    const next = join(path, entry.name);
    if (entry.isDirectory()) walk(next);
    else if (/\.tsx?$/.test(next)) visitFile(next);
  }
}
walk("frontend/src");
for (const [name, value] of [
  ["ui_inventory.json", controls],
  ["form_inventory.json", forms],
  ["screen_registry.json", navigation],
]) {
  writeFileSync(join(output, name), JSON.stringify(value, null, 2) + "\n");
}
console.log(
  JSON.stringify({
    controls: controls.length,
    forms: forms.length,
    registered_screens: navigation.length,
    by_kind: Object.fromEntries(
      [...kinds].map((k) => [k, controls.filter((c) => c.kind === k).length]),
    ),
  }),
);
