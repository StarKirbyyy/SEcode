const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const EXPLICIT_SCHEME = /^([A-Za-z][A-Za-z\d+.-]*):/;
const SAFE_SCHEMES = new Set(["http", "https", "mailto"]);

export function safeMarkdownUrl(input: string | undefined): string | undefined {
  if (input === undefined || CONTROL_CHARACTERS.test(input)) return undefined;
  const value = input.trim();
  if (value.length === 0 || value.startsWith("//")) return undefined;
  const scheme = EXPLICIT_SCHEME.exec(value)?.[1]?.toLowerCase();
  if (scheme !== undefined && !SAFE_SCHEMES.has(scheme)) return undefined;
  return value;
}

export interface MarkdownImageDescription {
  label: string;
  href?: string;
}

export function describeMarkdownImage(
  source: string | undefined,
  alt: string | undefined,
): MarkdownImageDescription {
  const cleanAlt = alt?.trim();
  const label = cleanAlt === undefined || cleanAlt.length === 0
    ? "图片"
    : `图片：${cleanAlt}`;
  const href = safeMarkdownUrl(source);
  return { label, ...(href === undefined ? {} : { href }) };
}
