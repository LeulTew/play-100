export interface DeviceHints {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
}

/** The reader saves data, or the connection is 2G: a fetch ahead of need costs them more than a later wait. */
export function prefersLightData(hints: DeviceHints): boolean {
  return Boolean(hints.connection?.saveData || ['slow-2g', '2g'].includes(hints.connection?.effectiveType ?? ''));
}

export function isConstrainedDevice(hints: DeviceHints): boolean {
  return (
    prefersLightData(hints) ||
    (hints.deviceMemory !== undefined && hints.deviceMemory <= 4) ||
    (hints.hardwareConcurrency !== undefined && hints.hardwareConcurrency > 0 && hints.hardwareConcurrency <= 2)
  );
}
