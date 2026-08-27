import path from "node:path";

import {
  normalizeWorkspaceRelativePath,
  resolveExistingWorkspacePath,
  WorkspaceLayerError,
} from "@/lib/workspace";

import { listenForAbort, throwIfAborted } from "./abort";
import {
  nativeToolDependencies,
  type ToolDependencies,
} from "./dependencies";
import {
  FileContentError,
  readTextFileAbsolute,
} from "./file-content";
import { limitToolOutput } from "./output";
import {
  isIgnoredDirectoryName,
  isSensitiveWorkspacePath,
} from "./sensitive-path";
import {
  MAX_FALLBACK_SEARCH_FILES,
  createToolFailure,
  createToolSuccess,
  type LocalToolExecutionContext,
  type SearchTextArguments,
} from "./types";

interface SearchMatch {
  relativePath: string;
  line: number;
  column: number;
  preview: string;
}

interface SearchOutcome {
  engine: "rg" | "node";
  matches: SearchMatch[];
  scannedFiles: number;
  skippedBinary: number;
  skippedLarge: number;
  truncated: boolean;
}

function renderSearchResult(arguments_: SearchTextArguments, outcome: SearchOutcome) {
  const rendered = outcome.matches.map(
    (match) =>
      match.relativePath +
      ":" +
      match.line +
      ":" +
      match.column +
      ": " +
      match.preview.replace(/\r?\n$/, ""),
  );
  const limited = limitToolOutput(rendered.join("\n"));
  return createToolSuccess(
    outcome.matches.length === 0 ? "未找到匹配文本" : "文本搜索完成",
    limited.value,
    {
      engine: outcome.engine,
      path: arguments_.path,
      returnedMatches: outcome.matches.length,
      scannedFiles: outcome.scannedFiles,
      skippedBinary: outcome.skippedBinary,
      skippedLarge: outcome.skippedLarge,
      truncated: outcome.truncated || limited.truncated,
      originalBytes: limited.originalBytes,
      returnedBytes: limited.returnedBytes,
    },
  );
}

function errnoCode(cause: unknown): string | undefined {
  return cause !== null &&
    typeof cause === "object" &&
    "code" in cause &&
    typeof cause.code === "string"
    ? cause.code
    : undefined;
}

