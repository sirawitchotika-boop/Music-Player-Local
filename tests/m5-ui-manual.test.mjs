import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const helpStart = html.indexOf('id="help-modal"');
const helpEnd = html.indexOf('<!-- Sleep Timer Modal -->');
assert.ok(helpStart >= 0 && helpEnd > helpStart, 'Help manual should exist before the timer dialog.');
const help = html.slice(helpStart, helpEnd);

test('help manual is simple English and explains local music safety', () => {
  assert.match(help, /HOW TO USE/);
  assert.match(help, /All Tracks/);
  assert.match(help, /permanently deletes/i);
  assert.match(help, /backup copies/i);
  assert.doesNotMatch(help, /[\u0E00-\u0E7F]/);
});

test('help manual explains Bluetooth pause and paused session restore', () => {
  assert.match(help, /Bluetooth/i);
  assert.match(help, /Reconnecting does not restart music/i);
  assert.match(help, /Playback stays paused until you press Play/i);
});

test('help manual covers playback modes, seek gestures, and timer use', () => {
  assert.match(help, /Normal, Repeat One, and Shuffle/);
  assert.match(help, /Press and hold Previous or Next/);
  assert.match(help, /Drag the progress bar/);
  assert.match(help, /Tap Stop to cancel or Reset/);
});

test('icon-only controls have accessible names', () => {
  assert.match(html, /aria-label="Open help and instructions"/);
  assert.match(html, /aria-label="Open sleep timer"/);
  assert.match(html, /aria-label="Toggle favorite for the selected song"/);
  assert.match(html, /aria-label="Play or pause"/);
  assert.match(html, /aria-label="Song progress"/);
});
