import { describe, expect, it } from "vitest";

import {
  describeMarkdownImage,
  safeMarkdownUrl,
} from "@/lib/client/markdown";

describe("safe Markdown helpers", () => {
  it.each([
    ["https://example.com/a", "https://example.com/a"],
    ["http://localhost/path", "http://localhost/path"],
    ["mailto:user@example.com", "mailto:user@example.com"],
    ["/docs/start", "/docs/start"],
    ["./relative", "./relative"],
    ["../parent", "../parent"],
    ["#section", "#section"],
  ])("allows %s", (input, expected) => {
    expect(safeMarkdownUrl(input)).toBe(expected);
  });

  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,boom",
    "vbscript:msgbox(1)",
    "java\nscript:alert(1)",
    "//remote.example/image.png",
    "file:///etc/passwd",
  ])("rejects %s", (input) => {
    expect(safeMarkdownUrl(input)).toBeUndefined();
  });

  it("turns images into inert alt text plus an inspectable safe link", () => {
    expect(describeMarkdownImage("https://example.com/image.png", "diagram")).toEqual({ label: "图片：diagram", href: "https://example.com/image.png" });
    expect(describeMarkdownImage("javascript:alert(1)", "unsafe")).toEqual({ label: "图片：unsafe" });
    expect(describeMarkdownImage(undefined, "")).toEqual({ label: "图片" });
  });
});
