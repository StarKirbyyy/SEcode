import { createHash } from "node:crypto";

import type { ToolDependencies } from "./dependencies";
import {
  MAX_TEXT_FILE_BYTES,
  createToolFailure,
  type LocalToolName,
} from "./types";

const fatalDecoder = new TextDecoder("utf-8", { fatal: true });

export interface TextFileContent {
  bytes: Buffer;
  text: string;
  sha256: string;
  totalLines: number;
  mode: number;
}

export class FileContentError extends Error {
  constructor(
    readonly code: "too_large" | "binary" | "io",
    readonly actualBytes?: number,
    cause?: unknown,
  ) {
    super(code);
    this.name = "FileContentError";
    Object.defineProperty(this, "cause", {
      configurable: true,
      enumerable: false,
      value: cause,
      writable: false,
    });
  }
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function readTextFileAbsolute(
  absolutePath: string,
  dependencies: ToolDependencies,
  maxBytes = MAX_TEXT_FILE_BYTES,
): Promise<TextFileContent> {
  let stats;
  try {
    stats = await dependencies.fileSystem.stat(absolutePath);
  } catch (cause) {
    throw new FileContentError("io", undefined, cause);
  }
  if (!stats.isFile()) throw new FileContentError("io");
  if (stats.size > maxBytes) throw new FileContentError("too_large", stats.size);

  let bytes: Buffer;
  try {
    bytes = await dependencies.fileSystem.readFile(absolutePath);
  } catch (cause) {
    throw new FileContentError("io", undefined, cause);
  }
  if (bytes.byteLength > maxBytes) {
    throw new FileContentError("too_large", bytes.byteLength);
  }
  if (bytes.includes(0)) {
    throw new FileContentError("binary", bytes.byteLength);
  }

  let text: string;
  try {
    text = fatalDecoder.decode(bytes);
  } catch {
    throw new FileContentError("binary", bytes.byteLength);
  }

  return {
    bytes,
    text,
    sha256: sha256Bytes(bytes),
    totalLines: text.length === 0 ? 0 : text.split("\n").length,
    mode: stats.mode & 0o777,
  };
}

export function selectLineRange(
  text: string,
  startLine: number,
  endLine?: number,
): { value: string; startLine: number; endLine: number; totalLines: number } {
  if (text.length === 0) {
    if (startLine !== 1 || (endLine !== undefined && endLine !== 1)) {
      throw new RangeError("line range is outside the file");
    }
    return { value: "", startLine: 1, endLine: 0, totalLines: 0 };
  }
  const lines = text.split("\n");
  if (startLine > lines.length) {
    throw new RangeError("line range is outside the file");
  }
  const resolvedEnd = endLine ?? lines.length;
  if (resolvedEnd > lines.length) {
    throw new RangeError("line range is outside the file");
  }
  return {
    value: lines.slice(startLine - 1, resolvedEnd).join("\n"),
    startLine,
    endLine: resolvedEnd,
    totalLines: lines.length,
  };
}

export function fileContentFailure(
  error: FileContentError,
  toolName: LocalToolName,
  relativePath: string,
) {
  if (error.code === "too_large") {
    return createToolFailure(
      "FILE_TOO_LARGE",
      "文件超过文本工具大小限制",
      true,
      {
        toolName,
        relativePath,
        reason: "file_too_large",
        limit: MAX_TEXT_FILE_BYTES,
        ...(error.actualBytes === undefined
          ? {}
          : { actual: error.actualBytes }),
      },
    );
  }
  if (error.code === "binary") {
    return createToolFailure(
      "FILE_BINARY_UNSUPPORTED",
      "文件不是受支持的 UTF-8 文本",
      true,
      { toolName, relativePath, reason: "binary_or_invalid_utf8" },
    );
  }
  return createToolFailure(
    "FILE_IO_ERROR",
    "文件读取失败",
    true,
    { toolName, relativePath, reason: "file_io_error" },
  );
}
