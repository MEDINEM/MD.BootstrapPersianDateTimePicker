// Minimal static server for the regression harness. Pages loaded from file:// report script
// errors as an opaque "Script error.", which hides the exception a test is looking for.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.MDS_TEST_PORT || 4179);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
const allowed = ['test', 'dist', 'node_modules/bootstrap/dist'].map(p => path.join(root, p) + path.sep);
// MDS_DIST_DIR serves another build as /dist, e.g. the unpatched upstream files, to show which
// tests fail without the patches.
const distDir = process.env.MDS_DIST_DIR ? path.resolve(process.env.MDS_DIST_DIR) + path.sep : null;

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = distDir && urlPath.startsWith('/dist/')
    ? path.normalize(path.join(distDir, urlPath.slice('/dist/'.length)))
    : path.normalize(path.join(root, urlPath));
  if (distDir && file.startsWith(distDir) && fs.existsSync(file)) {
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
    return;
  }
  if (!allowed.some(prefix => file.startsWith(prefix)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`harness on http://127.0.0.1:${port}/test/harness.html`));
