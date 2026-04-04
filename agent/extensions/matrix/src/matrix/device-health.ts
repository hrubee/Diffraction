export type MatrixManagedDeviceInfo = {
  deviceId: string;
  displayName: string | null;
  current: boolean;
};

export type MatrixDeviceHealthSummary = {
  currentDeviceId: string | null;
  staleDiffractionDevices: MatrixManagedDeviceInfo[];
  currentDiffractionDevices: MatrixManagedDeviceInfo[];
};

const DIFFRACTION_DEVICE_NAME_PREFIX = "Diffraction ";

export function isDiffractionManagedMatrixDevice(displayName: string | null | undefined): boolean {
  return displayName?.startsWith(DIFFRACTION_DEVICE_NAME_PREFIX) === true;
}

export function summarizeMatrixDeviceHealth(
  devices: MatrixManagedDeviceInfo[],
): MatrixDeviceHealthSummary {
  const currentDeviceId = devices.find((device) => device.current)?.deviceId ?? null;
  const openClawDevices = devices.filter((device) =>
    isDiffractionManagedMatrixDevice(device.displayName),
  );
  return {
    currentDeviceId,
    staleDiffractionDevices: openClawDevices.filter((device) => !device.current),
    currentDiffractionDevices: openClawDevices.filter((device) => device.current),
  };
}
