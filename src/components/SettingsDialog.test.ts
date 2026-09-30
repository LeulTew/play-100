import { createElement, useState } from 'react';
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyPersonalLibrary } from '../lib/personal-library';
import { SettingsDialog } from './SettingsDialog';

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return { ...react, useState: vi.fn(react.useState) };
});

afterEach(() => vi.mocked(useState).mockReset());

const storageFull = 'Device storage is full. Your changes were not saved. Free some space and try again.';
const resetFailed = 'Reset failed. Your saved data has not been removed.';
const pinsRetained =
  'Your library and preferences were reset, but saved Compare pins could not be cleared. Allow storage and try Reset again.';
const resetSaved = 'Your active library, Play later, ranking, Compare pins and preferences have been reset.';

function renderFeedback(result: 'saved' | 'failed' | 'pins-retained' | null, warning: string | null) {
  vi.mocked(useState).mockReturnValueOnce([false, vi.fn()]).mockReturnValueOnce([result, vi.fn()]);
  const props: ComponentProps<typeof SettingsDialog> = {
    motion: 'lite',
    reducedMotion: true,
    constrained: false,
    saved: 0,
    completed: 0,
    warning,
    onMotion: vi.fn(async () => true),
    onReset: vi.fn(async () => true),
    state: emptyPersonalLibrary(),
    persistent: true,
    busy: false,
    onRestore: vi.fn(async () => true),
    onAbout: vi.fn(),
    onClose: vi.fn(),
  };
  const html = renderToStaticMarkup(createElement(SettingsDialog, props));
  const section = /<section class="device-settings">([\s\S]*?)<\/section>/.exec(html)?.[1];
  if (!section) throw new Error('Settings must retain the device section.');
  const messages = (role: 'alert' | 'status') =>
    [...section.matchAll(new RegExp(`<p\\b[^>]*role="${role}"[^>]*>([\\s\\S]*?)<\\/p>`, 'g'))].map((match) => match[1]);
  return { props, section, alerts: messages('alert'), statuses: messages('status') };
}

describe('Settings reset feedback', () => {
  it.each([
    ['failed', resetFailed],
    ['pins-retained', pinsRetained],
  ] as const)('merges %s feedback and its storage warning into exactly one alert', (result, message) => {
    const { props, section, alerts, statuses } = renderFeedback(result, storageFull);
    expect(alerts).toEqual([`${message} ${storageFull}`]);
    expect(section.split(storageFull)).toHaveLength(2);
    expect(statuses).toEqual([]);
    expect(props.onReset).not.toHaveBeenCalled();
  });

  it.each([
    ['failed', resetFailed],
    ['pins-retained', pinsRetained],
  ] as const)('keeps one %s alert without inventing a storage cause', (result, message) => {
    const { alerts, statuses } = renderFeedback(result, null);
    expect(alerts).toEqual([message]);
    expect(statuses).toEqual([]);
  });

  it('keeps an independent storage warning visible before a reset result', () => {
    const { alerts, statuses } = renderFeedback(null, storageFull);
    expect(alerts).toEqual([storageFull]);
    expect(statuses).toEqual([]);
  });

  it('does not discard a remaining warning after successful reset', () => {
    const { alerts, statuses } = renderFeedback('saved', storageFull);
    expect(alerts).toEqual([storageFull]);
    expect(statuses).toEqual([resetSaved]);
  });

  it('announces a successful reset as status, not an error', () => {
    const { alerts, statuses } = renderFeedback('saved', null);
    expect(alerts).toEqual([]);
    expect(statuses).toEqual([resetSaved]);
  });
});
