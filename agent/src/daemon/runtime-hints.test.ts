import { describe, expect, it } from "vitest";
import { buildPlatformRuntimeLogHints, buildPlatformServiceStartHints } from "./runtime-hints.js";

describe("buildPlatformRuntimeLogHints", () => {
  it("renders launchd log hints on darwin", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "darwin",
        env: {
          DIFFRACTION_STATE_DIR: "/tmp/diffraction-state",
          DIFFRACTION_LOG_PREFIX: "gateway",
        },
        systemdServiceName: "diffraction-gateway",
        windowsTaskName: "Diffraction Gateway",
      }),
    ).toEqual([
      "Launchd stdout (if installed): /tmp/diffraction-state/logs/gateway.log",
      "Launchd stderr (if installed): /tmp/diffraction-state/logs/gateway.err.log",
    ]);
  });

  it("renders systemd and windows hints by platform", () => {
    expect(
      buildPlatformRuntimeLogHints({
        platform: "linux",
        systemdServiceName: "diffraction-gateway",
        windowsTaskName: "Diffraction Gateway",
      }),
    ).toEqual(["Logs: journalctl --user -u diffraction-gateway.service -n 200 --no-pager"]);
    expect(
      buildPlatformRuntimeLogHints({
        platform: "win32",
        systemdServiceName: "diffraction-gateway",
        windowsTaskName: "Diffraction Gateway",
      }),
    ).toEqual(['Logs: schtasks /Query /TN "Diffraction Gateway" /V /FO LIST']);
  });
});

describe("buildPlatformServiceStartHints", () => {
  it("builds platform-specific service start hints", () => {
    expect(
      buildPlatformServiceStartHints({
        platform: "darwin",
        installCommand: "diffraction gateway install",
        startCommand: "diffraction gateway",
        launchAgentPlistPath: "~/Library/LaunchAgents/com.diffraction.gateway.plist",
        systemdServiceName: "diffraction-gateway",
        windowsTaskName: "Diffraction Gateway",
      }),
    ).toEqual([
      "diffraction gateway install",
      "diffraction gateway",
      "launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.diffraction.gateway.plist",
    ]);
    expect(
      buildPlatformServiceStartHints({
        platform: "linux",
        installCommand: "diffraction gateway install",
        startCommand: "diffraction gateway",
        launchAgentPlistPath: "~/Library/LaunchAgents/com.diffraction.gateway.plist",
        systemdServiceName: "diffraction-gateway",
        windowsTaskName: "Diffraction Gateway",
      }),
    ).toEqual([
      "diffraction gateway install",
      "diffraction gateway",
      "systemctl --user start diffraction-gateway.service",
    ]);
  });
});
