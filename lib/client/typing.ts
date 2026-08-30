export interface SegmentGraphemeOptions {
  forceFallback?: boolean;
  locale?: string;
}

export interface AdvanceTypingInput {
  visible: number;
  total: number;
  elapsedMs: number;
  remainderMs?: number;
  rate?: number;
  maximumLagMs?: number;
  flush?: boolean;
  reducedMotion?: boolean;
  hidden?: boolean;
  disabled?: boolean;
}

export interface TypingProgress {
  visible: number;
  remainderMs: number;
}

const combiningMark = /\p{Mark}/u;
const regionalIndicator = /\p{Regional_Indicator}/u;
const emojiModifier = /[\u{1F3FB}-\u{1F3FF}]/u;
const variationSelector = /[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/u;
const zeroWidthJoiner = "\u200D";

function fallbackSegments(value: string): string[] {
  const clusters: string[] = [];
  let joinNext = false;

  for (const point of Array.from(value)) {
    const index = clusters.length - 1;
    if (index < 0) {
      clusters.push(point);
      continue;
    }

    if (joinNext) {
      clusters[index] += point;
      joinNext = false;
      continue;
    }

    if (point === zeroWidthJoiner) {
      clusters[index] += point;
      joinNext = true;
      continue;
    }

    if (combiningMark.test(point) || emojiModifier.test(point) || variationSelector.test(point)) {
      clusters[index] += point;
      continue;
    }

    if (regionalIndicator.test(point)) {
      const previous = Array.from(clusters[index]);
      if (previous.length === 1 && regionalIndicator.test(previous[0] ?? "")) {
        clusters[index] += point;
        continue;
      }
    }

    clusters.push(point);
  }

  return clusters;
}

export function segmentGraphemes(
  value: string,
  options: SegmentGraphemeOptions = {},
): string[] {
  if (!options.forceFallback && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(options.locale ?? "zh-CN", { granularity: "grapheme" });
    return [...segmenter.segment(value)].map(({ segment }) => segment);
  }
  return fallbackSegments(value);
}

export function advanceTyping(input: AdvanceTypingInput): TypingProgress {
  const total = Math.max(0, Math.floor(input.total));
  const visible = Math.min(total, Math.max(0, Math.floor(input.visible)));
  if (
    input.flush === true
    || input.reducedMotion === true
    || input.hidden === true
    || input.disabled === true
  ) return { visible: total, remainderMs: 0 };
  if (visible >= total) return { visible: total, remainderMs: 0 };

  const rate = Math.max(1, input.rate ?? 45);
  const maximumLagMs = Math.max(0, input.maximumLagMs ?? 250);
  const elapsedMs = Math.max(0, input.elapsedMs);
  const remainderMs = Math.max(0, input.remainderMs ?? 0);
  const availableMs = elapsedMs + remainderMs;
  const millisecondsPerGrapheme = 1_000 / rate;
  const baseAdvance = Math.floor(availableMs / millisecondsPerGrapheme);
  const maximumLag = Math.ceil((maximumLagMs / 1_000) * rate);
  const catchUpTarget = Math.max(visible, total - maximumLag);
  const nextVisible = Math.min(
    total,
    Math.max(catchUpTarget, visible + baseAdvance),
  );
  return {
    visible: nextVisible,
    remainderMs: nextVisible >= total
      ? 0
      : availableMs - baseAdvance * millisecondsPerGrapheme,
  };
}
