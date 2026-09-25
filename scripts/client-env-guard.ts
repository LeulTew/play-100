import type { Plugin } from 'vite';

// A bare `import.meta.env` value compiles to one object literal holding every VITE_* variable, including a
// host's system variables (Vercel's VITE_VERCEL_*). Its BASE_URL property, or any VITE_VERCEL_ name, marks it.
// Named reads such as `import.meta.env.BASE_URL` compile to plain values and never match.
const WHOLE_ENV_PROPERTY = /[{,]\s*["']?BASE_URL["']?\s*:\s*["'`]/;

/** Whether emitted JavaScript contains the whole client-env object literal. */
export function hasWholeEnvLiteral(code: string): boolean {
  return WHOLE_ENV_PROPERTY.test(code) || code.includes('VITE_VERCEL_');
}

/** Fails the build when any emitted JavaScript chunk inlines the whole client env. */
export function clientEnvGuard(): Plugin {
  return {
    name: 'play100-client-env-guard',
    apply: 'build',
    writeBundle(_options, bundle) {
      const leaks: string[] = [];
      for (const output of Object.values(bundle))
        if (output.type === 'chunk' && hasWholeEnvLiteral(output.code)) leaks.push(output.fileName);
      if (leaks.length)
        throw new Error(`The build inlines the whole import.meta.env object; pass named keys: ${leaks.join(', ')}`);
    },
  };
}
