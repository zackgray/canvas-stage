// Comfy Cloud calls the setup scripts make. The key goes only in the X-API-Key header and never into output.
export const CLOUD = 'https://cloud.comfy.org'
export const LORA_FILE = 'ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors'
export const LORA_URL = `https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render/resolve/main/${LORA_FILE}`
export const LORA_PAGE = 'https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render'
export const LORA_BODY = { source_url: LORA_URL, tags: ['models', 'loras'] }

/** Free call: the account's balance. Resolves { status, cents? } or { error }. */
export async function fetchBalance(key, fetchFn = fetch) {
  try {
    const r = await fetchFn(`${CLOUD}/api/billing/balance`, { headers: { 'X-API-Key': key, accept: 'application/json' } })
    if (!r.ok) return { status: r.status }
    const j = await r.json().catch(() => ({}))
    return { status: r.status, cents: typeof j.effective_balance_cents === 'number' ? j.effective_balance_cents : null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
