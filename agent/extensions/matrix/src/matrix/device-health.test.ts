import { describe, expect, it } from "vitest";
import { isDiffractionManagedMatrixDevice, summarizeMatrixDeviceHealth } from "./device-health.js";

describe("matrix device health", () => {
  it("detects Diffraction-managed device names", () => {
    expect(isDiffractionManagedMatrixDevice("Diffraction Gateway")).toBe(true);
    expect(isDiffractionManagedMatrixDevice("Diffraction Debug")).toBe(true);
    expect(isDiffractionManagedMatrixDevice("Element iPhone")).toBe(false);
    expect(isDiffractionManagedMatrixDevice(null)).toBe(false);
  });

  it("summarizes stale Diffraction-managed devices separately from the current device", () => {
    const summary = summarizeMatrixDeviceHealth([
      {
        deviceId: "du314Zpw3A",
        displayName: "Diffraction Gateway",
        current: true,
      },
      {
        deviceId: "BritdXC6iL",
        displayName: "Diffraction Gateway",
        current: false,
      },
      {
        deviceId: "G6NJU9cTgs",
        displayName: "Diffraction Debug",
        current: false,
      },
      {
        deviceId: "phone123",
        displayName: "Element iPhone",
        current: false,
      },
    ]);

    expect(summary.currentDeviceId).toBe("du314Zpw3A");
    expect(summary.currentDiffractionDevices).toEqual([
      expect.objectContaining({ deviceId: "du314Zpw3A" }),
    ]);
    expect(summary.staleDiffractionDevices).toEqual([
      expect.objectContaining({ deviceId: "BritdXC6iL" }),
      expect.objectContaining({ deviceId: "G6NJU9cTgs" }),
    ]);
  });
});
