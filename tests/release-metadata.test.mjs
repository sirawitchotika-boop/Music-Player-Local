import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = path => readFileSync(join(root, path), 'utf8');
const version = JSON.parse(read('app-version.json'));
const readme = read('README.md');
const changelog = read('CHANGELOG.md');
const manifest = JSON.parse(read('manifest.json'));
const html = read('index.html');
const workflow = read('.github/workflows/build-apk.yml');
const isolatedBuild = read('scripts/prepare-gate1-build.py');

test('Android version metadata has one validated source of truth', () => {
  assert.match(version.versionName, /^\d+\.\d+\.\d+$/);
  assert.ok(Number.isInteger(version.versionCode) && version.versionCode > 0);
  assert.ok(readme.includes('GT SoundMaster (v' + version.versionName + ')'));
  assert.ok(changelog.includes('## [' + version.versionName + '] - 2026-11-20'));
  assert.match(workflow, /app-version\.json/);
  assert.match(workflow, /version_config/);
  assert.match(isolatedBuild, /app-version\.json/);
  assert.match(isolatedBuild, /Generated Android app version does not match app-version\.json/);
});

test('web manifest describes the current player and matches the UI theme', () => {
  assert.equal(manifest.name, 'GT SoundMaster');
  assert.equal(manifest.short_name, 'SoundMaster');
  assert.equal(manifest.theme_color, '#180d12');
  assert.equal(manifest.background_color, '#0b090c');
  assert.match(manifest.description, /playlists, Favorites, playback controls, and a sleep timer/i);
  assert.doesNotMatch(manifest.description, /EQ|pre-amp/i);
  assert.match(html, /<meta name="theme-color" content="#180d12">/);
});

test("What's New notes are available in Help but collapsed by default", () => {
  const match = html.match(/<details class="help-card whats-new-card" id="whats-new">/);
  assert.ok(match, "Help should contain the What's New details element.");
  const start = match.index;
  const end = html.indexOf('</details>', start);
  assert.ok(end > start, "What's New details element should be closed.");
  const section = html.slice(start, end);
  assert.match(section, /WHAT'S NEW IN 1\.2\.2/);
  assert.match(section, /improved small-screen spacing/);
  assert.doesNotMatch(match[0], /\sopen(?:\s|=|$)/);
  assert.match(read('css/help.css'), /whats-new-card\[open\]/);
});

test('README does not advertise removed EQ features or claim an absent license', () => {
  assert.doesNotMatch(readme, /10-Band|Pre-Amp|100% Open-Source/i);
  assert.match(readme, /No LICENSE file is currently included/);
});

test('Android camera-edge status bar and web theme match the player top color', () => {
  const playerCss = read('css/main.css');
  const match = playerCss.match(/linear-gradient\(155deg,\s*(#[0-9a-f]{6})\s+0%/i);
  assert.ok(match, 'Player top gradient should expose its starting color.');
  const topColor = match[1].toLowerCase();
  assert.equal(manifest.theme_color.toLowerCase(), topColor);
  assert.ok(html.includes('<meta name="theme-color" content="' + topColor + '">'));
  assert.ok(workflow.includes('<item name="android:statusBarColor">' + topColor + '</item>'));
  assert.match(workflow, /android:windowLightStatusBar">false/);
});
