import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const prepare = join(root, 'scripts/prepare-gate1-build.py');
const signingScript = join(root, 'scripts/prepare-signing-test.sh');
const originalId = 'com.gt.soundmaster';
const signId = 'com.gt.soundmaster.signingtest';

function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'gt-m4-signing-fixture-'));
  const files = {
    'android/app/build.gradle': 'android {\n defaultConfig {\n  applicationId "com.gt.soundmaster"\n  versionCode 4\n  versionName "1.2.1"\n }\n}\n',
    'android/app/src/main/AndroidManifest.xml':
      '<manifest><application android:label="@string/app_name"><activity android:name=".MainActivity"/><service android:name="com.gt.soundmaster.MediaPlaybackService"/></application></manifest>',
    'android/app/src/main/res/values/strings.xml':
      '<resources><string name="app_name">GT SoundMaster</string><string name="title_activity_main">GT SoundMaster</string><string name="package_name">com.gt.soundmaster</string><string name="custom_url_scheme">com.gt.soundmaster</string></resources>',
    'android/app/src/main/java/com/gt/soundmaster/MainActivity.java':
      'package com.gt.soundmaster; class MainActivity {}',
    'android/app/src/main/java/com/gt/soundmaster/MediaPlaybackService.java':
      'package com.gt.soundmaster; class MediaPlaybackService {}',
    'capacitor.config.json': JSON.stringify({ appId: originalId, appName: 'GT SoundMaster', webDir: 'www' })
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), content);
  }
  return {
    folder,
    read(path) { return readFileSync(join(folder, path), 'utf8'); },
    write(path, text) { writeFileSync(join(folder, path), text); },
    dispose() { rmSync(folder, { force: true, recursive: true }); }
  };
}

test('signing-test identity is separate from original and Gate 1 TEST installations', () => {
  const f = fixture();
  try {
    execFileSync('python3', [prepare, '--signing-test', f.folder],
      { env: { ...process.env, GT_SIGNING_TEST_BUILD_NUMBER: '19' } });
    const gradle = f.read('android/app/build.gradle');
    assert.match(gradle, /applicationId "com\.gt\.soundmaster\.signingtest"/);
    assert.match(gradle, /versionCode 10019/);
    assert.match(gradle, /versionName "1\.2\.1-st\.19"/);
    assert.match(f.read('android/app/src/main/AndroidManifest.xml'),
      /android:name="com\.gt\.soundmaster\.MainActivity"/);
    assert.match(f.read('android/app/src/main/AndroidManifest.xml'),
      /android:name="com\.gt\.soundmaster\.MediaPlaybackService"/);
    assert.match(f.read('android/app/src/main/res/values/strings.xml'),
      /<string name="app_name">GT SoundMaster SIGN TEST<\/string>/);
    assert.match(f.read('android/app/src/main/res/values/strings.xml'),
      /<string name="custom_url_scheme">com\.gt\.soundmaster\.signingtest<\/string>/);
    const config = JSON.parse(f.read('capacitor.config.json'));
    assert.equal(config.appId, signId);
    assert.equal(config.appName, 'GT SoundMaster SIGN TEST');
    assert.equal(config.webDir, 'www');
    assert.equal(f.read('android/app/src/main/java/com/gt/soundmaster/MainActivity.java'),
      'package com.gt.soundmaster; class MainActivity {}');
  } finally { f.dispose(); }
});

test('signing-test build numbers increase and reject invalid values without modifying files', () => {
  const f = fixture();
  try {
    const original = f.read('android/app/build.gradle');
    for (const number of ['0', '-2', 'not-a-number', '1000001']) {
      assert.throws(() => execFileSync('python3', [prepare, '--signing-test', f.folder],
        { env: { ...process.env, GT_SIGNING_TEST_BUILD_NUMBER: number }, stdio: 'pipe' }));
      assert.equal(f.read('android/app/build.gradle'), original);
      assert.equal(JSON.parse(f.read('capacitor.config.json')).appId, originalId);
    }
  } finally { f.dispose(); }
});

