import { describe, expect, it, vi } from "vitest";

import type { AgentRuntime } from "@/lib/agent";
import type { ModelClient } from "@/lib/model";
import type { JsonlEventStore } from "@/lib/storage";
import { createServerApplicationLoader } from "@/lib/server/bootstrap";
import type { ServerApplication } from "@/lib/server";

describe("server bootstrap", () => {
  it("initializes once for concurrent consumers and preserves dependency identity", async () => {
    const order: string[] = [];
    const store = { initialize: vi.fn(async () => { order.push("initialize"); }) } as unknown as JsonlEventStore;
    const model = {} as ModelClient;
    const runtime = {} as AgentRuntime;
    const application = {} as ServerApplication;
    const loader = createServerApplicationLoader({
      createStore: vi.fn(() => { order.push("store"); return store; }),
      createModel: vi.fn(() => { order.push("model"); return model; }),
      createRuntime: vi.fn((input) => { expect(input).toEqual({ eventStore: store, modelClient: model }); order.push("runtime"); return runtime; }),
      createApplication: vi.fn((input) => { expect(input).toEqual({ store, modelClient: model, runtime }); order.push("application"); return application; }),
    }, {}, Symbol("test"));

    const results = await Promise.all(Array.from({ length: 20 }, () => loader()));
    expect(results.every((value) => value === application)).toBe(true);
    expect(order).toEqual(["store", "initialize", "model", "runtime", "application"]);
  });

  it("clears only the failed cached promise and retries", async () => {
    const target: Record<symbol, unknown> = {};
    const key = Symbol("retry");
    let attempts = 0;
    const application = {} as ServerApplication;
    const loader = createServerApplicationLoader({
      createStore: () => ({ initialize: async () => { attempts += 1; if (attempts === 1) throw new Error("fail"); } }) as unknown as JsonlEventStore,
      createModel: () => ({}) as ModelClient,
      createRuntime: () => ({}) as AgentRuntime,
      createApplication: () => application,
    }, target, key);
    await expect(loader()).rejects.toThrow("fail");
    await expect(loader()).resolves.toBe(application);
    expect(attempts).toBe(2);
  });

  it("uses versioned keys independently", async () => {
    const target: Record<symbol, unknown> = {};
    const make = (key: symbol, application: ServerApplication) => createServerApplicationLoader({
      createStore: () => ({ initialize: async () => undefined }) as unknown as JsonlEventStore,
      createModel: () => ({}) as ModelClient,
      createRuntime: () => ({}) as AgentRuntime,
      createApplication: () => application,
    }, target, key);
    const first = {} as ServerApplication;
    const second = {} as ServerApplication;
    expect(await make(Symbol.for("v1"), first)()).toBe(first);
    expect(await make(Symbol.for("v2"), second)()).toBe(second);
  });
});
