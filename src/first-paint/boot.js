/* global window, document */
// Boot gate for the static first-paint shell (docs/first-paint-shell.md). The build strips the
// comments and inlines this classic script in <head>, before the module entry
// (scripts/first-paint/plugin.ts); vercel.json allows it by hash only. It must stay tiny and
// self-contained: no network, no storage writes. It accepts the document only when React's first
// commit will render the same landing header and hero, and leaves the shell hidden whenever
// anything is uncertain.
(function () {
  try {
    var root = document.documentElement;
    var url = window.location;
    var params = new window.URLSearchParams(url.search);
    // src/lib/url.ts: pageFromPath() trims trailing slashes, and parseUrl() hides the hero for
    // view=table. A game link opens its dialog over the page, and catalogs=off changes the
    // navigation links, so those render something else too. Panel intents (info=) open only
    // after the first commit (src/hooks/useAppPanel.ts), so they keep the landing.
    if ((url.pathname.replace(/\/+$/, '') || '/') !== '/') return;
    if (params.get('view') === 'table' || params.get('game') || params.get('catalogs') === 'off') return;

    // The artifact caption React renders before the library opens (CollectionArtifact.tsx):
    // the stored guest hint or 'lite' (src/lib/motion-hint.ts) and the device hints
    // (src/hooks/useCapabilities.ts, src/lib/device-capabilities.ts).
    var matches = function (query) { return window.matchMedia(query).matches; };
    var hint;
    try { hint = window.localStorage.getItem('play100.motion-hint.v1:guest'); } catch { hint = null; }
    var quality = hint === 'auto' || hint === 'full' ? hint : 'lite';
    var nav = window.navigator;
    var connection = nav.connection || {};
    var constrained = Boolean(connection.saveData) || connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g'
      || (nav.deviceMemory !== undefined && nav.deviceMemory <= 4)
      || (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 2);
    var art = matches('(prefers-reduced-motion: reduce)') ? 'reduced'
      : quality === 'lite' ? 'lite'
        : quality === 'auto' && constrained ? 'saving'
          : quality === 'auto' && matches('(pointer: coarse)') ? 'tap'
            : 'ready';

    // The metric-matched fallback faces must be usable right now, or shell text would reflow
    // when the web fonts arrive. Expected boxes come from the derivation in shell.css (+-0.6%).
    var probes = [
      ['p100-probe-display', 'GREAT ESCAPES.', 606, 613.3, 120],
      ['p100-probe-sans', 'Find your next world.', 926.8, 938, 130],
      ['p100-probe-sans-bold', 'Find your next world.', 933.4, 944.7, 130],
    ];
    var spans = probes.map(function (probe) {
      var span = document.createElement('span');
      span.className = 'p100-probe ' + probe[0];
      span.textContent = probe[1];
      return root.appendChild(span);
    });
    var boxes = spans.map(function (span) { return span.getBoundingClientRect(); });
    spans.forEach(function (span) { root.removeChild(span); });
    for (var index = 0; index < probes.length; index += 1) {
      var probe = probes[index];
      var box = boxes[index];
      if (!(box.width >= probe[2] && box.width <= probe[3] && Math.abs(box.height - probe[4]) <= 2)) return;
    }

    root.setAttribute('data-boot-art', art);
    root.setAttribute('data-boot', 'landing');
  } catch {
    // Fail closed: without the attribute the shell keeps its hidden attribute.
  }
})();
