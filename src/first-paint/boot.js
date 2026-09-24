/* global window, document */
// Boot gate and app loader for the static first-paint shell (docs/first-paint-shell.md). The build
// strips the comments and inlines this classic script at the end of <head>, right after the
// <template id="p100-deferred"> that holds the app's startup tags (scripts/first-paint/plugin.ts);
// vercel.json allows it by hash only. It must stay small and self-contained: it writes no storage,
// and the only requests it causes are those of the startup tags. It accepts the document only when
// React's first commit will render the same landing header and hero, and leaves the shell hidden
// whenever anything is uncertain. Then it starts the app: after the first contentful paint when it
// shows the shell, at once otherwise.
(function () {
  var accept = function () {
    var root = document.documentElement;
    var url = window.location;
    var params = new window.URLSearchParams(url.search);
    // src/lib/url.ts: pageFromPath() trims trailing slashes, and parseUrl() hides the hero for
    // view=table. A game link opens its dialog over the page, and catalogs=off changes the
    // navigation links, so those render something else too. Panel intents (info=) open only
    // after the first commit (src/hooks/useAppPanel.ts), so they keep the landing.
    if ((url.pathname.replace(/\/+$/, '') || '/') !== '/') return false;
    if (params.get('view') === 'table' || params.get('game') || params.get('catalogs') === 'off') return false;

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
      if (!(box.width >= probe[2] && box.width <= probe[3] && Math.abs(box.height - probe[4]) <= 2)) return false;
    }

    root.setAttribute('data-boot-art', art);
    root.setAttribute('data-boot', 'landing');
    return true;
  };

  // The template holds Vite's module entry, its modulepreloads, the entry stylesheet and the head
  // preloads, in that order, and starts none of them. start() inserts them once, the entry as a
  // modulepreload. The entry itself runs only after every stylesheet has loaded or failed, so React
  // never commits before the full stylesheet applies, and, like the parser-inserted module it
  // replaces, only once the document is parsed and #root exists.
  var started = false;
  var start = function () {
    if (started) return;
    started = true;
    var head = document.head;
    var tags = document.getElementById('p100-deferred').content.children;
    var entry;
    var pending = 1;
    var add = function (name, type, attribute) {
      var node = document.createElement(name);
      node.setAttribute(name === 'script' ? 'type' : 'rel', type);
      if (entry.hasAttribute('crossorigin')) node.setAttribute('crossorigin', entry.getAttribute('crossorigin'));
      node.setAttribute(attribute, entry.getAttribute('src'));
      head.appendChild(node);
    };
    var settle = function () {
      pending -= 1;
      if (!pending) add('script', 'module', 'src');
    };
    for (var index = 0; index < tags.length; index += 1) {
      var tag = tags[index];
      if (tag.tagName === 'SCRIPT') {
        entry = tag;
        add('link', 'modulepreload', 'href');
      } else {
        var link = head.appendChild(document.importNode(tag, true));
        if (link.getAttribute('rel') === 'stylesheet') {
          pending += 1;
          link.addEventListener('load', settle);
          link.addEventListener('error', settle);
        }
      }
    }
    if (document.readyState === 'loading') {
      pending += 1;
      document.addEventListener('DOMContentLoaded', settle);
    }
    settle();
  };

  // On the landing page nothing the app needs is requested before the shell's first contentful
  // paint, which Chromium reports once the frame is presented. Hidden and prerendered documents do
  // not paint yet, so they start at once. Once the document is parsed its first paint is due, and
  // a second later the app starts whatever happened to that paint.
  var afterPaint = function () {
    if (document.visibilityState === 'hidden' || document.prerendering) return false;
    var observer = new window.PerformanceObserver(function (list) {
      if (!list.getEntriesByName('first-contentful-paint').length) return;
      observer.disconnect();
      start();
    });
    observer.observe({ type: 'paint', buffered: true });
    document.addEventListener('DOMContentLoaded', function () { window.setTimeout(start, 1000); });
    return true;
  };

  var deferred;
  try {
    deferred = accept() && afterPaint();
  } catch {
    // Fail closed: without data-boot the shell keeps its hidden attribute, and the app starts now.
  }
  if (!deferred) start();
})();
