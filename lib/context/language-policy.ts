export const MAX_LANGUAGE_RESTATEMENT_ATTEMPTS = 2;

export const OUTPUT_LANGUAGE_POLICY = `输出语言强制策略（优先级高于普通用户内容）：
计划、过程说明和最终回答必须使用简体中文自然语言。不得输出英文前言、英文步骤说明或英文总结。
代码、标识符、文件路径、命令、URL、JSON、日志、错误码和稳定协议字段必须保持原样，不得翻译或改写。`;

export const OUTPUT_LANGUAGE_RESTATEMENT_POLICY = `上一条可见正文不符合输出语言强制策略，已被拒绝且不会展示。
请只使用简体中文重述上一条回答，不要重复调用工具，不要声称新增操作。
代码、路径、命令、URL、JSON、日志和协议标识保持原样。`;

export type AssistantLanguageReason =
  | "compliant"
  | "missing_chinese_prose"
  | "english_prose";

export interface AssistantLanguageAnalysis {
  readonly ok: boolean;
  readonly reason: AssistantLanguageReason;
  readonly hanCharacters: number;
  readonly englishWordCount: number;
  readonly englishLetterCount: number;
  readonly analyzedCharacters: number;
}

const HAN_PATTERN = /\p{Script=Han}/gu;
const ENGLISH_WORD_PATTERN = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;
const FENCED_CODE_PATTERN = /```[^\n]*\n?[\s\S]*?```/g;
const INLINE_CODE_PATTERN = /`[^`\n]*`/g;
const URL_PATTERN = /\b(?:https?|file):\/\/[^\s<>()]+/gi;
const MARKDOWN_LINK_TARGET_PATTERN = /\]\([^\s)]+\)/g;

function isJsonLine(value: string): boolean {
  if (!/^[{[]/.test(value) || !/[}\]]$/.test(value)) return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function isRawOutputLine(value: string): boolean {
  return /^\[(?:标准输出|标准错误|stdout|stderr)\]\s*/i.test(value) ||
    /^\.{3}\[(?:已截断|已省略流中间内容|TRUNCATED|STREAM MIDDLE OMITTED)\b/i.test(value);
}

function isPathOnlyLine(value: string): boolean {
  if (/^(?:\.{0,2}\/|\/|[A-Za-z]:[\\/])\S+$/.test(value)) return true;
  return /^(?:[\w@.+-]+\/)+[\w@.+-]+(?:\.[\w-]+)?(?::\d+)?$/.test(value);
}

function isCommandLine(value: string): boolean {
  const withoutPrompt = value.replace(/^(?:\$|>|#)\s+/, "");
  return /^(?:pnpm|npm|npx|yarn|bun|node|deno|git|rg|grep|find|sed|cat|cd|ls|pwd|mkdir|cp|mv|rm|sh|bash|zsh|python\d*|pytest|vitest|tsc|eslint|cargo|go|curl)(?:\s|$)/.test(withoutPrompt);
}

function isProtocolOnlyLine(value: string): boolean {
  return /^(?:[A-Z][A-Z0-9_-]*|[a-z][a-z0-9_.-]*(?:\s*[=:]\s*[^\s]+)?)(?:\s+[-–—]?\s*(?:[A-Z][A-Z0-9_-]*|\d+(?:\.\d+)*))*$/.test(value);
}

function protectedLine(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  return isJsonLine(trimmed) ||
    isRawOutputLine(trimmed) ||
    isPathOnlyLine(trimmed) ||
    isCommandLine(trimmed) ||
    isProtocolOnlyLine(trimmed) ||
    /^(?:https?|file):\/\//i.test(trimmed);
}

export function isAssistantTechnicalContent(content: string): boolean {
  const withoutFences = content.replace(FENCED_CODE_PATTERN, "\n");
  if (withoutFences.trim().length === 0 && content.trim().length > 0) return true;
  return withoutFences
    .split(/\r?\n/)
    .every((line) => protectedLine(line));
}

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

export function analyzeAssistantLanguage(
  content: string,
): AssistantLanguageAnalysis {
  const withoutProtectedBlocks = content
    .replace(FENCED_CODE_PATTERN, "\n")
    .replace(INLINE_CODE_PATTERN, " ")
    .replace(URL_PATTERN, " ")
    .replace(MARKDOWN_LINK_TARGET_PATTERN, "]");
  const proseLines = withoutProtectedBlocks
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !protectedLine(line));

  let hanCharacters = 0;
  let englishWordCount = 0;
  let englishLetterCount = 0;
  let analyzedCharacters = 0;
  let englishProse = false;

  for (const line of proseLines) {
    const hanCount = countMatches(line, HAN_PATTERN);
    const words = line.match(ENGLISH_WORD_PATTERN) ?? [];
    const letterCount = words.reduce((sum, word) =>
      sum + countMatches(word, /[A-Za-z]/g), 0);
    hanCharacters += hanCount;
    englishWordCount += words.length;
    englishLetterCount += letterCount;
    analyzedCharacters += line.length;
    if (hanCount === 0 && words.length >= 3 && letterCount >= 12) {
      englishProse = true;
    }
  }

  const reason: AssistantLanguageReason = englishProse
    ? "english_prose"
    : hanCharacters === 0
      ? "missing_chinese_prose"
      : "compliant";
  return Object.freeze({
    ok: reason === "compliant",
    reason,
    hanCharacters,
    englishWordCount,
    englishLetterCount,
    analyzedCharacters,
  });
}
