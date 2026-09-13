import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateProviderUsd } from '../../supabase/functions/_shared/providerPricing.ts';

test('estimates measured GPT-5.6 Sol token usage from the pinned list price', () => {
  assert.deepEqual(
    estimateProviderUsd('openai', {
      model: 'gpt-5.6-sol',
      units: { input_tokens: 79, cached_input_tokens: 0, output_tokens: 150 },
    }),
    { usd: 0.003316, source: 'openai_list_price_2026-09-13_conservative' },
  );
});

test('does not invent prices for unknown providers or models', () => {
  assert.equal(estimateProviderUsd('elevenlabs', { model: 'music_v2', units: { character_cost: 900 } }), null);
  assert.equal(estimateProviderUsd('openai', { model: 'future-model', units: { input_tokens: 100 } }), null);
  assert.equal(estimateProviderUsd('openai', { model: 'gpt-5.6-sol', units: {} }), null);
});
