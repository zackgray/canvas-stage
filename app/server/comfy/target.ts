/**
 * Which Comfy deployment this process talks to, resolved from the environment.
 *
 * Execution always goes through @comfyorg/sdk (Comfy API v2):
 *   - COMFY_BASE_URL unset  -> Comfy Cloud, needs COMFY_API_KEY.
 *   - COMFY_BASE_URL set    -> a v2 deployment, e.g. comfy-api-proxy in front of
 *                              a self-hosted ComfyUI (http://127.0.0.1:8189).
 *
 * Discovery (node/model inventory) is not part of the v2 contract, so it uses
 * the ComfyUI-compatible HTTP API instead:
 *   - Cloud: https://cloud.comfy.org/api/object_info with X-API-Key.
 *   - Self-hosted: COMFYUI_URL (the raw ComfyUI behind the proxy, e.g. https://your-comfyui).
 *
 * Server-side only. Never import this from browser code: it reads the API key.
 */

import { NO_COMFY_TARGET } from "../../src/shared/shotContract.ts";

export const COMFY_CLOUD_URL = "https://cloud.comfy.org";

let toldLog = false;
/**
 * The refusal a paid route answers with no Comfy target: plain words for the page (NO_COMFY_TARGET), and once per process the
 * variable names in the server log, where the person setting it up looks.
 */
export function noComfyTarget(): string {
  if (!toldLog) {
    toldLog = true;
    console.warn("[comfy] No Comfy target: set COMFY_API_KEY (Comfy Cloud) or COMFY_BASE_URL (a local ComfyUI behind the v2 proxy) in app/.env and restart the dev server");
  }
  return NO_COMFY_TARGET;
}

export type DiscoveryTarget = {
  kind: "cloud" | "comfyui";
  /** Origin that serves /api/object_info. */
  baseUrl: string;
  /** Sent as X-API-Key (Cloud only). */
  apiKey?: string;
  label: string;
};

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

/** True when the SDK will target Comfy Cloud (no COMFY_BASE_URL). */
export function sdkTargetsCloud(): boolean {
  return env("COMFY_BASE_URL") === undefined;
}

export function describeSdkTarget(): string {
  const base = env("COMFY_BASE_URL");
  return base ? `v2 deployment at ${base}` : `Comfy Cloud (${COMFY_CLOUD_URL})`;
}

/**
 * Resolve where to read node/model inventory from.
 * `spec` is "cloud", "comfyui" (COMFYUI_URL, else COMFY_BASE_URL) or a ComfyUI URL; default is COMFYUI_URL, else Cloud.
 */
export function resolveDiscoveryTarget(spec?: string): DiscoveryTarget {
  const want = spec ?? env("COMFYUI_URL") ?? "cloud";
  if (want === "cloud") {
    const apiKey = env("COMFY_API_KEY");
    if (!apiKey) {
      throw new Error(
        "Comfy Cloud inventory needs COMFY_API_KEY (Creator plan or above). " +
          "Until then, check https://comfy.org/cloud/supported-nodes/ by hand.",
      );
    }
    return { kind: "cloud", baseUrl: COMFY_CLOUD_URL, apiKey, label: "Comfy Cloud" };
  }
  const raw = want === "comfyui" ? (env("COMFYUI_URL") ?? env("COMFY_BASE_URL")) : want;
  if (!raw) throw new Error("Self-hosted inventory needs COMFYUI_URL (or COMFY_BASE_URL) set to your ComfyUI address.");
  let url: URL;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`); } catch { throw new Error(`Cannot read ${raw} as a ComfyUI address; use something like http://127.0.0.1:8188`); }
  // keep a path prefix (a reverse proxy mount) but never a trailing slash: callers append "/api/..."
  return { kind: "comfyui", baseUrl: `${url.origin}${url.pathname.replace(/\/+$/, "")}`, label: url.host };
}
