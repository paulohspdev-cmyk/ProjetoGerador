import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const calls = [];
const context = vm.createContext({});
const http = new vm.SyntheticModule(
  ["HttpError", "httpDownload", "httpRequest"],
  function () {
    this.setExport("HttpError", Error);
    this.setExport("httpDownload", () => {});
    this.setExport("httpRequest", async (...args) => {
      calls.push(args);
      return { accepted: true, feedback_confirmed: false, ok: false, state: "failed" };
    });
  },
  { context },
);
const source = readFileSync("frontend/src/lib/api.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const client = new vm.SourceTextModule(compiled, { context });
await client.link((specifier) => {
  assert.equal(specifier, "@/lib/http-client");
  return http;
});
await client.evaluate();
for (const action of ["start", "stop"]) {
  const result = await client.namespace.rcApi.generators.command("device/1", action);
  const [path, init, timeout] = calls.at(-1);
  assert.equal(path, `/api/generators/device%2F1/commands/${action}`);
  assert.equal(init.method, "POST");
  assert.equal(JSON.parse(init.body).confirmation, action.toUpperCase());
  const pack = JSON.parse(
    readFileSync("controllers/production/comap/inteligen-200/manifest.json", "utf8"),
  );
  assert.ok(
    timeout >= (pack.commands[action].timeoutSeconds + 5) * 1000,
    "HTTP deadline must exceed executor deadline and connection margin",
  );
  assert.equal(result.state, "failed");
  assert.equal(result.ok, false, "client must preserve unconfirmed result");
}
console.log("Command client timeout and response regression: OK");
