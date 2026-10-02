import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APB2_PROFILE_IDS, protocolRoot, verifyProtocol, type Apb2ProfileId } from './release-apb2-contract';
import { APB2_GATE_ENV, APB2_GATE_STEPS, runGate, type Apb2GateStep } from './release-apb2-gate';
import { GATE_NODE } from './release-gate';

/**
 * The committed APB2 v3.2 runner. The measurement modules are the digest-pinned v3.2 set, named only by --protocol or
 * PLAY100_APB2_PROTOCOL; this runner checks all 145 files against the committed digests before it loads any of them.
 *
 *   npm run release:apb2 -- verify [--protocol <dir>]
 *   npm run release:apb2 -- stage --profile <fine1440cpu1|coarse393cpu4> --dist <dir> --evidence <dir> --stage-id <name>
 *       --browser-version <x.y.z.w> (--quiet-attested | --smoke) [--previous-runtime <runtime.json>] [--protocol <dir>]
 *   npm run release:apb2 -- collect --profile <id> --capture <dir> --dist <dir> --evidence <dir> --name <name> [--protocol <dir>]
 *   npm run release:apb2 -- [gate] --evidence <new dir> [--dist dist] [--browser-version <x.y.z.w>]
 *       [--step all|fine1440cpu1|coarse393cpu4|receipt] [--protocol <dir>]
 *
 * The gate form is what release:gate calls (`release:apb2 -- --evidence <dir>`, PLAY100_APB2_SOURCE_COMMIT and _TREE set);
 * the operator supplies PLAY100_APB2_PROTOCOL, PLAY100_APB2_QUIET_ATTESTED=1 and PLAY100_APB2_BROWSER_VERSION.
 * Exit codes: 0 complete with every gated row passing (or a passing functional smoke), 2 complete with a gated row not
 * passing, 1 anything else (the receipts are kept either way).
 */
export type Apb2Command =
  | { command: 'verify'; protocol?: string }
  | {
      command: 'stage';
      protocol?: string;
      profile: Apb2ProfileId;
      dist: string;
      evidence: string;
      stageId: string;
      browserVersion: string;
      quietAttested: boolean;
      smoke: boolean;
      previousRuntime?: string;
    }
  | {
      command: 'collect';
      protocol?: string;
      profile: Apb2ProfileId;
      capture: string;
      dist: string;
      evidence: string;
      name: string;
    }
  | { command: 'gate'; protocol?: string; evidence: string; dist: string; browserVersion: string; step: Apb2GateStep };

const FLAGS = new Set(['--quiet-attested', '--smoke']);
const VALUES = new Set([
  '--protocol',
  '--profile',
  '--dist',
  '--evidence',
  '--stage-id',
  '--browser-version',
  '--previous-runtime',
  '--capture',
  '--name',
  '--step',
]);

