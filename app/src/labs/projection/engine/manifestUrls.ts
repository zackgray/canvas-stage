// Every depth manifest the lab loads, in merge order. Dependency-free so the dev server imports the same list
// (server/stills/exports.ts looks scene prompts up in these): a manifest added here is covered on both sides.

/** Bank first; later manifests' shots are listed after it, with ids prefixed when they collide. Locations are the
 *  masters picked in the lab (server/location). */
export const MANIFEST_URLS = ['/lab-assets/bank/manifest.json', '/lab-assets/experiments/e2/manifest.json', '/lab-assets/locations/manifest.json']
