import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';

export function compareVersions(a, b) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

export function selectDevices(inventory, developerDir) {
  const runtimes = inventory.runtimes
    .filter((runtime) => runtime.isAvailable && runtime.identifier.includes('.iOS-'))
    .filter((runtime) => compareVersions(runtime.version, '16.4') >= 0)
    .sort((a, b) => compareVersions(a.version, b.version));
  if (!runtimes.length) throw new Error('No installed iOS runtime meets the Safari 16.4 floor.');
  const selected = [...new Map([runtimes.at(-1), runtimes[0]].map((r) => [r.identifier, r])).values()];
  const include = [];
  for (const runtime of selected) {
    const supported = new Set(runtime.supportedDeviceTypes?.map((type) => type.identifier));
    const phones = inventory.devicetypes.filter(
      (type) => type.productFamily === 'iPhone' && supported.has(type.identifier),
    );
    const small = phones.find((type) => type.name === 'iPhone SE (3rd generation)')
      ?? phones.find((type) => type.name.includes('mini'))
      ?? phones.filter((type) => !/Plus|Max/.test(type.name)).at(-1);
    const large = phones.filter((type) => /Pro Max/.test(type.name))
      .sort((a, b) => Number(/iPhone (\d+)/.exec(a.name)?.[1]) - Number(/iPhone (\d+)/.exec(b.name)?.[1]))
      .at(-1);
    if (!small || !large || small.identifier === large.identifier) {
      throw new Error(`Cannot select both small and large iPhones for iOS ${runtime.version}.`);
    }
    for (const [size, device] of [['small', small], ['large', large]]) {
      include.push({
        label: `${size}-ios-${runtime.version}`,
        deviceName: device.name,
        deviceType: device.identifier,
        runtime: runtime.identifier,
        version: runtime.version,
        developerDir,
      });
    }
  }
  return { include };
}

if (process.argv[1]?.endsWith('plan.mjs')) {
  mkdirSync('ios-safari-artifacts', { recursive: true });
  const xcodes = readdirSync('/Applications')
    .map((name) => ({ name, version: /^Xcode_(\d+(?:\.\d+)*)\.app$/.exec(name)?.[1] }))
    .filter((xcode) => xcode.version)
    .sort((a, b) => compareVersions(a.version, b.version));
  const usable = xcodes.filter((xcode) => {
    const library = `/Applications/${xcode.name}/Contents/Developer/Platforms/iPhoneSimulator.platform/Developer/usr/lib/lib_TestingInterop.dylib`;
    xcode.excludedReason = compareVersions(xcode.version, '26.3') >= 0 && !existsSync(library)
      ? `Incomplete XCTest installation: missing ${library}` : null;
    return !xcode.excludedReason;
  });
  writeFileSync('ios-safari-artifacts/xcodes.json', JSON.stringify(xcodes, null, 2));
  if (!usable.length) throw new Error('No complete stable Xcode installation found.');
  const developerDir = `/Applications/${usable.at(-1).name}/Contents/Developer`;
  const raw = execFileSync('xcrun', ['simctl', 'list', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, DEVELOPER_DIR: developerDir },
  });
  writeFileSync('ios-safari-artifacts/inventory.json', raw);
  const matrix = selectDevices(JSON.parse(raw), developerDir);
  writeFileSync('ios-safari-artifacts/matrix.json', JSON.stringify(matrix, null, 2));
  appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(matrix)}\n`);
  console.log(JSON.stringify(matrix, null, 2));
}
