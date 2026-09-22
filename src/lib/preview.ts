/**
 * Build the srcdoc for the sandboxed live-preview iframe.
 *
 * The iframe is rendered with sandbox="allow-scripts" and NO allow-same-origin,
 * so the document runs in an opaque origin: student code cannot reach the parent
 * DOM, cookies, localStorage, or any application API. The only channel back is
 * postMessage, which we use exclusively for console forwarding.
 *
 * Student code is injected as TEXT into <style>/<script> nodes created at
 * runtime inside the sandbox, never concatenated into the parent's DOM.
 */
export const PREVIEW_ORIGIN_NOTE = 'sandboxed, opaque origin, scripts only';

export function buildPreviewDocument(html: string, css: string, js: string): string {
  const payload = JSON.stringify({ html: html ?? '', css: css ?? '', js: js ?? '' })
    // Prevent the JSON blob from terminating the <script> element early.
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Preview</title>
<style id="__base">html,body{margin:0;padding:8px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#fff;color:#111}</style>
</head>
<body>
<script id="__bootstrap">
(function () {
  var payload = ${payload};
  function send(level, args) {
    try {
      parent.postMessage({ __preview: true, level: level, args: args.map(stringify) }, '*');
    } catch (e) {}
  }
  function stringify(value) {
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch (e) { return String(value); }
  }
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var original = console[level];
    console[level] = function () {
      var args = Array.prototype.slice.call(arguments);
      send(level, args);
      if (original) original.apply(console, args);
    };
  });
  window.addEventListener('error', function (e) { send('error', [e.message]); });
  window.addEventListener('unhandledrejection', function (e) {
    send('error', ['Unhandled promise rejection: ' + stringify(e.reason)]);
  });

  // Student HTML: if it is a full document, use only its <body> contents and
  // pick up any <style> blocks it declared.
  var raw = payload.html || '';
  var container = document.createElement('div');
  container.id = '__student_root';
  var bodyMatch = /<body[^>]*>([\\s\\S]*?)<\\/body>/i.exec(raw);
  container.innerHTML = bodyMatch ? bodyMatch[1] : raw;
  document.body.appendChild(container);
  while (container.firstChild) document.body.insertBefore(container.firstChild, container);
  container.remove();

  var style = document.createElement('style');
  style.appendChild(document.createTextNode(payload.css || ''));
  document.head.appendChild(style);

  var script = document.createElement('script');
  script.appendChild(document.createTextNode(payload.js || ''));
  document.body.appendChild(script);
})();
</script>
</body>
</html>`;
}
