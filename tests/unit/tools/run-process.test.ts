import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MAX_TOOL_OUTPUT_BYTES, utf8ByteLength } from "@/lib/domain";
import { LocalToolExecutionAbortedError } from "@/lib/tools";
import { executeRunProcess } from "@/lib/tools/run-process";
import { nativeToolDependencies } from "@/lib/tools/dependencies";

import {
  cleanupAllToolFixtures,
  createToolFixture,
} from "./helpers";

afterEach(cleanupAllToolFixtures);

async function unusedLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessExit(pid: number): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (processIsAlive(pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  expect(processIsAlive(pid)).toBe(false);
}

async function waitForPidFile(targetPath: string): Promise<number> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      const pid = Number(await readFile(targetPath, "utf8"));
      if (Number.isInteger(pid) && pid > 0) return pid;
    } catch {
      // The parent has not written the fixture yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("child pid fixture was not written");
}

describe("run_process", () => {
  it("uses the native HTTP probe instead of global fetch", async () => {
    const server = createHttpServer((_request, response) => response.writeHead(200).end("ok"));
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("stale fetch sentinel"); };
    try {
      await expect(nativeToolDependencies.probeHttp(
        `http://127.0.0.1:${port}/health`,
        new AbortController().signal,
      )).resolves.toEqual({ connected: true, status: 200 });
    } finally {
      globalThis.fetch = originalFetch;
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("returns bounded native probe status and transport categories", async () => {
    const server = createHttpServer((request, response) => {
      if (request.url === "/reset") {
        request.socket.destroy();
        return;
      }
      response.writeHead(404).end("not found");
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    await expect(nativeToolDependencies.probeHttp(
      `http://127.0.0.1:${port}/missing`,
      new AbortController().signal,
    )).resolves.toEqual({ connected: true, status: 404 });
    await expect(nativeToolDependencies.probeHttp(
      `http://127.0.0.1:${port}/reset`,
      new AbortController().signal,
    )).resolves.toEqual({ connected: false, errorCategory: "connection_reset" });
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));

    const unusedPort = await unusedLoopbackPort();
    await expect(nativeToolDependencies.probeHttp(
      `http://127.0.0.1:${unusedPort}/`,
      new AbortController().signal,
    )).resolves.toEqual({ connected: false, errorCategory: "connection_refused" });

    const controller = new AbortController();
    controller.abort("test timeout");
    await expect(nativeToolDependencies.probeHttp(
      `http://127.0.0.1:${unusedPort}/`,
      controller.signal,
    )).resolves.toEqual({ connected: false, errorCategory: "request_timeout" });
  });

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
    expect(result.output).toContain("[标准错误] bad");
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

  it("probes readiness, then closes an explicitly oneshot service", async () => {
    const fixture = await createToolFixture();
    const port = await unusedLoopbackPort();
    const result = await executeRunProcess(
      { workspace: fixture.workspace, signal: new AbortController().signal },
      {
        program: process.execPath,
        args: [
          "-e",
          "require('node:http').createServer((request,response)=>{if(request.headers.cookie||request.headers.authorization){response.writeHead(500).end();return}response.writeHead(204).end()}).listen(Number(process.argv[1]),'127.0.0.1'); setInterval(()=>{},1000)",
          String(port),
        ],
        cwd: ".",
        timeoutMs: 5_000,
        lifecycle: "oneshot",
        readiness: {
          url: `http://127.0.0.1:${port}/health`,
          expectedStatus: 204,
        },
      },
    );
    expect(result).toMatchObject({
      ok: true,
      metadata: {
        ready: true,
        readinessUrl: `http://127.0.0.1:${port}/health`,
        readinessStatus: 204,
        readinessProbeAttempts: expect.any(Number),
        readinessConnected: true,
        timedOut: false,
      },
    });
    await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toBeDefined();
  });

  it("keeps an explicitly service process alive after readiness success", async () => {
    const fixture = await createToolFixture();
    const port = await unusedLoopbackPort();
    const result = await executeRunProcess(
      { workspace: fixture.workspace, signal: new AbortController().signal },
      {
        program: process.execPath,
        args: [
          "-e",
          "require('node:http').createServer((request,response)=>response.writeHead(200).end('ok')).listen(Number(process.argv[1]),'127.0.0.1'); setInterval(()=>{},1000)",
          String(port),
        ],
        cwd: ".",
        timeoutMs: 5_000,
        lifecycle: "service",
        readiness: {
          url: `http://127.0.0.1:${port}/health`,
          expectedStatus: 200,
          timeoutMs: 3_000,
        },
      },
    );
    expect(result).toMatchObject({
      ok: true,
      metadata: { ready: true, lifecycle: "service", pid: expect.any(Number) },
    });
    await expect(fetch(`http://127.0.0.1:${port}/health`)).resolves.toMatchObject({ status: 200 });
    const pid = Number(result.metadata?.pid);
    process.kill(-pid, "SIGTERM");
    await waitForProcessExit(pid);
  });

  it("stops a kept-alive service when its execution signal is cancelled", async () => {
    const fixture = await createToolFixture();
    const port = await unusedLoopbackPort();
    const controller = new AbortController();
    const result = await executeRunProcess(
      { workspace: fixture.workspace, signal: controller.signal },
      {
        program: process.execPath,
        args: [
          "-e",
          "require('node:http').createServer((request,response)=>response.writeHead(200).end('ok')).listen(Number(process.argv[1]),'127.0.0.1'); setInterval(()=>{},1000)",
          String(port),
        ],
        cwd: ".",
        timeoutMs: 5_000,
        lifecycle: "service",
        readiness: { url: `http://127.0.0.1:${port}/`, expectedStatus: 200 },
      },
    );
    const pid = Number(result.metadata?.pid);
    controller.abort("stop service");
    await waitForProcessExit(pid);
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toBeDefined();
  });

  it("does not treat a clean exit before readiness as success", async () => {
    const fixture = await createToolFixture();
    const port = await unusedLoopbackPort();
    const parentSource = "const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); process.stdout.write('CHILD_PID='+child.pid); setTimeout(()=>process.exit(0),50)";
    const result = await executeRunProcess(
      { workspace: fixture.workspace, signal: new AbortController().signal },
      {
        program: process.execPath,
        args: ["-e", parentSource],
        cwd: ".",
        timeoutMs: 5_000,
        readiness: {
          url: `http://127.0.0.1:${port}/health`,
          expectedStatus: 200,
        },
      },
    );
    expect(result.ok).toBe(false);
    expect(result.error?.details?.reason).toBe("readiness_not_reached");
    const childPid = Number(result.output?.match(/CHILD_PID=(\d+)/)?.[1]);
    expect(Number.isInteger(childPid)).toBe(true);
    await waitForProcessExit(childPid);
  });

  it("cleans a forked server child in the readiness process group", async () => {
    const fixture = await createToolFixture();
    const port = await unusedLoopbackPort();
    const childSource = "require('node:http').createServer((request,response)=>response.writeHead(200).end('ok')).listen(Number(process.argv[1]),'127.0.0.1'); setInterval(()=>{},1000)";
    const parentSource = `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e',${JSON.stringify(childSource)},process.argv[1]],{stdio:'ignore'}); process.stdout.write('CHILD_PID='+child.pid); setInterval(()=>{},1000)`;
    const result = await executeRunProcess(
      { workspace: fixture.workspace, signal: new AbortController().signal },
      {
        program: process.execPath,
        args: ["-e", parentSource, String(port)],
        cwd: ".",
        timeoutMs: 5_000,
        readiness: {
          url: `http://127.0.0.1:${port}/`,
          expectedStatus: 200,
        },
      },
    );
    expect(result.ok).toBe(true);
    const childPid = Number(result.output?.match(/CHILD_PID=(\d+)/)?.[1]);
    expect(Number.isInteger(childPid)).toBe(true);
    await waitForProcessExit(childPid);
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toBeDefined();
  });

  it("does not follow readiness redirects and cleans up on timeout", async () => {
    const fixture = await createToolFixture();
    const port = await unusedLoopbackPort();
    const result = await executeRunProcess(
      { workspace: fixture.workspace, signal: new AbortController().signal },
      {
        program: process.execPath,
        args: [
          "-e",
          "require('node:http').createServer((request,response)=>response.writeHead(302,{location:'/ready'}).end()).listen(Number(process.argv[1]),'127.0.0.1'); setInterval(()=>{},1000)",
          String(port),
        ],
        cwd: ".",
        timeoutMs: 1_000,
        readiness: {
          url: `http://127.0.0.1:${port}/redirect`,
          expectedStatus: 200,
        },
      },
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "PROCESS_TIMEOUT" },
      metadata: {
        ready: false,
        readinessStatus: 302,
        readinessProbeAttempts: expect.any(Number),
        readinessConnected: true,
        timedOut: true,
      },
    });
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toBeDefined();
  });

  it("returns a structured spawn failure in readiness mode", async () => {
    const fixture = await createToolFixture();
    const port = await unusedLoopbackPort();
    const result = await executeRunProcess(
      { workspace: fixture.workspace, signal: new AbortController().signal },
      {
        program: `missing-secode-program-${Date.now()}`,
        args: [],
        cwd: ".",
        timeoutMs: 1_000,
        readiness: {
          url: `http://127.0.0.1:${port}/`,
          expectedStatus: 200,
        },
      },
    );
    expect(result.error?.code).toBe("PROCESS_SPAWN_FAILED");
  });

  it("cancels and cleans a readiness process group", async () => {
    const fixture = await createToolFixture();
    const port = await unusedLoopbackPort();
    const pidFile = path.join(fixture.project, "child.pid");
    const parentSource = "const {spawn}=require('node:child_process'); const {writeFileSync}=require('node:fs'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); writeFileSync(process.argv[1],String(child.pid)); setInterval(()=>{},1000)";
    const controller = new AbortController();
    const execution = executeRunProcess(
      { workspace: fixture.workspace, signal: controller.signal },
      {
        program: process.execPath,
        args: ["-e", parentSource, pidFile],
        cwd: ".",
        timeoutMs: 5_000,
        readiness: {
          url: `http://127.0.0.1:${port}/`,
          expectedStatus: 200,
        },
      },
    );
    const childPid = await waitForPidFile(pidFile);
    controller.abort("cancelled");
    await expect(execution).rejects.toBeInstanceOf(LocalToolExecutionAbortedError);
    await waitForProcessExit(childPid);
  });
});
