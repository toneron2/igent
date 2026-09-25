#!/usr/bin/env node
// bin/check.mjs -- measure the examples against the contract's rules (§11).
//
//   node bin/check.mjs                                  the fixtures beside this document
//   node bin/check.mjs --spec <path/to/status-line.md>  also verify §9's hash against that file
//
// Exit 0 when every rule holds; each failure is one line naming the example and the rule.

import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ex = join(root, "examples");
const failures = [];
const ok = [];
const need = (cond, what) => (cond ? ok : failures).push(what);
const VERDICT = ["id", "valid", "confidence", "expr", "notation", "trace"];
const CODES = new Set([4010, 4030, 4090, 4260]);
const hasVerdict = (v, where) => {
  need(v && VERDICT.every((k) => k in v), `${where}: verdict carries ${VERDICT.join(" ")}`);
  if (v) need(typeof v.valid === "boolean" && Number.isInteger(v.confidence) && v.confidence >= 0 && v.confidence <= 255, `${where}: valid is boolean, confidence 0-255`);
  if (v) need(/^sha256:[0-9a-f]{16,64}$/.test(v.trace ?? ""), `${where}: trace is sha256:<hex>`);
};
const load = async (name) => JSON.parse(await readFile(join(ex, name), "utf8"));

// every authenticate0-request*.json: one per device class (sensor head, phone)
for (const name of (await readdir(ex)).filter((n) => n.startsWith("authenticate0-request")).sort()) {
  const req = await load(name);
  need(req.method === "authenticate0" && req.jsonrpc === "2.0", `${name}: JSON-RPC 2.0, method authenticate0`);
  for (const k of ["igent", "role", "hardware", "streams", "contract"]) need(k in req.params, `${name}: params.${k}`);
  need(req.params.contract === 1, `${name}: contract version 1`);
  need(Array.isArray(req.params.streams) && req.params.streams.includes(0), `${name}: stream 0 declared`);
  need(typeof req.params.hardware === "string" && req.params.hardware.length > 0, `${name}: hardware is the device's own identifier (§3)`);
}

const ref = await load("authenticate0-refusal.json");
need(CODES.has(ref.error?.code), "authenticate0-refusal: error code is one of 4010 4030 4090 4260");
hasVerdict(ref.error?.data?.verdict, "authenticate0-refusal");
need(ref.error?.data?.verdict?.valid === false, "authenticate0-refusal: verdict.valid is false");

const res = await load("authenticate0-result.json");
for (const k of ["session", "rate", "missed", "verdict"]) need(k in res.result, `authenticate0-result: result.${k}`);
need(res.result.missed?.degraded === 3 && res.result.missed?.terminated === 10, "authenticate0-result: missed 3 / 10 (§4)");
need(res.result.rate?.idle === 1 && res.result.rate?.max === 50, "authenticate0-result: rate 1..50 (§4)");
hasVerdict(res.result.verdict, "authenticate0-result");

const hbText = await readFile(join(ex, "heartbeat.json"), "utf8");
const hb = JSON.parse(hbText);
const wire = Buffer.byteLength(JSON.stringify(hb), "utf8");
need(wire <= 200, `heartbeat: ${wire} bytes on the wire, budget 200 (§4)`);
for (const k of ["s", "n", "t", "a"]) need(k in hb, `heartbeat: ${k}`);
need([1, 5, 10, 25, 50].includes(hb.a), "heartbeat: a is one of 1 5 10 25 50");
need(!("b" in hb) || (typeof hb.b === "string" && hb.b.length <= 88), "heartbeat: b ≤ 88 characters");
need(!("h" in hb) || Object.keys(hb.h).every((k) => ["cpu", "temp", "batt", "rssi"].includes(k) && Number.isInteger(hb.h[k])), "heartbeat: h is integers of cpu temp batt rssi");

for (const name of (await readdir(ex)).filter((n) => n.startsWith("agent-card-"))) {
  const card = await load(name);
  for (const k of ["name", "glyph", "class", "scheme", "capabilities", "verdict_required", "endpoint"]) need(k in card, `${name}: ${k}`);
  need(["noevo", "evo"].includes(card.class), `${name}: class noevo|evo`);
  need(card.class !== "evo" || card.verdict_required === true, `${name}: an EVO card requires a verdict (§6)`);
}

const use = await load("use-reply.json");
need("verdict" in (use.result ?? {}), "use-reply: result.verdict (§5: every reply carries a verdict)");
hasVerdict(use.result?.verdict, "use-reply");

const contract = await readFile(join(root, "contract.md"), "utf8");
const cited = contract.match(/sha256 `([0-9a-f]{64})`/)?.[1];
need(!!cited, "contract §9 cites the status-line spec by sha256");
const specArg = process.argv.indexOf("--spec");
if (specArg > 0 && process.argv[specArg + 1]) {
  const spec = await readFile(process.argv[specArg + 1]);
  const actual = createHash("sha256").update(spec).digest("hex");
  need(actual === cited, `contract §9 hash equals the status-line spec's (${actual.slice(0, 16)} vs cited ${String(cited).slice(0, 16)})`);
} else {
  ok.push("contract §9 hash not compared: pass --spec <path> to the status-line spec");
}

for (const f of failures) console.log(`FAIL  ${f}`);
console.log(`${failures.length ? "FAIL" : "OK"}  ${ok.length} rule(s) hold, ${failures.length} fail; heartbeat ${wire} B`);
process.exit(failures.length ? 1 : 0);
