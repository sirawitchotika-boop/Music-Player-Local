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

test('EQ keeps its own left header column without an artificial spacer', () => {
  assert.match(header, /id="eq-btn"/);
  assert.doesNotMatch(header, /style="width:\s*28px"/);
  assert.match(rule('.top-bar'), /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\)/);
});

test('brand title remains centered, single-line, and responsive', () => {
  assert.match(header, /class="top-center"[\s\S]*class="app-title"/);
  assert.match(header, /GT<\/span>\s*SOUNDMASTER/);
  assert.match(rule('.app-title'), /font-size:\s*clamp\(12px,\s*3\.8vw,\s*16px\)/);
  assert.match(rule('.app-title'), /letter-spacing:\s*clamp\(0\.2px,\s*0\.12vw,\s*1\.2px\)/);
  assert.match(rule('.app-title'), /white-space:\s*nowrap/);
});

test('small-screen header keeps 42px controls and more space for the title', () => {
  assert.match(rule('.icon-btn'), /width:\s*42px/);
  assert.match(rule('.icon-btn'), /height:\s*42px/);
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*?padding-left:\s*10px/);
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*?\.top-right-actions\s*\{\s*gap:\s*4px/);
});

test('Favorite is outside the clipped record but anchored to the same-size stage', () => {
  const visualizerStart = html.indexOf('id="visualizer-section"');
  const visualizerEnd = html.indexOf('</section>', visualizerStart);
  const visualizer = html.slice(visualizerStart, visualizerEnd);

  // The button must be a sibling of the clipped record, not a child of it.
  assert.match(visualizer,
    /<div class="album-art-stage">[\s\S]*?<div class="album-art-container">[\s\S]*?<\/div>\s*<\/div>\s*<button id="favorite-btn"/);
  assert.match(rule('.album-art-stage'), /position:\s*relative/);
  assert.match(rule('.album-art-stage'), /width:\s*min\(74vw,\s*320px\)/);
  assert.match(rule('.album-art-container'), /overflow:\s*hidden/);
  assert.match(rule('.album-art-container'), /width:\s*100%/);

  const favorite = rule('.favorite-btn');
  assert.match(favorite, /position:\s*absolute/);
  assert.match(favorite, /right:\s*-10%/);
  assert.match(favorite, /bottom:\s*-33%/);
  assert.match(favorite, /width:\s*clamp\(48px,\s*14vw,\s*58px\)/);
  assert.match(favorite, /height:\s*clamp\(48px,\s*14vw,\s*58px\)/);
  assert.match(rule('.favorite-btn svg'), /width:\s*25px/);

  // Keep the button at the lower-right of the disc, fully on-screen on phones.
  for (const viewport of [320, 360, 393, 430]) {
    const disc = Math.min(0.74 * viewport, 320);
    const button = Math.max(48, Math.min(0.14 * viewport, 58));
    const stageRight = (viewport + disc) / 2;
    const buttonRight = stageRight + 0.1 * disc;
    const belowDisc = 0.33 * disc - button / 2;
    assert.ok(buttonRight <= viewport - 12,
      'Favorite should not overflow the right edge at ' + viewport + 'px');
    assert.ok(belowDisc > 45,
      'Favorite should sit below the record at ' + viewport + 'px');
  }
});

test('short screens keep the smaller record and a tighter Favorite offset', () => {
  assert.match(css, /@media \(max-height: 720px\)[\s\S]*?\.album-art-stage\s*\{[\s\S]*?width:\s*min\(60vw,\s*248px\)/);
  assert.match(css, /@media \(max-height: 720px\)[\s\S]*?\.favorite-btn\s*\{\s*bottom:\s*-18%/);
});

