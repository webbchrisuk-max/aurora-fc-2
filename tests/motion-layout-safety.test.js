const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const motionCss = fs.readFileSync(path.join(root, 'aurora-motion.css'), 'utf8');

test('structural page entrance keyframes never create transform containing blocks', () => {
  for (const name of ['aurora-panel-in', 'aurora-hero-in']) {
    const keyframes = motionCss.match(new RegExp(`@keyframes ${name}\\{([^}]|}[^@])*?}}`));
    assert.ok(keyframes, `${name} keyframes should exist`);
    assert.doesNotMatch(keyframes[0], /\btransform\s*:/, `${name} must remain opacity-only`);
    assert.doesNotMatch(keyframes[0], /\b(width|max-width|min-width|contain|overflow)\s*:/, `${name} must not affect layout sizing`);
  }
});

test('every shell page loads the layout-safe motion stylesheet revision', () => {
  const pages = [
    'index.html',
    'finance.html',
    'income.html',
    'registration.html',
    'scouting.html',
    'squad.html',
    'system-health.html',
    'transfer.html',
    'club-control.html'
  ];

  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /aurora-motion\.css\?v=20260816-2/, `${page} should load the fixed motion CSS`);
  }
});
