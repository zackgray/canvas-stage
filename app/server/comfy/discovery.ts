/**
 * Node and model discovery over the ComfyUI-compatible HTTP API.
 * Works against a local ComfyUI and Comfy Cloud alike (Cloud documents
 * GET /api/object_info with X-API-Key; it documents no model-listing route).
 *
 * Model availability is read from loader-node combo options in object_info,
 * which is the one source both surfaces share. On a local ComfyUI we also
 * read /api/models/<folder> for folders no core loader exposes.
 *
 * Self-signed TLS (a ComfyUI on your own network): run Node with NODE_USE_SYSTEM_CA=1 if the CA is
 * in the OS trust store, else NODE_TLS_REJECT_UNAUTHORIZED=0.
 */
import type { DiscoveryTarget } from "./target.ts";

export type NodeDef = {
  input?: Record<string, Record<string, unknown> | undefined>;
  output?: string[];
  python_module?: string;
  category?: string;
};
export type ObjectInfo = Record<string, NodeDef>;

async function getJson(t: DiscoveryTarget, path: string): Promise<unknown> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (t.apiKey) headers["X-API-Key"] = t.apiKey;
  const res = await fetch(`${t.baseUrl}${path}`, { headers });
  if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
  return res.json();
}

export async function fetchObjectInfo(t: DiscoveryTarget): Promise<ObjectInfo> {
  return (await getJson(t, "/api/object_info")) as ObjectInfo;
}

/** Combo options of one input, handling legacy [[...]] and V3 ["COMBO",{options}] shapes. */
export function comboOptions(spec: unknown): string[] {
  if (!Array.isArray(spec)) return [];
  if (Array.isArray(spec[0])) return spec[0].filter((x): x is string => typeof x === "string");
  const opts = (spec[1] as { options?: unknown } | undefined)?.options;
  return Array.isArray(opts) ? opts.filter((x): x is string => typeof x === "string") : [];
}

/** Every string option offered by any combo input of any node. */
export function allComboValues(info: ObjectInfo): Set<string> {
  const out = new Set<string>();
  for (const def of Object.values(info)) {
    for (const group of Object.values(def.input ?? {})) {
      for (const spec of Object.values(group ?? {})) {
        for (const v of comboOptions(spec)) out.add(v);
      }
    }
  }
  return out;
}

/**
 * Model files per folder. Local ComfyUI: /api/models/<folder>.
 * Cloud: tries the undocumented /api/experiment/models/<folder>; returns
 * undefined if it is not served, so callers fall back to combo options.
 */
export async function listModelFolder(
  t: DiscoveryTarget,
  folder: string,
): Promise<string[] | undefined> {
  const path =
    t.kind === "cloud" ? `/api/experiment/models/${folder}` : `/api/models/${folder}`;
  try {
    const body = await getJson(t, path);
    if (!Array.isArray(body)) return undefined;
    // Cloud's experimental route returns objects ({ name, ... }); local returns strings.
    return body
      .map((x) => (typeof x === "string" ? x : (x as { name?: string }).name))
      .filter((x): x is string => typeof x === "string");
  } catch {
    return undefined;
  }
}

export async function listModelFolders(t: DiscoveryTarget): Promise<string[] | undefined> {
  if (t.kind === "cloud") return undefined;
  try {
    const body = await getJson(t, "/api/models");
    return Array.isArray(body) ? body.filter((x): x is string => typeof x === "string") : undefined;
  } catch {
    return undefined;
  }
}
