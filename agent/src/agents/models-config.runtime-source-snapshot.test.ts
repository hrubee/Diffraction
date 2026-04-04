import { afterEach, describe, expect, it } from "vitest";
import type { DiffractionConfig } from "../config/config.js";
import {
  clearConfigCache,
  clearRuntimeConfigSnapshot,
  loadConfig,
  setRuntimeConfigSnapshot,
} from "../config/config.js";
import { NON_ENV_SECRETREF_MARKER } from "./model-auth-markers.js";
import {
  installModelsConfigTestHooks,
  withModelsTempHome as withTempHome,
} from "./models-config.e2e-harness.js";
import { ensureDiffractionModelsJson, resetModelsJsonReadyCacheForTest } from "./models-config.js";
import { readGeneratedModelsJson } from "./models-config.test-utils.js";

installModelsConfigTestHooks();

afterEach(() => {
  resetModelsJsonReadyCacheForTest();
});

function createOpenAiApiKeySourceConfig(): DiffractionConfig {
  return {
    models: {
      providers: {
        openai: {
          baseUrl: "https://api.openai.com/v1",
          apiKey: { source: "env", provider: "default", id: "OPENAI_API_KEY" }, // pragma: allowlist secret
          api: "openai-completions" as const,
          models: [],
        },
      },
    },
  };
}

function createOpenAiApiKeyRuntimeConfig(): DiffractionConfig {
  return {
    models: {
      providers: {
        openai: {
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-runtime-resolved", // pragma: allowlist secret
          api: "openai-completions" as const,
          models: [],
        },
      },
    },
  };
}

function createOpenAiHeaderSourceConfig(): DiffractionConfig {
  return {
    models: {
      providers: {
        openai: {
          baseUrl: "https://api.openai.com/v1",
          api: "openai-completions" as const,
          headers: {
            Authorization: {
              source: "env",
              provider: "default",
              id: "OPENAI_HEADER_TOKEN", // pragma: allowlist secret
            },
            "X-Tenant-Token": {
              source: "file",
              provider: "vault",
              id: "/providers/openai/tenantToken",
            },
          },
          models: [],
        },
      },
    },
  };
}

function createOpenAiHeaderRuntimeConfig(): DiffractionConfig {
  return {
    models: {
      providers: {
        openai: {
          baseUrl: "https://api.openai.com/v1",
          api: "openai-completions" as const,
          headers: {
            Authorization: "Bearer runtime-openai-token",
            "X-Tenant-Token": "runtime-tenant-token",
          },
          models: [],
        },
      },
    },
  };
}

function withGatewayTokenMode(config: DiffractionConfig): DiffractionConfig {
  return {
    ...config,
    gateway: {
      auth: {
        mode: "token",
      },
    },
  };
}

async function withGeneratedModelsFromRuntimeSource(
  params: {
    sourceConfig: DiffractionConfig;
    runtimeConfig: DiffractionConfig;
    candidateConfig?: DiffractionConfig;
  },
  runAssertions: () => Promise<void>,
) {
  await withTempHome(async () => {
    try {
      setRuntimeConfigSnapshot(params.runtimeConfig, params.sourceConfig);
      await ensureDiffractionModelsJson(params.candidateConfig ?? loadConfig());
      await runAssertions();
    } finally {
      clearRuntimeConfigSnapshot();
      clearConfigCache();
    }
  });
}

async function expectGeneratedProviderApiKey(providerId: string, expected: string) {
  const parsed = await readGeneratedModelsJson<{
    providers: Record<string, { apiKey?: string }>;
  }>();
  expect(parsed.providers[providerId]?.apiKey).toBe(expected);
}

async function expectGeneratedOpenAiHeaderMarkers() {
  const parsed = await readGeneratedModelsJson<{
    providers: Record<string, { headers?: Record<string, string> }>;
  }>();
  expect(parsed.providers.openai?.headers?.Authorization).toBe(
    "secretref-env:OPENAI_HEADER_TOKEN", // pragma: allowlist secret
  );
  expect(parsed.providers.openai?.headers?.["X-Tenant-Token"]).toBe(NON_ENV_SECRETREF_MARKER);
}

