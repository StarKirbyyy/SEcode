import { createAgentRuntime, type AgentRuntime } from "@/lib/agent";
import { createAgentContextProvider } from "@/lib/context";
import { createModelClient, type ModelClient } from "@/lib/model";
import { createJsonlEventStore, type JsonlEventStore } from "@/lib/storage";
import { createWorkspaceHandle } from "@/lib/workspace";

import { createServerApplication } from "./application";
import { createWorkspacePickerService } from "./workspace-picker";
import type { ServerApplication } from "./types";

const APPLICATION_KEY = Symbol.for("secode.server.application.v1");

export interface ServerBootstrapDependencies {
  createStore(): JsonlEventStore;
  createModel(): ModelClient;
  createRuntime(input: {
    eventStore: JsonlEventStore;
    modelClient: ModelClient;
  }): AgentRuntime;
  createApplication(input: {
    store: JsonlEventStore;
    modelClient: ModelClient;
    runtime: AgentRuntime;
  }): ServerApplication;
}

type GlobalTarget = Record<symbol, unknown>;

export function createServerApplicationLoader(
  dependencies: ServerBootstrapDependencies,
  target: GlobalTarget,
  key: symbol,
): () => Promise<ServerApplication> {
  return () => {
    const existing = target[key];
    if (existing instanceof Promise) return existing as Promise<ServerApplication>;

    const pending = (async () => {
      const store = dependencies.createStore();
      await store.initialize();
      const modelClient = dependencies.createModel();
      const runtime = dependencies.createRuntime({ eventStore: store, modelClient });
      return dependencies.createApplication({ store, modelClient, runtime });
    })();
    target[key] = pending;
    void pending.catch(() => {
      if (target[key] === pending) delete target[key];
    });
    return pending;
  };
}

const PRODUCTION_DEPENDENCIES: ServerBootstrapDependencies = {
  createStore: () => createJsonlEventStore(),
  createModel: () => createModelClient({ env: process.env }),
  createRuntime: ({ eventStore, modelClient }) =>
    createAgentRuntime({
      eventStore,
      modelClient,
      contextProvider: createAgentContextProvider({ eventSource: eventStore, modelClient }),
    }),
  createApplication: ({ store, modelClient, runtime }) =>
    createServerApplication({
      store,
      modelClient,
      runtime,
      createWorkspace: createWorkspaceHandle,
      workspacePicker: createWorkspacePickerService(),
    }),
};

const loadProductionApplication = createServerApplicationLoader(
  PRODUCTION_DEPENDENCIES,
  globalThis as GlobalTarget,
  APPLICATION_KEY,
);

export function getServerApplication(): Promise<ServerApplication> {
  return loadProductionApplication();
}
