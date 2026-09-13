export type ProviderName = 'openai' | 'elevenlabs' | 'mureka' | 'kits' | 'klangio';
export type ProviderReceipt = {
  providerRequestId: string | null;
  providerTaskId: string | null;
  model: string | null;
  serviceTier: string | null;
  units: Record<string, number>;
};
function finiteCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e12;
}
function identifier(value: unknown) {
  return typeof value === 'string' && /^[a-zA-Z0-9_.:/-]{1,200}$/.test(value) ? value : null;
}
export function providerForUrl(value: string): ProviderName | null {
  const url = new URL(value);
  if (url.protocol !== 'https:') return null;
  return ({ 'api.openai.com': 'openai', 'api.elevenlabs.io': 'elevenlabs', 'api.mureka.ai': 'mureka', 'arpeggi.io': 'kits', 'api.klang.io': 'klangio' } as const)[url.hostname] || null;
}
// Whitelist accounting fields only. Never retain prompts, outputs, files, URLs, or credentials.
export function extractProviderReceipt(provider: ProviderName, headers: Headers, body: any): ProviderReceipt {
  const receipt: ProviderReceipt = {
    providerRequestId: identifier(headers.get('x-request-id') || headers.get('request-id')),
    providerTaskId: identifier(typeof body?.id === 'number' ? String(body.id) : body?.id || body?.task_id || body?.job_id),
    model: identifier(body?.model), serviceTier: identifier(body?.service_tier), units: {},
  };
  if (provider === 'openai') {
    for (const [key,value] of Object.entries({
      input_tokens:body?.usage?.input_tokens,
      cached_input_tokens:body?.usage?.input_tokens_details?.cached_tokens,
      cache_write_tokens:body?.usage?.input_tokens_details?.cache_write_tokens,
      output_tokens:body?.usage?.output_tokens,
    })) if (finiteCount(value)) receipt.units[key] = value;
  }
  // Keep the provider's header unit explicit: it is not a USD amount.
  if (provider === 'elevenlabs') {
    const value = headers.get('x-character-cost');
    if (value !== null && /^\d+(\.\d+)?$/.test(value) && finiteCount(Number(value))) receipt.units.character_cost = Number(value);
  }
  return receipt;
}
