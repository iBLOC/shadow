import type { MessageTokenStats } from '../types';

/**
 * Rough client-side token estimator for CJK-mixed reply text. There is no
 * tokenizer in the renderer (the OpenAI-compatible endpoints used here do
 * not reliably report usage on stream), so we approximate: CJK glyphs
 * round-trip at ~1 token each under BPE, while latin text averages ~4
 * characters per token.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (isCjkCodePoint(ch.codePointAt(0) ?? 0)) cjk++;
    else other++;
  }
  if (cjk === 0 && other === 0) return 0;
  return Math.max(1, cjk + Math.ceil(other / 4));
}

function isCjkCodePoint(cp: number): boolean {
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK unified ideographs
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK extension A
    (cp >= 0x3040 && cp <= 0x30ff) || // hiragana + katakana
    (cp >= 0xac00 && cp <= 0xd7af) || // hangul syllables
    (cp >= 0x3000 && cp <= 0x303f) || // CJK punctuation
    (cp >= 0xff00 && cp <= 0xffef) //   fullwidth forms
  );
}

/**
 * Build the per-message stats payload from the accumulated reply text and
 * the wall-clock window it streamed in. `startedAtMs` should be the first
 * delta's arrival (fall back to request start), so the speed reflects
 * generation rather than queueing.
 */
export function computeTokenStats(
  text: string,
  startedAtMs: number,
  endedAtMs: number = Date.now(),
): MessageTokenStats {
  const tokens = estimateTokens(text);
  const durationMs = Math.max(0, endedAtMs - startedAtMs);
  const seconds = durationMs / 1000;
  const tokensPerSecond = seconds > 0 ? tokens / seconds : 0;
  return { tokens, durationMs, tokensPerSecond };
}
