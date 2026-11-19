import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/main.css', import.meta.url), 'utf8');

const headerStart = html.indexOf('<header class="top-bar">');
const headerEnd = html.indexOf('</header>', headerStart);
assert.ok(headerStart >= 0 && headerEnd > headerStart, 'Player header should exist.');
const header = html.slice(headerStart, headerEnd);
const rule = (selector) => {
  const start = css.indexOf(selector + ' {');
  assert.ok(start >= 0, selector + ' rule should exist.');
  const end = css.indexOf('}', start);
  assert.ok(end > start, selector + ' rule should close.');
  return css.slice(start, end);
};

test('player header centers the logo independently of the utility buttons', () => {
  assert.match(rule('.top-bar'), /display:\s*grid/);
  assert.match(rule('.top-bar'), /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\)/);
  assert.match(rule('.top-center'), /grid-column:\s*2/);
  assert.match(rule('.top-right-actions'), /grid-column:\s*3/);
  assert.match(rule('.top-right-actions'), /justify-self:\s*end/);
});

test('Help and Sleep Timer remain grouped on the right', () => {
  assert.match(header, /id="help-btn"/);
  assert.match(header, /id="sleep-timer-btn"/);
  assert.ok(header.indexOf('id="help-btn"') < header.indexOf('id="sleep-timer-btn"'));
  assert.match(header, /class="top-right-actions"/);
});

test('left header column remains free for a future control', () => {
  assert.doesNotMatch(header, /style="width:\s*28px"/);
  assert.match(rule('.top-bar'), /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\)/);
});

test('brand title remains in the centered header column', () => {
  assert.match(header, /class="top-center"[\s\S]*class="app-title"/);
  assert.match(header, /GT<\/span>\s*SOUNDMASTER/);
});
