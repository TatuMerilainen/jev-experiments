/** jev-1.13 price per input token. Output tokens are free. */
export const PRICE_PER_TOKEN_USD = 0.042 / 1_000_000;

export function formatMs(ms: number): string {
  if (ms < 10) return `${ms.toFixed(1)} ms`;
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(Math.round(tokens));
  return tokens < 1_000_000 ? `${(tokens / 1000).toFixed(1)}k` : `${(tokens / 1_000_000).toFixed(2)}M`;
}

/** Two significant digits below one cent, so a single Jev call ($0.00003) does not show as zero. */
export function formatUsd(usd: number): string {
  if (usd === 0) return "$0";
  return usd < 0.01 ? `$${Number(usd.toPrecision(2))}` : `$${usd.toFixed(2)}`;
}