test('signing-test conversion refuses unexpected package ID and does not alter Android files', () => {
  const f = fixture();
  try {
    const gradle = 'android/app/build.gradle';
    f.write(gradle, f.read(gradle).replace(originalId, 'com.unrelated.app'));
    assert.throws(() => execFileSync('python3', [prepare, '--signing-test', f.folder],
      { stdio: 'pipe' }));
    assert.match(f.read(gradle), /com\.unrelated\.app/);
    assert.equal(JSON.parse(f.read('capacitor.config.json')).appId, originalId);
  } finally { f.dispose(); }
});

test('signing helper fails closed without secrets; never creates credentials or changes Gradle', () => {
  const f = fixture();
  try {
    const before = f.read('android/app/build.gradle');
    const result = spawnSync('bash', [signingScript], {
      cwd: f.folder,
      env: {
        PATH: process.env.PATH,
        RUNNER_TEMP: f.folder,
        GITHUB_ENV: join(f.folder, 'github-env')
      },
      encoding: 'utf8'
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing required GitHub Secret/);
    assert.equal(f.read('android/app/build.gradle'), before);
    assert.equal(existsSync(join(f.folder, 'gt-soundmaster-signingtest.jks')), false);
  } finally { f.dispose(); }
});

test('CI compiles signing-test identity without secrets on PR, manual signing is gated, and uploads never overlap', () => {
  const build = readFileSync(join(root, '.github/workflows/build-apk.yml'), 'utf8');
  const trigger = readFileSync(join(root, '.github/workflows/m4-signing-test.yml'), 'utf8');
  const signing = readFileSync(signingScript, 'utf8');
  assert.match(trigger, /verify-signing-test-identity:\s*\n\s*if: github\.event_name == 'pull_request'/);
  assert.match(trigger, /signing_test_preview: true/);
  assert.match(trigger, /build-signed-test:\s*\n\s*if: github\.event_name == 'workflow_dispatch'/);
  assert.match(trigger, /signing_test: true/);
  assert.match(trigger, /secrets\.GT_SIGNING_TEST_KEYSTORE_B64/);
  assert.match(trigger, /vars\.GT_SIGNING_TEST_CERT_SHA256/);
  assert.match(build, /GT_SIGNING_TEST_APP: \$\{\{ inputs\.signing_test == true \|\| inputs\.signing_test_preview == true \}\}/);
  assert.match(build, /python3 scripts\/prepare-gate1-build\.py --signing-test/);
  assert.match(build, /env\.GT_SIGNING_TEST_SIGNED == 'true'/);
  assert.match(build, /assembleRelease/);
  assert.match(build, /apksigner/);
  assert.match(build, /package: name='com\.gt\.soundmaster\.signingtest'/);
  assert.match(build, /application-label:'GT SoundMaster SIGN TEST'/);
  assert.match(build, /"\$APKSIGNER" verify --print-certs "\$APK" \|\s*\n\s*python3 scripts\/verify-signing-test-cert-output\.py/);
  assert.match(build, /set -euo pipefail/);
  assert.doesNotMatch(build, /ACTUAL.*EXPECTED/);
  assert.doesNotMatch(build, /sed -n 's\/\^Signer #1 certificate SHA-256 digest/);
  assert.match(build, /env\.GT_GATE1_ISOLATED != 'true' && env\.GT_SIGNING_TEST_APP != 'true'/);
  assert.match(build, /if: github\.event_name == 'workflow_dispatch' && env\.GT_SIGNING_TEST_SIGNED == 'true'/);
  assert.match(build, /retention-days: 7/);
  assert.match(signing, /base64 --decode/);
  assert.match(signing, /keytool -list/);
  assert.doesNotMatch(signing, /keytool -genkey|keytool -genkeypair/);
});