describe("models-config runtime source snapshot", () => {
  it("uses runtime source snapshot markers when passed the active runtime config", async () => {
    await withGeneratedModelsFromRuntimeSource(
      {
        sourceConfig: createOpenAiApiKeySourceConfig(),
        runtimeConfig: createOpenAiApiKeyRuntimeConfig(),
      },
      async () => expectGeneratedProviderApiKey("openai", "OPENAI_API_KEY"), // pragma: allowlist secret
    );
  });

  it("uses non-env marker from runtime source snapshot for file refs", async () => {
    await withTempHome(async () => {
      const sourceConfig: DiffractionConfig = {
        models: {
          providers: {
            moonshot: {
              baseUrl: "https://api.moonshot.ai/v1",
              apiKey: { source: "file", provider: "vault", id: "/moonshot/apiKey" },
              api: "openai-completions" as const,
              models: [],
            },
          },
        },
      };
      const runtimeConfig: DiffractionConfig = {
        models: {
          providers: {
            moonshot: {
              baseUrl: "https://api.moonshot.ai/v1",
              apiKey: "sk-runtime-moonshot", // pragma: allowlist secret
              api: "openai-completions" as const,
              models: [],
            },
          },
        },
      };

      try {
        setRuntimeConfigSnapshot(runtimeConfig, sourceConfig);
        await ensureDiffractionModelsJson(loadConfig());

        const parsed = await readGeneratedModelsJson<{
          providers: Record<string, { apiKey?: string }>;
        }>();
        expect(parsed.providers.moonshot?.apiKey).toBe(NON_ENV_SECRETREF_MARKER);
      } finally {
        clearRuntimeConfigSnapshot();
        clearConfigCache();
      }
    });
  });

  it("projects cloned runtime configs onto source snapshot when preserving provider auth", async () => {
    await withTempHome(async () => {
      const sourceConfig = createOpenAiApiKeySourceConfig();
      const runtimeConfig = createOpenAiApiKeyRuntimeConfig();
      const clonedRuntimeConfig: DiffractionConfig = {
        ...runtimeConfig,
        agents: {
          defaults: {
            imageModel: "openai/gpt-image-1",
          },
        },
      };

      try {
        setRuntimeConfigSnapshot(runtimeConfig, sourceConfig);
        await ensureDiffractionModelsJson(clonedRuntimeConfig);
        await expectGeneratedProviderApiKey("openai", "OPENAI_API_KEY"); // pragma: allowlist secret
      } finally {
        clearRuntimeConfigSnapshot();
        clearConfigCache();
      }
    });
  });

  it("invalidates cached readiness when projected config changes under the same runtime snapshot", async () => {
    await withTempHome(async () => {
      const sourceConfig = createOpenAiApiKeySourceConfig();
      const runtimeConfig = createOpenAiApiKeyRuntimeConfig();
      const firstCandidate: DiffractionConfig = {
        ...runtimeConfig,
        models: {
          providers: {
            openai: {
              ...runtimeConfig.models!.providers!.openai,
              baseUrl: "https://api.openai.com/v1",
            },
          },
        },
      };
      const secondCandidate: DiffractionConfig = {
        ...runtimeConfig,
        models: {
          providers: {
            openai: {
              ...runtimeConfig.models!.providers!.openai,
              baseUrl: "https://mirror.example/v1",
            },
          },
        },
      };

      try {
        setRuntimeConfigSnapshot(runtimeConfig, sourceConfig);
        await ensureDiffractionModelsJson(firstCandidate);
        let parsed = await readGeneratedModelsJson<{
          providers: Record<string, { baseUrl?: string; apiKey?: string }>;
        }>();
        expect(parsed.providers.openai?.baseUrl).toBe("https://api.openai.com/v1");
        expect(parsed.providers.openai?.apiKey).toBe("OPENAI_API_KEY"); // pragma: allowlist secret

        await ensureDiffractionModelsJson(secondCandidate);
        parsed = await readGeneratedModelsJson<{
          providers: Record<string, { baseUrl?: string; apiKey?: string }>;
        }>();
        expect(parsed.providers.openai?.baseUrl).toBe("https://mirror.example/v1");
        expect(parsed.providers.openai?.apiKey).toBe("OPENAI_API_KEY"); // pragma: allowlist secret
      } finally {
        clearRuntimeConfigSnapshot();
        clearConfigCache();
      }
    });
  });

  it("uses header markers from runtime source snapshot instead of resolved runtime values", async () => {
    await withGeneratedModelsFromRuntimeSource(
      {
        sourceConfig: createOpenAiHeaderSourceConfig(),
        runtimeConfig: createOpenAiHeaderRuntimeConfig(),
      },
      expectGeneratedOpenAiHeaderMarkers,
    );
  });

  it("keeps source markers when runtime projection is skipped for incompatible top-level shape", async () => {
    await withTempHome(async () => {
      const sourceConfig = withGatewayTokenMode(createOpenAiApiKeySourceConfig());
      const runtimeConfig = withGatewayTokenMode(createOpenAiApiKeyRuntimeConfig());
      const incompatibleCandidate: DiffractionConfig = {
        ...createOpenAiApiKeyRuntimeConfig(),
      };

      try {
        setRuntimeConfigSnapshot(runtimeConfig, sourceConfig);
        await ensureDiffractionModelsJson(incompatibleCandidate);
        await expectGeneratedProviderApiKey("openai", "OPENAI_API_KEY"); // pragma: allowlist secret
      } finally {
        clearRuntimeConfigSnapshot();
        clearConfigCache();
      }
    });
  });

  it("keeps source header markers when runtime projection is skipped for incompatible top-level shape", async () => {
    await withTempHome(async () => {
      const sourceConfig = withGatewayTokenMode(createOpenAiHeaderSourceConfig());
      const runtimeConfig = withGatewayTokenMode(createOpenAiHeaderRuntimeConfig());
      const incompatibleCandidate: DiffractionConfig = {
        ...createOpenAiHeaderRuntimeConfig(),
      };

      try {
        setRuntimeConfigSnapshot(runtimeConfig, sourceConfig);
        await ensureDiffractionModelsJson(incompatibleCandidate);
        await expectGeneratedOpenAiHeaderMarkers();
      } finally {
        clearRuntimeConfigSnapshot();
        clearConfigCache();
      }
    });
  });
});
