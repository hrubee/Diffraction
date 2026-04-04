import { describe, expect, it, vi } from "vitest";

const runFirecrawlScrape = vi.fn(async (params: Record<string, unknown>) => ({
  ok: true,
  params,
}));

vi.mock("./firecrawl-client.js", () => ({
  runFirecrawlScrape,
}));

describe("firecrawl scrape tool", () => {
  it("maps scrape params and defaults extract mode to markdown", async () => {
    const { createFirecrawlScrapeTool } = await import("./firecrawl-scrape-tool.js");
    const tool = createFirecrawlScrapeTool({
      config: { env: "test" },
    } as never);

    const result = await tool.execute("call-1", {
      url: "https://docs.diffraction.ai",
      maxChars: 1500,
      onlyMainContent: false,
      maxAgeMs: 5000,
      proxy: "stealth",
      storeInCache: false,
      timeoutSeconds: 22,
    });

    expect(runFirecrawlScrape).toHaveBeenCalledWith({
      cfg: { env: "test" },
      url: "https://docs.diffraction.ai",
      extractMode: "markdown",
      maxChars: 1500,
      onlyMainContent: false,
      maxAgeMs: 5000,
      proxy: "stealth",
      storeInCache: false,
      timeoutSeconds: 22,
    });
    expect(result).toMatchObject({
      details: {
        ok: true,
        params: {
          cfg: { env: "test" },
          url: "https://docs.diffraction.ai",
          extractMode: "markdown",
          maxChars: 1500,
          onlyMainContent: false,
          maxAgeMs: 5000,
          proxy: "stealth",
          storeInCache: false,
          timeoutSeconds: 22,
        },
      },
    });
  });

  it("passes text mode through and ignores invalid proxy values", async () => {
    const { createFirecrawlScrapeTool } = await import("./firecrawl-scrape-tool.js");
    const tool = createFirecrawlScrapeTool({
      config: { env: "test" },
    } as never);

    await tool.execute("call-2", {
      url: "https://docs.diffraction.ai",
      extractMode: "text",
      proxy: "invalid",
    });

    expect(runFirecrawlScrape).toHaveBeenCalledWith({
      cfg: { env: "test" },
      url: "https://docs.diffraction.ai",
      extractMode: "text",
      maxChars: undefined,
      onlyMainContent: undefined,
      maxAgeMs: undefined,
      proxy: undefined,
      storeInCache: undefined,
      timeoutSeconds: undefined,
    });
  });
});
