import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ServerLayerError } from "@/lib/server/errors";
import { createWorkspacePickerService } from "@/lib/server/workspace-picker";

const roots = new Set<string>();

async function fixture() {
  const root = await fs.mkdtemp(path.join(tmpdir(), "secode-picker-"));
  roots.add(root);
  const pickerRoot = path.join(root, "code-area");
  const outside = path.join(root, "outside");
  await fs.mkdir(pickerRoot);
  await fs.mkdir(outside);
  return { root, pickerRoot, outside };
}

async function code(work: Promise<unknown>): Promise<string> {
  try {
    await work;
    throw new Error("expected picker error");
  } catch (error) {
    expect(error).toBeInstanceOf(ServerLayerError);
    return (error as ServerLayerError).error.code;
  }
}

afterEach(async () => {
  await Promise.all([...roots].map((root) => fs.rm(root, { recursive: true, force: true })));
  roots.clear();
});

describe("workspace picker service", () => {
  it("keeps a missing or empty picker root unavailable", async () => {
    await expect(code(createWorkspacePickerService({ env: {} }).browse({ segments: [] }))).resolves.toBe("API_WORKSPACE_PICKER_UNAVAILABLE");
    await expect(code(createWorkspacePickerService({ env: { SECODE_WORKSPACE_PICKER_ROOT: "  " } }).browse({ segments: [] }))).resolves.toBe("API_WORKSPACE_PICKER_UNAVAILABLE");
  });

  it("maps invalid configured roots to a finite configuration error", async () => {
    const { root } = await fixture();
    const file = path.join(root, "file.txt");
    await fs.writeFile(file, "x");
    for (const configured of ["relative", path.join(root, "missing"), file, path.parse(root).root]) {
      const service = createWorkspacePickerService({ env: { SECODE_WORKSPACE_PICKER_ROOT: configured } });
      await expect(code(service.browse({ segments: [] })), configured).resolves.toBe("API_WORKSPACE_PICKER_CONFIG_INVALID");
    }
  });

  it("binds a canonical root and lists only sorted directories", async () => {
    const { root, pickerRoot } = await fixture();
    const alias = path.join(root, "alias");
    await fs.symlink(pickerRoot, alias, "dir");
    await fs.mkdir(path.join(pickerRoot, "项目"));
    await fs.mkdir(path.join(pickerRoot, ".visible"));
    await fs.mkdir(path.join(pickerRoot, "z-last"));
    await fs.mkdir(path.join(pickerRoot, ".git"));
    await fs.mkdir(path.join(pickerRoot, "node_modules"));
    await fs.writeFile(path.join(pickerRoot, "README.md"), "hidden from picker");

    const result = await createWorkspacePickerService({ env: { SECODE_WORKSPACE_PICKER_ROOT: alias } }).browse({ segments: [] });

    expect(result.root.workspacePath).toBe(await fs.realpath(pickerRoot));
    expect(result.current.workspacePath).toBe(result.root.workspacePath);
    expect(result.current.segments).toEqual([]);
    expect(result.parentSegments).toBeNull();
    expect(result.directories.map(({ name }) => name)).toEqual([".visible", "z-last", "项目"]);
    expect(result.ignoredEntries).toBe(3);
    expect(result.blockedEntries).toBe(0);
  });

  it("browses nested Unicode directories and returns a parent", async () => {
    const { pickerRoot } = await fixture();
    await fs.mkdir(path.join(pickerRoot, "项目", "源码"), { recursive: true });
    const service = createWorkspacePickerService({ env: { SECODE_WORKSPACE_PICKER_ROOT: pickerRoot } });
    const result = await service.browse({ segments: ["项目"] });
    expect(result.current).toMatchObject({ label: "项目", segments: ["项目"] });
    expect(result.parentSegments).toEqual([]);
    expect(result.directories).toEqual([{ name: "源码", segments: ["项目", "源码"], symbolicLink: false }]);
  });

  it("marks internal symlinks and blocks external or broken symlinks", async () => {
    const { pickerRoot, outside } = await fixture();
    await fs.mkdir(path.join(pickerRoot, "target"));
    await fs.symlink(path.join(pickerRoot, "target"), path.join(pickerRoot, "inside-link"), "dir");
    await fs.symlink(outside, path.join(pickerRoot, "escape-link"), "dir");
    await fs.symlink(path.join(pickerRoot, "missing"), path.join(pickerRoot, "broken-link"), "dir");

    const result = await createWorkspacePickerService({ env: { SECODE_WORKSPACE_PICKER_ROOT: pickerRoot } }).browse({ segments: [] });
    expect(result.directories).toEqual([
      { name: "inside-link", segments: ["inside-link"], symbolicLink: true },
      { name: "target", segments: ["target"], symbolicLink: false },
    ]);
    expect(result.blockedEntries).toBe(2);
  });

  it("sorts before applying the 500 directory limit", async () => {
    const { pickerRoot } = await fixture();
    await Promise.all(Array.from({ length: 501 }, (_, index) => fs.mkdir(path.join(pickerRoot, `dir-${String(index).padStart(3, "0")}`))));
    const result = await createWorkspacePickerService({ env: { SECODE_WORKSPACE_PICKER_ROOT: pickerRoot } }).browse({ segments: [] });
    expect(result.directories).toHaveLength(500);
    expect(result.directories.at(0)?.name).toBe("dir-000");
    expect(result.directories.at(-1)?.name).toBe("dir-499");
    expect(result.truncated).toBe(true);
  });

  it("rejects invalid input and a current directory that escapes or changes type", async () => {
    const { pickerRoot, outside } = await fixture();
    await fs.writeFile(path.join(pickerRoot, "file"), "x");
    await fs.symlink(outside, path.join(pickerRoot, "escape"), "dir");
    const service = createWorkspacePickerService({ env: { SECODE_WORKSPACE_PICKER_ROOT: pickerRoot } });

    await expect(code(service.browse({ segments: [".."] }))).resolves.toBe("API_WORKSPACE_PICKER_PATH_INVALID");
    await expect(code(service.browse({ segments: ["file"] }))).resolves.toBe("API_WORKSPACE_PICKER_PATH_INVALID");
    await expect(code(service.browse({ segments: ["escape"] }))).resolves.toBe("API_WORKSPACE_PICKER_PATH_FORBIDDEN");
  });

  it("invalidates the cached root identity after replacement", async () => {
    const { pickerRoot } = await fixture();
    const service = createWorkspacePickerService({ env: { SECODE_WORKSPACE_PICKER_ROOT: pickerRoot } });
    await expect(service.browse({ segments: [] })).resolves.toBeDefined();
    await fs.rename(pickerRoot, `${pickerRoot}-old`);
    await fs.mkdir(pickerRoot);
    await expect(code(service.browse({ segments: [] }))).resolves.toBe("API_WORKSPACE_PICKER_UNAVAILABLE");
  });

  it("does not return a directory replaced by an escaping symlink during enumeration", async () => {
    const { pickerRoot, outside } = await fixture();
    const victim = path.join(pickerRoot, "victim");
    await fs.mkdir(victim);
    let replaced = false;
    const service = createWorkspacePickerService({
      env: { SECODE_WORKSPACE_PICKER_ROOT: pickerRoot },
      fileSystem: {
        async readdir(targetPath) {
          const entries = await fs.readdir(targetPath, { withFileTypes: true });
          if (!replaced && path.basename(targetPath) === "victim") {
            replaced = true;
            await fs.rename(victim, `${victim}-old`);
            await fs.symlink(outside, victim, "dir");
          }
          return entries;
        },
      },
    });

    await expect(code(service.browse({ segments: ["victim"] }))).resolves.toBe("API_WORKSPACE_PICKER_PATH_FORBIDDEN");
  });

  it("redacts unexpected directory read failures", async () => {
    const { pickerRoot, outside } = await fixture();
    const service = createWorkspacePickerService({
      env: { SECODE_WORKSPACE_PICKER_ROOT: pickerRoot },
      fileSystem: {
        async readdir() {
          throw new Error(`private path ${outside}`);
        },
      },
    });
    try {
      await service.browse({ segments: [] });
      throw new Error("expected picker error");
    } catch (error) {
      expect(error).toBeInstanceOf(ServerLayerError);
      const info = (error as ServerLayerError).error;
      expect(info).toMatchObject({ code: "API_WORKSPACE_PICKER_IO_ERROR", recoverable: false });
      expect(JSON.stringify(info)).not.toContain(outside);
      expect(JSON.stringify(info)).not.toContain("stack");
    }
  });
});
