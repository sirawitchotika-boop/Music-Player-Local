import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const prepare = join(root, 'scripts/prepare-gate1-build.py');
const original = 'com.gt.soundmaster';
const gate1 = 'com.gt.soundmaster.gate1';
const appVersion = JSON.parse(readFileSync(join(root, 'app-version.json'), 'utf8'));

function fixture(configType = 'json') {
  const folder = mkdtempSync(join(tmpdir(), 'gt-gate1-fixture-'));
  const files = {
    'app-version.json': JSON.stringify(appVersion),
    'android/app/build.gradle': `android {\n defaultConfig {\n  applicationId "com.gt.soundmaster"\n  versionCode ${appVersion.versionCode}\n  versionName "${appVersion.versionName}"\n }\n}`,
    'android/app/src/main/AndroidManifest.xml':
      '<manifest><application android:label="@string/app_name"><activity android:name=".MainActivity"/><service android:name="com.gt.soundmaster.MediaPlaybackService"/></application></manifest>',
    'android/app/src/main/res/values/strings.xml':
      '<resources><string name="app_name">GT SoundMaster</string><string name="title_activity_main">GT SoundMaster</string><string name="package_name">com.gt.soundmaster</string><string name="custom_url_scheme">com.gt.soundmaster</string></resources>',
    'android/app/src/main/java/com/gt/soundmaster/MainActivity.java':
      'package com.gt.soundmaster; class MainActivity {}',
    'android/app/src/main/java/com/gt/soundmaster/MediaPlaybackService.java':
      'package com.gt.soundmaster; class MediaPlaybackService {}'
  };
  files[configType === 'json' ? 'capacitor.config.json' : 'capacitor.config.ts'] =
    configType === 'json' ? JSON.stringify({ appId: original, appName: 'GT SoundMaster', webDir: 'www' })
      : "export default { appId: 'com.gt.soundmaster', appName: 'GT SoundMaster', webDir: 'www' };";
  for (const [path, value] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), value);
  }
  return { folder,
    read: path => readFileSync(join(folder, path), 'utf8'),
    write: (path, value) => writeFileSync(join(folder, path), value),
    dispose: () => rmSync(folder, { recursive: true, force: true })
  };
}

test('generated Gate 1 app has a separate installed package and visible TEST label', () => {
  const f = fixture();
  try {
    execFileSync('python3', [prepare, f.folder]);
    assert.match(f.read('android/app/build.gradle'), /applicationId "com\.gt\.soundmaster\.gate1"/);
    assert.match(f.read('android/app/src/main/AndroidManifest.xml'), /android:name="com\.gt\.soundmaster\.MainActivity"/);
    assert.match(f.read('android/app/src/main/AndroidManifest.xml'), /android:name="com\.gt\.soundmaster\.MediaPlaybackService"/);
    assert.match(f.read('android/app/src/main/res/values/strings.xml'), /<string name="app_name">GT SoundMaster TEST<\/string>/);
    assert.match(f.read('android/app/src/main/res/values/strings.xml'), /<string name="custom_url_scheme">com\.gt\.soundmaster\.gate1<\/string>/);
    const config = JSON.parse(f.read('capacitor.config.json'));
    assert.deepEqual([config.appId, config.appName, config.webDir], [gate1, 'GT SoundMaster TEST', 'www']);
    assert.equal(f.read('android/app/src/main/java/com/gt/soundmaster/MainActivity.java'),
      'package com.gt.soundmaster; class MainActivity {}');
  } finally { f.dispose(); }
});

test('Capacitor TypeScript config is also isolated', () => {
  const f = fixture('ts');
  try {
    execFileSync('python3', [prepare, f.folder]);
    assert.match(f.read('capacitor.config.ts'), /appId: 'com\.gt\.soundmaster\.gate1'/);
    assert.match(f.read('capacitor.config.ts'), /appName: 'GT SoundMaster TEST'/);
  } finally { f.dispose(); }
});

test('unexpected generated Android template fails without partially changing files', () => {
  const f = fixture();
  try {
    const gradle = 'android/app/build.gradle', manifest = 'android/app/src/main/AndroidManifest.xml';
    const before = f.read(gradle);
    f.write(manifest, f.read(manifest).replace('.MainActivity', 'UnexpectedActivity'));
    assert.throws(() => execFileSync('python3', [prepare, f.folder], { stdio: 'pipe' }));
    assert.equal(f.read(gradle), before);
    assert.ok(!f.read('capacitor.config.json').includes(gate1));
  } finally { f.dispose(); }
});

test('cannot transform another application package by accident', () => {
  const f = fixture();
  try {
    const gradle = 'android/app/build.gradle';
    f.write(gradle, f.read(gradle).replace(original, 'com.unrelated.app'));
    assert.throws(() => execFileSync('python3', [prepare, f.folder], { stdio: 'pipe' }));
    assert.match(f.read(gradle), /com\.unrelated\.app/);
  } finally { f.dispose(); }
});

test('CI isolates pull requests, verifies the compiled APK, and never uploads a PR artifact', () => {
  const build = readFileSync(join(root, '.github/workflows/build-apk.yml'), 'utf8');
  const gate = readFileSync(join(root, '.github/workflows/gate1-test-apk.yml'), 'utf8');
  const icon = readFileSync(join(root, 'scripts/mark-gate1-icon.cjs'), 'utf8');
  assert.match(build, /workflow_call:/);
  assert.match(build, /GT_GATE1_ISOLATED: \$\{\{ github\.event_name == 'pull_request' && inputs\.signing_test_preview != true \|\| inputs\.gate1_isolated == true \}\}/);
  assert.match(build, /node scripts\/mark-gate1-icon\.cjs/);
  assert.match(build, /python3 scripts\/prepare-gate1-build\.py/);
  assert.match(build, /dump badging/);
  assert.match(build, /package: name='com\.gt\.soundmaster\.gate1'/);
  assert.match(build, /application-label:'GT SoundMaster TEST'/);
  assert.match(build, /if: github\.event_name == 'workflow_dispatch' && env\.GT_GATE1_ISOLATED != 'true'/);
  assert.match(build, /if: github\.event_name == 'workflow_dispatch' && env\.GT_GATE1_ISOLATED == 'true'/);
  assert.match(gate, /workflow_dispatch:/);
  assert.match(gate, /gate1_isolated: true/);
  assert.match(icon, /TEST/);
});
