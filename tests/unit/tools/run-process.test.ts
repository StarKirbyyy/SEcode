import { afterEach, describe, expect, it } from "vitest";

import { MAX_TOOL_OUTPUT_BYTES, utf8ByteLength } from "@/lib/domain";
import { LocalToolExecutionAbortedError } from "@/lib/tools";
import { executeRunProcess } from "@/lib/tools/run-process";

import {
  cleanupAllToolFixtures,
  createToolFixture,
} from "./helpers";

afterEach(cleanupAllToolFixtures);

describe("run_process", () => {
  it("passes shell metacharacters as ordinary argv", async () => {
    const fixture = await createToolFixture();
    const argument = "value; $(not-executed) | >";
    const result = await executeRunProcess(
      { workspace: fixture.workspace, signal: new AbortController().signal },
      {
        program: process.execPath,
        args: ["-e", "process.stdout.write(process.argv[1])", argument],
        cwd: ".",
        timeoutMs: 5_000,
      },
    );
    expect(result.ok).toBe(true);
    expect(result.output).toContain(argument);
  });

  it("returns a structured nonzero result", async () => {
    const fixture = await createToolFixture();
    const result = await executeRunProcess(
      { workspace: fixture.workspace, signal: new AbortController().signal },
      {
        program: process.execPath,
        args: ["-e", "process.stderr.write('bad'); process.exit(3)"],
        cwd: ".",
        timeoutMs: 5_000,
      },
    );
    expect(result.error?.code).toBe("PROCESS_EXIT_NONZERO");
    expect(result.error?.details?.exitCode).toBe(3);
    expect(result.output).toContain("[stderr] bad");
  });

  it("filters sensitive environment variables", async () => {
    const fixture = await createToolFixture();
    process.env.SECODE_TEST_TOKEN = "must-not-reach-child";
    try {
      const result = await executeRunProcess(
        { workspace: fixture.workspace, signal: new AbortController().signal },
        {
          program: process.execPath,
          args: [
            "-e",
            "process.stdout.write(String(process.env.SECODE_TEST_TOKEN))",
          ],
          cwd: ".",
          timeoutMs: 5_000,
        },
      );
      expect(result.output).toContain("undefined");
      expect(JSON.stringify(result)).not.toContain("must-not-reach-child");
    } finally {
      delete process.env.SECODE_TEST_TOKEN;
    }
  });

  it("propagates external cancellation", async () => {
    const fixture = await createToolFixture();
    const controller = new AbortController();
    const execution = executeRunProcess(
      { workspace: fixture.workspace, signal: controller.signal },
      {
        program: process.execPath,
        args: ["-e", "setInterval(() => {}, 1000)"],
        cwd: ".",
        timeoutMs: 5_000,
      },
    );
    controller.abort("cancelled");
    await expect(execution).rejects.toBeInstanceOf(
      LocalToolExecutionAbortedError,
    );
  });

  it("limits output while continuing to drain the child", async () => {
    const fixture = await createToolFixture();
    const result = await executeRunProcess(
      { workspace: fixture.workspace, signal: new AbortController().signal },
      {
        program: process.execPath,
        args: ["-e", "process.stdout.write('x'.repeat(80000)); process.stdout.write('TAIL')"],
        cwd: ".",
        timeoutMs: 5_000,
      },
    );
    expect(result.ok).toBe(true);
    expect(result.metadata?.truncated).toBe(true);
    expect(result.output).toContain("TAIL");
    expect(utf8ByteLength(result.output ?? "")).toBeLessThanOrEqual(
      MAX_TOOL_OUTPUT_BYTES,
    );
  });

  it("returns a timeout result", async () => {
    const fixture = await createToolFixture();
    const result = await executeRunProcess(
      { workspace: fixture.workspace, signal: new AbortController().signal },
      {
        program: process.execPath,
        args: ["-e", "setInterval(() => {}, 1000)"],
        cwd: ".",
        timeoutMs: 1_000,
      },
    );
    expect(result.error?.code).toBe("PROCESS_TIMEOUT");
    expect(result.metadata?.timedOut).toBe(true);
  });
});
