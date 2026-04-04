import { vi } from "vitest";
import { installChromeUserDataDirHooks } from "./chrome-user-data-dir.test-harness.js";

const chromeUserDataDir = { dir: "/tmp/diffraction" };
installChromeUserDataDirHooks(chromeUserDataDir);

vi.mock("./chrome.js", () => ({
  isChromeCdpReady: vi.fn(async () => true),
  isChromeReachable: vi.fn(async () => true),
  launchDiffractionChrome: vi.fn(async () => {
    throw new Error("unexpected launch");
  }),
  resolveDiffractionUserDataDir: vi.fn(() => chromeUserDataDir.dir),
  stopDiffractionChrome: vi.fn(async () => {}),
}));
