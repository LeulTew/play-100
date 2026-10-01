import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';

export function compareVersions(a, b) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

export function selectDevices(inventory, developerDir, legacyDeveloperDir = developerDir) {
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
        developerDir: compareVersions(runtime.version, '17') < 0 ? legacyDeveloperDir : developerDir,
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
  writeFileSync('ios-safari-artifacts/xcodes.json', JSON.stringify(xcodes, null, 2));
  if (!xcodes.length) throw new Error('No stable Xcode installation found.');
  const developerDir = `/Applications/${xcodes.at(-1).name}/Contents/Developer`;
  const raw = execFileSync('xcrun', ['simctl', 'list', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, DEVELOPER_DIR: developerDir },
  });
  writeFileSync('ios-safari-artifacts/inventory.json', raw);
  const inventory = JSON.parse(raw);
  const legacy = xcodes.filter((xcode) => compareVersions(xcode.version, '26') < 0).at(-1);
  if (!legacy && inventory.runtimes.some((runtime) =>
    runtime.isAvailable && runtime.identifier.includes('.iOS-') &&
    compareVersions(runtime.version, '16.4') >= 0 && compareVersions(runtime.version, '17') < 0)) {
    throw new Error('iOS 16.4-16.x requires an installed pre-26 Xcode for WebDriverAgent builds.');
  }
  const matrix = selectDevices(inventory, developerDir,
    legacy ? `/Applications/${legacy.name}/Contents/Developer` : developerDir);
  writeFileSync('ios-safari-artifacts/matrix.json', JSON.stringify(matrix, null, 2));
  appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(matrix)}\n`);
  console.log(JSON.stringify(matrix, null, 2));
}
