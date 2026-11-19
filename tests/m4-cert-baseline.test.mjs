import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const checker = join(root, 'scripts/check-signing-test-cert-baseline.sh');
const available = ['keytool', 'openssl', 'base64'].every(cmd =>
  spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0);

const testEnv = {
  ...process.env,
  GT_SIGNING_TEST_KEYSTORE_B64: '',
  GT_SIGNING_TEST_STORE_PASSWORD: '',
  GT_SIGNING_TEST_KEY_ALIAS: '',
  GT_SIGNING_TEST_EXPECTED_CERT: ''
};

function run(env) {
  return spawnSync('bash', [checker], { env, encoding: 'utf8' });
}

test('certificate baseline refuses missing signing-test configuration without disclosing credentials', () => {
  const result = run({ ...testEnv, RUNNER_TEMP: tmpdir() });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing required signing-test configuration/);
});

test('certificate baseline independently checks test key and expected public fingerprint (no APK)',
  { skip: !available && 'Requires Java keytool, OpenSSL and base64' }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'gt-cert-baseline-'));
    const alias = 'disposable_cert_fixture';
    const password = 'example-test-key-strong-password';
    const p12 = join(dir, 'test.p12');
    try {
      execFileSync('keytool', [
        '-genkeypair', '-keystore', p12, '-storetype', 'PKCS12',
        '-alias', alias, '-keyalg', 'RSA', '-keysize', '2048', '-validity', '2',
        '-dname', 'CN=Disposable Certificate Test',
        '-storepass:env', 'FIXTURE_PASSWORD', '-keypass:env', 'FIXTURE_PASSWORD', '-noprompt'
      ], { env: { ...process.env, FIXTURE_PASSWORD: password }, stdio: 'pipe' });
      const keytoolText = execFileSync('keytool', [
        '-list', '-v', '-keystore', p12, '-storetype', 'PKCS12', '-alias', alias,
        '-storepass:env', 'FIXTURE_PASSWORD'
      ], { env: { ...process.env, FIXTURE_PASSWORD: password }, encoding: 'utf8' });
      const match = keytoolText.match(/^\s*SHA256:\s*([0-9A-F:]+)/im);
      assert.ok(match, 'keytool provided a SHA-256 certificate fingerprint');
      const fingerprint = match[1].replaceAll(':', '').toLowerCase();
      const env = {
        ...testEnv, RUNNER_TEMP: dir,
        GT_SIGNING_TEST_KEYSTORE_B64: readFileSync(p12).toString('base64'),
        GT_SIGNING_TEST_STORE_PASSWORD: password,
        GT_SIGNING_TEST_KEY_ALIAS: alias,
        GT_SIGNING_TEST_EXPECTED_CERT: match[1] // uppercase, colon-separated accepted
      };
      const pass = run(env);
      assert.equal(pass.status, 0, `Expected PASS; stderr: ${pass.stderr}`);
      assert.match(pass.stdout, /BASELINE PASS/);
      assert.doesNotMatch(pass.stdout + pass.stderr, new RegExp(fingerprint, 'i'));
      assert.doesNotMatch(pass.stdout + pass.stderr, /example-test-key-strong-password/);

      const mismatch = run({ ...env, GT_SIGNING_TEST_EXPECTED_CERT: 'f'.repeat(64) });
      assert.notEqual(mismatch.status, 0);
      assert.match(mismatch.stderr, /BASELINE MISMATCH/);
      assert.doesNotMatch(mismatch.stdout + mismatch.stderr, new RegExp(fingerprint, 'i'));
      assert.doesNotMatch(mismatch.stdout + mismatch.stderr, /example-test-key-strong-password/);

      const badPassword = run({ ...env, GT_SIGNING_TEST_STORE_PASSWORD: 'wrong-test-password' });
      assert.notEqual(badPassword.status, 0);
      assert.match(badPassword.stderr, /password, alias, or file is invalid/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

test('manual diagnostic cannot dispatch an APK build and is excluded from APK PR build path filters', () => {
  const diagnostic = readFileSync(join(root, '.github/workflows/m4-cert-baseline.yml'), 'utf8');
  const android = readFileSync(join(root, '.github/workflows/build-apk.yml'), 'utf8');
  const signing = readFileSync(join(root, '.github/workflows/m4-signing-test.yml'), 'utf8');
  assert.match(diagnostic, /workflow_dispatch:/);
  assert.doesNotMatch(diagnostic, /pull_request:|push:/);
  assert.doesNotMatch(diagnostic, /assembleRelease|assembleDebug|gradlew|upload-artifact/);
  assert.match(diagnostic, /permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(android, /m4-cert-baseline\.yml|check-signing-test-cert-baseline\.sh|m4-cert-baseline\.test\.mjs/);
  assert.doesNotMatch(signing, /m4-cert-baseline\.yml|check-signing-test-cert-baseline\.sh|m4-cert-baseline\.test\.mjs/);
});
