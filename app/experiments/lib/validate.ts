/**
 * Offline validation of an API-format graph against Cloud object_info (cached): node classes exist, every
 * required input is set, combo values are offered, numbers sit in range, links point at a real output slot
 * whose type matches. Dynamic combos (COMFY_DYNAMICCOMBO_V3) are checked with their "<input>.<sub>" keys.
 *   node --env-file=.env --import tsx experiments/lib/validate.ts <graph.api.json> [...]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ApiGraph } from "../../server/comfy/index.ts";
import type { ObjectInfo } from "../../server/comfy/index.ts";
import { objectInfo } from "./object-info.ts";

type Spec = [unknown, Record<string, unknown>?];

function typesOf(spec: Spec): string[] {
  const t = spec[0];
  if (Array.isArray(t)) return ["COMBO"];
  return String(t).split(",");
}

function comboValues(spec: Spec): unknown[] | undefined {
  if (Array.isArray(spec[0])) return spec[0];
  if (spec[0] === "COMBO") return (spec[1]?.options as unknown[]) ?? undefined;
  return undefined;
}

function checkValue(name: string, spec: Spec, v: unknown, errs: string[]): void {
  const opts = comboValues(spec);
  if (opts && opts.length > 0 && !opts.includes(v)) errs.push(`${name}: ${JSON.stringify(v)} not in [${opts.slice(0, 8).join(", ")}${opts.length > 8 ? ", …" : ""}]`);
  const meta = spec[1] ?? {};
  if ((spec[0] === "INT" || spec[0] === "FLOAT") && typeof v === "number") {
    if (typeof meta.min === "number" && v < meta.min) errs.push(`${name}: ${v} < min ${meta.min}`);
    if (typeof meta.max === "number" && v > meta.max) errs.push(`${name}: ${v} > max ${meta.max}`);
  }
}

export function validateGraph(graph: ApiGraph, info: ObjectInfo): string[] {
  const errs: string[] = [];
  for (const [id, node] of Object.entries(graph)) {
    const def = info[node.class_type];
    if (!def) { errs.push(`[${id}] unknown class ${node.class_type}`); continue; }
    const req = (def.input?.required ?? {}) as Record<string, Spec>;
    const opt = (def.input?.optional ?? {}) as Record<string, Spec>;
    const all: Record<string, Spec> = { ...req, ...opt };
    const expected = new Set<string>();
    const visit = (name: string, spec: Spec, required: boolean) => {
      expected.add(name);
      const v = node.inputs[name];
      if (v === undefined) { if (required) errs.push(`[${id}] ${node.class_type}: missing required ${name}`); return; }
      if (spec[0] === "COMFY_DYNAMICCOMBO_V3") {
        const opts = (spec[1]?.options as { key: string; inputs: { required?: Record<string, Spec>; optional?: Record<string, Spec> } }[]) ?? [];
        const chosen = opts.find((o) => o.key === v);
        if (!chosen) { errs.push(`[${id}] ${name}: ${JSON.stringify(v)} not in [${opts.map((o) => o.key).join(", ")}]`); return; }
        for (const [sub, s] of Object.entries(chosen.inputs.required ?? {})) visit(`${name}.${sub}`, s, true);
        for (const [sub, s] of Object.entries(chosen.inputs.optional ?? {})) visit(`${name}.${sub}`, s, false);
        return;
      }
      if (Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && typeof v[1] === "number") {
        const src = graph[v[0]];
        if (!src) { errs.push(`[${id}] ${name}: link to missing node ${v[0]}`); return; }
        const sdef = info[src.class_type];
        const outType = sdef?.output?.[v[1]];
        if (!outType) { errs.push(`[${id}] ${name}: ${src.class_type} has no output ${v[1]}`); return; }
        const want = typesOf(spec);
        const have = String(outType).split(",");
        const ok = want.includes("*") || have.includes("*") || have.some((h) => want.includes(h)) ||
          (want.includes("COMBO") && (have.includes("COMBO") || have.includes("STRING")));
        if (!ok) errs.push(`[${id}] ${name}: type ${outType} from [${v[0]}] ${src.class_type} does not fit ${want.join("|")}`);
        return;
      }
      checkValue(`[${id}] ${node.class_type}.${name}`, spec, v, errs);
    };
    for (const [n, s] of Object.entries(req)) visit(n, s, true);
    for (const [n, s] of Object.entries(opt)) visit(n, s, false);
    for (const k of Object.keys(node.inputs)) if (!expected.has(k) && !all[k]) errs.push(`[${id}] ${node.class_type}: unexpected input ${k}`);
  }
  return errs;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const info = await objectInfo();
  let bad = 0;
  for (const p of process.argv.slice(2)) {
    const g = JSON.parse(readFileSync(p, "utf8")) as ApiGraph;
    for (const k of Object.keys(g)) if (k.startsWith("_")) delete g[k];
    const errs = validateGraph(g, info);
    console.log(`${errs.length ? "FAIL" : "OK  "} ${p} (${Object.keys(g).length} nodes)`);
    for (const e of errs) console.log("   " + e);
    bad += errs.length;
  }
  process.exit(bad ? 1 : 0);
}
