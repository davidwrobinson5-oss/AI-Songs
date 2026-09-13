export type ProviderEstimate = { usd: number; source: string };

type Receipt = {
  model?: unknown;
  units?: Record<string, unknown>;
};

function nonnegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

// List prices are intentionally conservative: cached tokens are counted at the
// full input rate until a provider invoice confirms the realized discount.
export function estimateProviderUsd(provider: string, receipt: Receipt): ProviderEstimate | null {
  if (provider !== "openai" || typeof receipt.model !== "string") return null;
  if (!(receipt.model === "gpt-5.6-sol" || receipt.model.startsWith("gpt-5.6-sol-"))) return null;

  const inputTokens = nonnegativeNumber(receipt.units?.input_tokens);
  const outputTokens = nonnegativeNumber(receipt.units?.output_tokens);
  if (inputTokens === 0 && outputTokens === 0) return null;

  const usd = (inputTokens * 4 + outputTokens * 20) / 1_000_000;
  return {
    usd: Number(usd.toFixed(9)),
    source: "openai_list_price_2026-09-13_conservative",
  };
}
