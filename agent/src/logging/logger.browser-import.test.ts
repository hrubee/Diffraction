import { afterEach, describe, expect, it, vi } from "vitest";

type LoggerModule = typeof import("./logger.js");

const originalGetBuiltinModule = (
  process as NodeJS.Process & { getBuiltinModule?: (id: string) => unknown }
).getBuiltinModule;

async function importBrowserSafeLogger(params?: {
  resolvePreferredDiffractionTmpDir?: ReturnType<typeof vi.fn>;
}): Promise<{
  module: LoggerModule;
  resolvePreferredDiffractionTmpDir: ReturnType<typeof vi.fn>;
}> {
  vi.resetModules();
  const resolvePreferredDiffractionTmpDir =
    params?.resolvePreferredDiffractionTmpDir ??
    vi.fn(() => {
      throw new Error("resolvePreferredDiffractionTmpDir should not run during browser-safe import");
    });

  vi.doMock("../infra/tmp-diffraction-dir.js", async () => {
    const actual = await vi.importActual<typeof import("../infra/tmp-diffraction-dir.js")>(
      "../infra/tmp-diffraction-dir.js",
    );
    return {
      ...actual,
      resolvePreferredDiffractionTmpDir,
    };
  });

  Object.defineProperty(process, "getBuiltinModule", {
    configurable: true,
    value: undefined,
  });

  const module = await import("./logger.js");
  return { module, resolvePreferredDiffractionTmpDir };
}

describe("logging/logger browser-safe import", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../infra/tmp-diffraction-dir.js");
    Object.defineProperty(process, "getBuiltinModule", {
      configurable: true,
      value: originalGetBuiltinModule,
    });
  });

  it("does not resolve the preferred temp dir at import time when node fs is unavailable", async () => {
    const { module, resolvePreferredDiffractionTmpDir } = await importBrowserSafeLogger();

    expect(resolvePreferredDiffractionTmpDir).not.toHaveBeenCalled();
    expect(module.DEFAULT_LOG_DIR).toBe("/tmp/diffraction");
    expect(module.DEFAULT_LOG_FILE).toBe("/tmp/diffraction/diffraction.log");
  });

  it("disables file logging when imported in a browser-like environment", async () => {
    const { module, resolvePreferredDiffractionTmpDir } = await importBrowserSafeLogger();

    expect(module.getResolvedLoggerSettings()).toMatchObject({
      level: "silent",
      file: "/tmp/diffraction/diffraction.log",
    });
    expect(module.isFileLogLevelEnabled("info")).toBe(false);
    expect(() => module.getLogger().info("browser-safe")).not.toThrow();
    expect(resolvePreferredDiffractionTmpDir).not.toHaveBeenCalled();
  });
});
