import path from "node:path";

const SENSITIVE_SEGMENTS = new Set([".git", ".secode-data"]);
const SENSITIVE_BASENAMES = new Set([
  ".npmrc",
  ".pypirc",
  ".netrc",
  ".git-credentials",
  "id_rsa",
  "id_ed25519",
]);
const ALLOWED_ENV_TEMPLATES = new Set([
  ".env.example",
  ".env.sample",
  ".env.template",
]);

export function isSensitiveWorkspacePath(relativePath: string): boolean {
  const segments = relativePath === "." ? [] : relativePath.split("/");
  if (segments.some((segment) => SENSITIVE_SEGMENTS.has(segment))) {
    return true;
  }
  const basename = path.posix.basename(relativePath).toLowerCase();
  if (ALLOWED_ENV_TEMPLATES.has(basename)) return false;
  if (basename === ".env" || basename.startsWith(".env.")) return true;
  if (SENSITIVE_BASENAMES.has(basename)) return true;
  return basename.endsWith(".pem") || basename.endsWith(".key");
}

export function isIgnoredDirectoryName(name: string): boolean {
  return (
    name === ".git" ||
    name === ".secode-data" ||
    name === "node_modules" ||
    name === ".next"
  );
}