export function parseApb2Arguments(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): Apb2Command {
  // The release:gate hook calls `release:apb2 -- --evidence <dir>` with no command: that is the gate form.
  const [command, ...rest] = argv[0]?.startsWith('--') ? ['gate', ...argv] : argv;
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < rest.length; index += 1) {
    const name = rest[index] as string;
    if (FLAGS.has(name)) {
      assert.ok(!flags.has(name), `Repeated ${name}.`);
      flags.add(name);
    } else if (VALUES.has(name)) {
      const value = rest[index + 1];
      assert.ok(value !== undefined && !value.startsWith('--'), `${name} needs a value.`);
      assert.ok(!values.has(name), `Repeated ${name}.`);
      values.set(name, value);
      index += 1;
    } else throw new Error(`Unknown argument ${name}.`);
  }
  const required = (name: string) => {
    const value = values.get(name);
    assert.ok(value, `${command} needs ${name}.`);
    return value;
  };
  const profile = () => {
    const value = required('--profile');
    assert.ok((APB2_PROFILE_IDS as readonly string[]).includes(value), `Unknown profile ${value}.`);
    return value as Apb2ProfileId;
  };
  const allow = (...names: string[]) => {
    for (const name of [...values.keys(), ...flags])
      assert.ok(names.includes(name), `${name} does not apply to ${command}.`);
  };
  const protocol = values.get('--protocol');
  if (command === 'verify') {
    allow('--protocol');
    return { command, protocol };
  }
  if (command === 'stage') {
    allow(
      '--protocol',
      '--profile',
      '--dist',
      '--evidence',
      '--stage-id',
      '--browser-version',
      '--previous-runtime',
      '--quiet-attested',
      '--smoke',
    );
    const browserVersion = required('--browser-version');
    assert.ok(
      /^\d+\.\d+\.\d+\.\d+$/.test(browserVersion),
      'The browser version is the exact four-part Chrome version.',
    );
    return {
      command,
      protocol,
      profile: profile(),
      dist: required('--dist'),
      evidence: required('--evidence'),
      stageId: required('--stage-id'),
      browserVersion,
      quietAttested: flags.has('--quiet-attested'),
      smoke: flags.has('--smoke'),
      previousRuntime: values.get('--previous-runtime'),
    };
  }
  if (command === 'collect') {
    allow('--protocol', '--profile', '--capture', '--dist', '--evidence', '--name');
    return {
      command,
      protocol,
      profile: profile(),
      capture: required('--capture'),
      dist: required('--dist'),
      evidence: required('--evidence'),
      name: required('--name'),
    };
  }
  if (command === 'gate') {
    allow('--protocol', '--evidence', '--dist', '--browser-version', '--step');
    const step = values.get('--step') ?? 'all';
    assert.ok((APB2_GATE_STEPS as readonly string[]).includes(step), `Unknown gate step ${step}.`);
    return {
      command,
      protocol,
      evidence: required('--evidence'),
      dist: values.get('--dist') ?? 'dist',
      browserVersion: values.get('--browser-version') ?? env[APB2_GATE_ENV.browser] ?? '',
      step: step as Apb2GateStep,
    };
  }
  throw new Error('Usage: release:apb2 <verify|stage|collect|gate> [options]');
}

/** The exit code of a finished run (see the usage above). */
export function exitCode(result: { complete: boolean; smokePassed?: boolean; allGatedPass: boolean }) {
  if (result.smokePassed) return 0;
  if (!result.complete) return 1;
  return result.allGatedPass ? 0 : 2;
}

export async function releaseApb2(argv: readonly string[]) {
  const options = parseApb2Arguments(argv);
  const root = protocolRoot(options.protocol);
  if (options.command === 'verify') {
    const verification = await verifyProtocol(root);
    console.log(JSON.stringify({ ...verification, extra: verification.extra.length }, null, 2));
    return verification.ok ? 0 : 1;
  }
  assert.equal(process.version, GATE_NODE, `Use the gate runtime ${GATE_NODE}.`);
  if (options.command === 'gate') {
    const { receipt, exitCode: code } = await runGate({ ...options, protocol: root });
    if (receipt)
      console.log(
        JSON.stringify(
          { status: receipt.status, complete: receipt.complete, source: receipt.source, reasons: receipt.reasons },
          null,
          2,
        ),
      );
    return code;
  }
  const { collectCapture, runApb2Stage } = await import('./release-apb2-stage');
  if (options.command === 'collect') {
    const collection = await collectCapture({ ...options, protocol: root });
    console.log(JSON.stringify(collection, null, 2));
    return exitCode({ complete: collection.equal, allGatedPass: collection.allGatedPass });
  }
  const receipt = await runApb2Stage({ ...options, protocol: root });
  const collection = receipt.collection as { allGatedPass?: boolean } | undefined;
  return exitCode({
    complete: receipt.result === 'CAPTURE_COMPLETE_TABLE_RECOMPUTED',
    smokePassed: receipt.result === 'SMOKE_PASSED_NO_TIMING_CLAIMS',
    allGatedPass: collection?.allGatedPass === true,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  releaseApb2(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}
