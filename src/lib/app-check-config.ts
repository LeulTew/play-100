export interface AppCheckConfiguration {
  siteKey: string;
}

export const APP_CHECK_CSP_SOURCES = {
  'script-src': ['https://www.google.com/recaptcha/', 'https://www.gstatic.com/recaptcha/'],
  'frame-src': ['https://www.google.com/recaptcha/', 'https://recaptcha.google.com/recaptcha/'],
  'connect-src': ['https://content-firebaseappcheck.googleapis.com'],
} as const;

// Off unless VITE_APP_CHECK_ENABLED is exactly "true"; enabling it only sends tokens (monitor mode) until
// enforcement is separately turned on in the Firebase console.
export function readAppCheckConfiguration(environment: Record<string, unknown>): {
  config: AppCheckConfiguration | null;
  error: string | null;
} {
  if (environment.VITE_APP_CHECK_ENABLED !== 'true') return { config: null, error: null };
  const siteKey =
    typeof environment.VITE_APP_CHECK_SITE_KEY === 'string' ? environment.VITE_APP_CHECK_SITE_KEY.trim() : '';
  if (!/^6L[A-Za-z0-9_-]{38}$/.test(siteKey)) {
    return { config: null, error: 'App Check is enabled without a valid public reCAPTCHA v3 site key.' };
  }
  return { config: { siteKey }, error: null };
}

export function appCheckCspProblems(policy: string): string[] {
  const directives = new Map<string, string[]>();
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) directives.set(name.toLowerCase(), sources);
  }
  return Object.entries(APP_CHECK_CSP_SOURCES).flatMap(([directive, required]) =>
    required
      .filter((source) => !(directives.get(directive) ?? []).includes(source))
      .map((source) => `App Check needs ${source} in ${directive}.`),
  );
}
