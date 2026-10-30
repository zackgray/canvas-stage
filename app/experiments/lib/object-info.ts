/**
 * Cache Cloud object_info to experiments/cache/object_info.json (no secrets in it) and print
 * the inputs/outputs of the named nodes. Never prints the API key.
 *   node --env-file=.env --import tsx experiments/lib/object-info.ts [--refresh] Node1 Node2 ...
 *   ... --grep <regex>    list node classes matching a regex
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fetchObjectInfo, resolveDiscoveryTarget, type ObjectInfo } from "../../server/comfy/index.ts";

const CACHE = join(resolve(import.meta.dirname, ".."), "cache", "object_info.json");

export async function objectInfo(refresh = false): Promise<ObjectInfo> {
  if (!refresh && existsSync(CACHE)) return JSON.parse(await readFile(CACHE, "utf8")) as ObjectInfo;
  const info = await fetchObjectInfo(resolveDiscoveryTarget("cloud"));
  await mkdir(join(CACHE, ".."), { recursive: true });
  await writeFile(CACHE, JSON.stringify(info));
  return info;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const args = process.argv.slice(2);
  const info = await objectInfo(args.includes("--refresh"));
  const gi = args.indexOf("--grep");
  if (gi >= 0) {
    const re = new RegExp(args[gi + 1], "i");
    for (const [k, v] of Object.entries(info)) if (re.test(k) || re.test(v.category ?? "")) console.log(k, "|", v.category, "|", v.python_module);
  } else {
    for (const n of args.filter((a) => !a.startsWith("--"))) {
      const d = info[n];
      if (!d) { console.log(`${n}: MISSING`); continue; }
      const short = JSON.stringify({ input: d.input, output: d.output, output_name: (d as Record<string, unknown>).output_name }, (_k, v) =>
        Array.isArray(v) && v.length > 25 && typeof v[0] === "string" ? [...v.slice(0, 25), `…+${v.length - 25}`] : v);
      console.log(`== ${n}\n${short}\n`);
    }
  }
}