async function searchWithRg(
  context: LocalToolExecutionContext,
  arguments_: SearchTextArguments,
  dependencies: ToolDependencies,
): Promise<SearchOutcome | "unavailable"> {
  const start = await resolveExistingWorkspacePath(
    context.workspace,
    arguments_.path,
  );
  const startIsFile = start.kind === "file";
  if (start.kind !== "file" && start.kind !== "directory") {
    return {
      engine: "rg",
      matches: [],
      scannedFiles: 0,
      skippedBinary: 0,
      skippedLarge: 0,
      truncated: false,
    };
  }
  const cwd = startIsFile ? path.dirname(start.absolutePath) : start.absolutePath;
  const target = startIsFile ? path.basename(start.absolutePath) : ".";
  const baseRelative = startIsFile
    ? path.posix.dirname(start.relativePath)
    : start.relativePath;
  const argv = [
    "--json",
    "--fixed-strings",
    "--line-number",
    "--column",
    "--color",
    "never",
    "--glob",
    "!.git/**",
    "--glob",
    "!.secode-data/**",
    "--glob",
    "!node_modules/**",
    "--glob",
    "!.next/**",
    "--glob",
    "!.env",
    "--glob",
    "!.env.*",
    "--glob",
    "!*.pem",
    "--glob",
    "!*.key",
    "--glob",
    "!id_rsa",
    "--glob",
    "!id_ed25519",
    "--glob",
    "!.npmrc",
    "--glob",
    "!.pypirc",
    "--glob",
    "!.netrc",
    "--glob",
    "!.git-credentials",
    ...(arguments_.caseSensitive ? [] : ["--ignore-case"]),
    "--",
    arguments_.query,
    target,
  ];

  return new Promise<SearchOutcome | "unavailable">((resolve, reject) => {
    let child;
    try {
      child = dependencies.spawnProcess("rg", argv, {
        cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (cause) {
      if (errnoCode(cause) === "ENOENT") resolve("unavailable");
      else reject(cause);
      return;
    }

    const matches: SearchMatch[] = [];
    const decoder = new TextDecoder();
    let pending = "";
    let internalStop = false;
    let settled = false;
    let stderr = "";

    const cleanupAbort = listenForAbort(context.signal, () => {
      child.kill("SIGTERM");
    });

    const handleLine = (line: string) => {
      if (!line) return;
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        throw new Error("invalid rg JSON");
      }
      if (
        message === null ||
        typeof message !== "object" ||
        !("type" in message) ||
        message.type !== "match" ||
        !("data" in message) ||
        message.data === null ||
        typeof message.data !== "object"
      ) {
        return;
      }
      const data = message.data as {
        path?: { text?: unknown };
        lines?: { text?: unknown };
        line_number?: unknown;
        submatches?: Array<{ start?: unknown }>;
      };
      if (
        typeof data.path?.text !== "string" ||
        typeof data.lines?.text !== "string" ||
        typeof data.line_number !== "number"
      ) {
        throw new Error("invalid rg match");
      }
      const rawPath = data.path.text.replaceAll(path.sep, "/").replace(/^\.\//, "");
      const combined =
        baseRelative === "." ? rawPath : path.posix.join(baseRelative, rawPath);
      const relativePath = normalizeWorkspaceRelativePath(combined);
      if (isSensitiveWorkspacePath(relativePath)) return;
      const submatches =
        data.submatches?.filter(
          (submatch): submatch is { start: number } =>
            typeof submatch.start === "number",
        ) ?? [{ start: 0 }];
      for (const submatch of submatches) {
        const prefix = Buffer.from(data.lines.text).subarray(0, submatch.start);
        const column = Array.from(new TextDecoder().decode(prefix)).length + 1;
        matches.push({
          relativePath,
          line: data.line_number,
          column,
          preview: data.lines.text,
        });
        if (matches.length >= arguments_.limit) {
          internalStop = true;
          child.kill("SIGTERM");
          break;
        }
      }
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      try {
        pending += decoder.decode(chunk, { stream: true });
        if (Buffer.byteLength(pending) > 1024 * 1024) {
          throw new Error("rg JSON line too large");
        }
        let newline = pending.indexOf("\n");
        while (newline >= 0 && !internalStop) {
          const line = pending.slice(0, newline);
          pending = pending.slice(newline + 1);
          handleLine(line);
          newline = pending.indexOf("\n");
        }
      } catch (cause) {
        if (!settled) {
          settled = true;
          cleanupAbort();
          child.kill("SIGTERM");
          reject(cause);
        }
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < 4_096) stderr += chunk.toString("utf8");
    });
    child.once("error", (cause) => {
      if (settled) return;
      settled = true;
      cleanupAbort();
      if (errnoCode(cause) === "ENOENT") resolve("unavailable");
      else reject(cause);
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      cleanupAbort();
      if (context.signal.aborted) {
        reject(context.signal.reason);
        return;
      }
      if (code !== 0 && code !== 1 && !internalStop) {
        reject(new Error(stderr ? "rg failed" : "rg closed unexpectedly"));
        return;
      }
      resolve({
        engine: "rg",
        matches,
        scannedFiles: 0,
        skippedBinary: 0,
        skippedLarge: 0,
        truncated: internalStop,
      });
    });
  });
}

function findMatches(
  text: string,
  query: string,
  caseSensitive: boolean,
): Array<{ line: number; column: number; preview: string }> {
  const matches: Array<{ line: number; column: number; preview: string }> = [];
  const needle = caseSensitive ? query : query.toLocaleLowerCase();
  for (const [lineIndex, line] of text.split("\n").entries()) {
    const haystack = caseSensitive ? line : line.toLocaleLowerCase();
    let from = 0;
    while (from <= haystack.length - needle.length) {
      const found = haystack.indexOf(needle, from);
      if (found < 0) break;
      matches.push({
        line: lineIndex + 1,
        column: Array.from(line.slice(0, found)).length + 1,
        preview: line,
      });
      from = found + Math.max(1, needle.length);
    }
  }
  return matches;
}

async function searchWithNode(
  context: LocalToolExecutionContext,
  arguments_: SearchTextArguments,
  dependencies: ToolDependencies,
): Promise<SearchOutcome> {
  const start = await resolveExistingWorkspacePath(
    context.workspace,
    arguments_.path,
  );
  const queue = [start.relativePath];
  const matches: SearchMatch[] = [];
  let scannedFiles = 0;
  let skippedBinary = 0;
  let skippedLarge = 0;
  let truncated = false;

  while (queue.length > 0 && !truncated) {
    throwIfAborted(context.signal);
    const relativePath = queue.shift()!;
    if (isSensitiveWorkspacePath(relativePath)) continue;
    let resolved;
    try {
      resolved = await resolveExistingWorkspacePath(
        context.workspace,
        relativePath,
      );
    } catch (cause) {
      if (
        cause instanceof WorkspaceLayerError &&
        relativePath !== start.relativePath
      ) {
        continue;
      }
      throw cause;
    }
    if (resolved.kind === "directory") {
      if (resolved.followedSymbolicLink && relativePath !== start.relativePath) {
        continue;
      }
      const entries = await dependencies.fileSystem.readdir(resolved.absolutePath);
      entries.sort((left, right) =>
        left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
      );
      for (const entry of entries) {
        if (isIgnoredDirectoryName(entry.name)) continue;
        if (/[\u0000-\u001f\u007f\\]/.test(entry.name)) continue;
        queue.push(
          relativePath === "."
            ? entry.name
            : path.posix.join(relativePath, entry.name),
        );
      }
      continue;
    }
    if (resolved.kind !== "file") continue;
    scannedFiles += 1;
    if (scannedFiles > MAX_FALLBACK_SEARCH_FILES) {
      truncated = true;
      break;
    }
    try {
      const content = await readTextFileAbsolute(
        resolved.absolutePath,
        dependencies,
      );
      for (const match of findMatches(
        content.text,
        arguments_.query,
        arguments_.caseSensitive,
      )) {
        matches.push({ relativePath, ...match });
        if (matches.length >= arguments_.limit) {
          truncated = true;
          break;
        }
      }
    } catch (cause) {
      if (cause instanceof FileContentError) {
        if (cause.code === "binary") skippedBinary += 1;
        else if (cause.code === "too_large") skippedLarge += 1;
        else throw cause;
      } else {
        throw cause;
      }
    }
  }

  return {
    engine: "node",
    matches,
    scannedFiles,
    skippedBinary,
    skippedLarge,
    truncated,
  };
}

export async function executeSearchText(
  context: LocalToolExecutionContext,
  arguments_: SearchTextArguments,
  dependencies: ToolDependencies = nativeToolDependencies,
) {
  throwIfAborted(context.signal);
  if (isSensitiveWorkspacePath(arguments_.path)) {
    return createToolFailure(
      "TOOL_SENSITIVE_PATH_DENIED",
      "敏感路径不能通过搜索工具访问",
      false,
      {
        toolName: "search_text",
        relativePath: arguments_.path,
        reason: "sensitive_path",
      },
    );
  }
  try {
    const rg = await searchWithRg(context, arguments_, dependencies);
    throwIfAborted(context.signal);
    return renderSearchResult(
      arguments_,
      rg === "unavailable"
        ? await searchWithNode(context, arguments_, dependencies)
        : rg,
    );
  } catch {
    if (context.signal.aborted) throwIfAborted(context.signal);
    return createToolFailure(
      "SEARCH_FAILED",
      "文本搜索失败",
      true,
      {
        toolName: "search_text",
        relativePath: arguments_.path,
        reason: "search_error",
      },
    );
  }
}
