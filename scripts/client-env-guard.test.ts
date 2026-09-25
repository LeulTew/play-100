import { describe, expect, it } from 'vitest';
import { hasWholeEnvLiteral } from './client-env-guard.ts';

describe('the whole client-env literal detector', () => {
  it('flags an inlined import.meta.env object', () => {
    expect(hasWholeEnvLiteral('const e={BASE_URL:"/",DEV:!1,MODE:"production",PROD:!0,SSR:!1};')).toBe(true);
    expect(hasWholeEnvLiteral('x({ "BASE_URL": "/", "MODE": "production" })')).toBe(true);
    expect(hasWholeEnvLiteral('const e={MODE:"production",VITE_VERCEL_ENV:"production"};')).toBe(true);
  });

  it('passes named reads and prose that only mentions BASE_URL', () => {
    expect(hasWholeEnvLiteral('const k={VITE_FIREBASE_API_KEY:"public",VITE_FIREBASE_CONFIG:void 0};')).toBe(false);
    expect(hasWholeEnvLiteral('fetch("/"+"data.json"); // uses BASE_URL: the site root')).toBe(false);
    expect(hasWholeEnvLiteral('throw Error("BASE_URL: must be /")')).toBe(false);
  });
});
