/**
 * Workflow execution through @comfyorg/sdk. The same code runs against Comfy
 * Cloud (COMFY_API_KEY) and a self-hosted ComfyUI behind comfy-api-proxy
 * (COMFY_BASE_URL, no key). Server-side only.
 *
 * Cost note: never resubmit on a lost response — a resubmit is a second
 * billed job. Recover with client.jobs.get(id) instead (see the SDK README).
 */
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Comfy, Workflow } from "@comfyorg/sdk";

export type ApiGraph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

let shared: Comfy | undefined;

/** One client per process; reads COMFY_BASE_URL / COMFY_API_KEY at first use. */
export function comfy(): Comfy {
  shared ??= new Comfy({ clientInfo: "canvas-stage" });
  return shared;
}

/** Load an API-format workflow JSON (a deep copy, safe to mutate). */
export async function loadGraph(path: string): Promise<ApiGraph> {
  const graph = JSON.parse(await readFile(path, "utf8")) as ApiGraph & { _meta?: unknown };
  // Drop any top-level documentation key; ComfyUI rejects non-node entries.
  for (const k of Object.keys(graph)) if (k.startsWith("_")) delete graph[k];
  return graph;
}

/** Purely local (what `client.workflows.fromJson` does in SDK v1), so building a graph needs no client or key. */
export function toWorkflow(graph: ApiGraph): Workflow {
  return new Workflow(graph);
}

/** Bind a local file to a loader node's filename input (uploaded on submit, deduped by hash). */
export function bindFile(wf: Workflow, nodeId: string, field: string, path: string): void {
  wf.setInput(nodeId, field, comfy().assets.fromFile(path));
}

export type SavedOutput = { nodeId: string; path: string };

/**
 * Submit, wait for completion, and download the outputs of the given nodes.
 * `saveAs(nodeId, index)` names each file (relative to outDir).
 */
export async function runAndSave(
  wf: Workflow,
  outDir: string,
  saveAs: Record<string, (index: number) => string>,
  timeoutMs = 10 * 60_000,
): Promise<{ jobId: string; seconds: number; saved: SavedOutput[] }> {
  const t0 = Date.now();
  const job = await comfy().run(wf, { timeoutMs });
  const saved: SavedOutput[] = [];
  for (const [nodeId, name] of Object.entries(saveAs)) {
    const outs = job.getOutputs(nodeId);
    if (outs.length === 0) throw new Error(`job ${job.id}: node ${nodeId} produced no outputs`);
    for (const [i, out] of outs.entries()) {
      const path = join(outDir, name(i));
      await mkdir(dirname(path), { recursive: true });
      await out.toFile(path);
      saved.push({ nodeId, path });
    }
  }
  // Wall clock incl. queue + model load; comfy-api-proxy reports no start/end times.
  const seconds = Math.round((Date.now() - t0) / 100) / 10;
  return { jobId: job.id, seconds, saved };
}
