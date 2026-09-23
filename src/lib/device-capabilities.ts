export interface DeviceHints {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
}

export function isConstrainedDevice(hints: DeviceHints): boolean {
  return Boolean(
    hints.connection?.saveData ||
    ['slow-2g', '2g'].includes(hints.connection?.effectiveType ?? '') ||
    (hints.deviceMemory !== undefined && hints.deviceMemory <= 4) ||
    (hints.hardwareConcurrency !== undefined && hints.hardwareConcurrency > 0 && hints.hardwareConcurrency <= 2),
  );
}
