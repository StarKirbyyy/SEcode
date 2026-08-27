import { ModelProfileSchema, type ModelProfile } from "@/lib/domain";

import {
  createModelError,
  type ModelAdapter,
  type ModelConfigIssue,
  type ModelEnvironment,
  type ModelRegistrySnapshot,
  type ServerModelProfileDefinition,
} from "./types";

export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
export const DEFAULT_DEEPSEEK_CONTEXT_WINDOW = 1_000_000;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

interface RegistryData {
  snapshot: ModelRegistrySnapshot;
  definitions: Map<string, ServerModelProfileDefinition>;
}

function issue(
  profileId: string,
  code: ModelConfigIssue["code"],
  variableName: string,
): ModelConfigIssue {
  return {
    profileId,
    code,
    message: `模型配置 ${profileId} 的环境变量 ${variableName} 缺失或无效`,
  };
}

function optionalValue(
  env: ModelEnvironment,
  name: string,
): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number | undefined {
  if (value === undefined) {
    return fallback;
  }
  if (!/^[1-9]\d*$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseBoolean(
  value: string | undefined,
  fallback: boolean,
): boolean | undefined {
  if (value === undefined) {
    return fallback;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}

export function normalizeChatCompletionsUrl(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch (cause) {
    throw createModelError(
      "MODEL_CONFIG_INVALID",
      "模型服务地址不是有效 URL",
      false,
      { field: "baseUrl" },
      cause,
    );
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw createModelError(
      "MODEL_CONFIG_INVALID",
      "模型服务地址只允许 HTTP 或 HTTPS",
      false,
      { field: "baseUrl", protocol: url.protocol },
    );
  }
  if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname)) {
    throw createModelError(
      "MODEL_CONFIG_INVALID",
      "非本机模型服务必须使用 HTTPS",
      false,
      { field: "baseUrl" },
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw createModelError(
      "MODEL_CONFIG_INVALID",
      "模型服务地址不能包含凭据、查询参数或片段",
      false,
      { field: "baseUrl" },
    );
  }

  let pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  if (!pathname.endsWith("/chat/completions")) {
    pathname = `${pathname}/chat/completions`;
  }
  url.pathname = pathname || "/chat/completions";
  return url.toString();
}

function createDefinition(
  profile: ModelProfile,
  adapter: ModelAdapter,
  endpoint: string,
  apiKeyEnv: string,
  requiresApiKey: boolean,
): ServerModelProfileDefinition {
  return { profile, adapter, endpoint, apiKeyEnv, requiresApiKey };
}

function buildRegistry(env: ModelEnvironment): RegistryData {
  const profiles: ModelProfile[] = [];
  const issues: ModelConfigIssue[] = [];
  const definitions = new Map<string, ServerModelProfileDefinition>();

  const deepseekKey = optionalValue(env, "DEEPSEEK_API_KEY");
  const deepseekBase =
    optionalValue(env, "DEEPSEEK_BASE_URL") ?? DEFAULT_DEEPSEEK_BASE_URL;
  const deepseekModel =
    optionalValue(env, "DEEPSEEK_MODEL") ?? DEFAULT_DEEPSEEK_MODEL;
  const deepseekContext = parsePositiveInteger(
    optionalValue(env, "DEEPSEEK_CONTEXT_WINDOW"),
    DEFAULT_DEEPSEEK_CONTEXT_WINDOW,
  );
  let deepseekEndpoint: string | undefined;
  try {
    deepseekEndpoint = normalizeChatCompletionsUrl(deepseekBase);
  } catch {
    issues.push(issue("deepseek", "INVALID_VALUE", "DEEPSEEK_BASE_URL"));
  }
  if (deepseekContext === undefined) {
    issues.push(issue("deepseek", "INVALID_VALUE", "DEEPSEEK_CONTEXT_WINDOW"));
  }
  if (!deepseekKey) {
    issues.push(issue("deepseek", "MISSING_API_KEY", "DEEPSEEK_API_KEY"));
  }

  const deepseekProfile = ModelProfileSchema.parse({
    id: "deepseek",
    label: "DeepSeek",
    provider: "deepseek",
    baseUrl:
      deepseekEndpoint === undefined ? DEFAULT_DEEPSEEK_BASE_URL : deepseekBase,
    model: deepseekModel,
    contextWindow: deepseekContext ?? DEFAULT_DEEPSEEK_CONTEXT_WINDOW,
    supportsThinking: true,
    configured:
      deepseekEndpoint !== undefined &&
      deepseekContext !== undefined &&
      deepseekKey !== undefined,
  });
  profiles.push(deepseekProfile);
  if (deepseekEndpoint !== undefined) {
    definitions.set(
      deepseekProfile.id,
      createDefinition(
        deepseekProfile,
        "deepseek",
        deepseekEndpoint,
        "DEEPSEEK_API_KEY",
        true,
      ),
    );
  }

  const optionalProfiles = [
    {
      id: "longcat",
      label: "LongCat",
      provider: "longcat" as const,
      prefix: "LONGCAT",
    },
    {
      id: "generic",
      label: "OpenAI Compatible",
      provider: "generic" as const,
      prefix: "OPENAI_COMPAT",
    },
  ];

  for (const candidate of optionalProfiles) {
    const baseName = `${candidate.prefix}_BASE_URL`;
    const modelName = `${candidate.prefix}_MODEL`;
    const contextName = `${candidate.prefix}_CONTEXT_WINDOW`;
    const thinkingName = `${candidate.prefix}_SUPPORTS_THINKING`;
    const keyName = `${candidate.prefix}_API_KEY`;
    const baseUrl = optionalValue(env, baseName);
    const model = optionalValue(env, modelName);

    if (!baseUrl && !model) {
      continue;
    }
    if (!baseUrl) {
      issues.push(issue(candidate.id, "MISSING_BASE_URL", baseName));
    }
    if (!model) {
      issues.push(issue(candidate.id, "MISSING_MODEL", modelName));
    }
    if (!baseUrl || !model) {
      continue;
    }

    const contextWindow = parsePositiveInteger(
      optionalValue(env, contextName),
      64_000,
    );
    const supportsThinking = parseBoolean(
      optionalValue(env, thinkingName),
      false,
    );
    let endpoint: string | undefined;
    try {
      endpoint = normalizeChatCompletionsUrl(baseUrl);
    } catch {
      issues.push(issue(candidate.id, "INVALID_VALUE", baseName));
    }
    if (contextWindow === undefined) {
      issues.push(issue(candidate.id, "INVALID_VALUE", contextName));
    }
    if (supportsThinking === undefined) {
      issues.push(issue(candidate.id, "INVALID_VALUE", thinkingName));
    }
    if (
      endpoint === undefined ||
      contextWindow === undefined ||
      supportsThinking === undefined
    ) {
      continue;
    }

    const profile = ModelProfileSchema.parse({
      id: candidate.id,
      label: candidate.label,
      provider: candidate.provider,
      baseUrl,
      model,
      contextWindow,
      supportsThinking,
      configured: true,
    });
    profiles.push(profile);
    definitions.set(
      profile.id,
      createDefinition(profile, candidate.provider, endpoint, keyName, false),
    );
  }

  return { snapshot: { profiles, issues }, definitions };
}

export function getModelRegistrySnapshot(
  env: ModelEnvironment,
): ModelRegistrySnapshot {
  return buildRegistry(env).snapshot;
}

export function resolveServerModelProfile(
  profileId: string,
  env: ModelEnvironment,
): ServerModelProfileDefinition {
  const registry = buildRegistry(env);
  const definition = registry.definitions.get(profileId);
  if (!definition) {
    throw createModelError(
      "MODEL_CONFIG_MISSING",
      `模型配置 ${profileId} 不存在或无效`,
      false,
      { profileId },
    );
  }
  if (!definition.profile.configured) {
    throw createModelError(
      "MODEL_CONFIG_MISSING",
      `模型配置 ${profileId} 尚未完成`,
      false,
      { profileId },
    );
  }
  return definition;
}

export function readModelApiKey(
  definition: ServerModelProfileDefinition,
  env: ModelEnvironment,
): string | undefined {
  const apiKey = optionalValue(env, definition.apiKeyEnv);
  if (definition.requiresApiKey && !apiKey) {
    throw createModelError(
      "MODEL_CONFIG_MISSING",
      `模型配置 ${definition.profile.id} 缺少凭据`,
      false,
      { profileId: definition.profile.id },
    );
  }
  return apiKey;
}
