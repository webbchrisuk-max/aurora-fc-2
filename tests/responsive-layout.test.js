const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const typographyPath = path.join(root, 'aurora-typography.css');
const css = fs.readFileSync(typographyPath, 'utf8');

test('shared CSS defines the large-tablet landscape viewport profile', () => {
  assert.match(
    css,
    /@media\s*\(min-width:\s*1180px\)\s*and\s*\(max-width:\s*1450px\)\s*and\s*\(orientation:\s*landscape\)/,
  );
  assert.match(css, /--aurora-page-gutter:\s*22px/);
  assert.match(css, /max-width:\s*none/);
});

test('shared CSS prevents document overflow while preserving local table scrolling', () => {
  assert.match(css, /html\s*\{[^}]*overflow-x:\s*hidden/s);
  assert.match(css, /body\s*\{[^}]*overflow-x:\s*hidden/s);
  assert.match(css, /\[class\*="table-scroll"\][^{]*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.football-table[^}]*min-width:\s*1080px/s);
});

test('every runnable Aurora page loads the shared responsive layer', () => {
  const pages = fs.readdirSync(root).filter((file) => file.endsWith('.html'));
  const missing = pages.filter((file) => {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    return !html.includes('aurora-typography.css');
  });
  assert.deepEqual(missing, []);
});
