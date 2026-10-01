import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareVersions, selectDevices } from './plan.mjs';

const devicetypes = [
  { name: 'iPhone SE (3rd generation)', identifier: 'se', productFamily: 'iPhone' },
  { name: 'iPhone 16 Pro Max', identifier: 'max16', productFamily: 'iPhone' },
  { name: 'iPhone 17 Pro Max', identifier: 'max17', productFamily: 'iPhone' },
];
const runtime = (version, types = ['se', 'max16', 'max17']) => ({
  identifier: `com.apple.CoreSimulator.SimRuntime.iOS-${version.replaceAll('.', '-')}`,
  version,
  isAvailable: true,
  supportedDeviceTypes: types.map((identifier) => ({ identifier })),
});

test('numeric versions and runtime/device compatibility select the exact coverage matrix', () => {
  assert.ok(compareVersions('26.2', '18.6') > 0);
  assert.ok(compareVersions('18.10', '18.6') > 0);
  const { include } = selectDevices({
    devicetypes: [...devicetypes].reverse(),
    runtimes: [runtime('16.3'), runtime('18.5', ['se', 'max16']), runtime('26.2'), runtime('18.6')],
  }, '/Xcode/Contents/Developer');
  assert.deepEqual(include.map(({ version, deviceType }) => [version, deviceType]), [
    ['26.2', 'se'], ['26.2', 'max17'], ['18.5', 'se'], ['18.5', 'max16'],
  ]);
});

test('one installed runtime is not duplicated', () => {
  const { include } = selectDevices({ devicetypes, runtimes: [runtime('16.4')] }, '/Xcode26', '/Xcode16');
  assert.equal(include.length, 2);
  assert.ok(include.every(({ developerDir }) => developerDir === '/Xcode16'));
});

test('missing runtimes or size coverage fail instead of silently skipping', () => {
  assert.throws(() => selectDevices({ devicetypes, runtimes: [runtime('16.3')] }, '/Xcode'), /floor/);
  assert.throws(() => selectDevices({ devicetypes, runtimes: [runtime('26.2', ['se'])] }, '/Xcode'), /both/);
});
